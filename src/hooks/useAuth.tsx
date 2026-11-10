import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Admin } from '../lib/types';
import { User as SupabaseUser } from '@supabase/supabase-js';

export interface AuthContextType {
  user: SupabaseUser | null;
  adminProfile: Admin | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ error: Error | null }>;
  logout: () => Promise<{ error: Error | null }>;
  inviteAdmin: (email: string, role: 'super_admin' | 'editor', name?: string) => Promise<{ error: Error | null }>;
  updateAdminRole: (id: string, role: 'super_admin' | 'editor') => Promise<{ error: Error | null }>;
  updateAdminName: (id: string, name: string) => Promise<{ error: Error | null }>;
  getAdmins: () => Promise<{ data: Admin[] | null; error: Error | null }>;
  removeAdmin: (id: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Chave partilhada com o SessionTimeoutHandler (última atividade do utilizador)
export const ACTIVITY_STORAGE_KEY = 'scout_last_activity_timestamp';
export const ADMIN_PROFILE_STORAGE_KEY = 'scout_cached_admin_profile';

function clearActivityTimestamp() {
  try {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY);
  } catch {
    // Ignora erro de storage
  }
}

function getStoredAdminProfile(): { profile: Admin; userId: string; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(ADMIN_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.profile && parsed.userId) {
      return parsed;
    }
  } catch (e) {
    console.warn('Erro ao ler perfil admin do storage:', e);
  }
  return null;
}

function setStoredAdminProfile(profile: Admin | null, userId?: string) {
  try {
    if (!profile || !userId) {
      localStorage.removeItem(ADMIN_PROFILE_STORAGE_KEY);
    } else {
      localStorage.setItem(
        ADMIN_PROFILE_STORAGE_KEY,
        JSON.stringify({ profile, userId, timestamp: Date.now() })
      );
    }
  } catch (e) {
    console.warn('Erro ao guardar perfil admin no storage:', e);
  }
}

async function withTimeout<T>(
  promiseOrFactory: PromiseLike<T> | (() => PromiseLike<T>),
  ms = 3500,
  errorMessage = 'Tempo limite de ligação excedido'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);
  });

  try {
    const promise = typeof promiseOrFactory === 'function' ? promiseOrFactory() : promiseOrFactory;
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [adminProfile, setAdminProfile] = useState<Admin | null>(() => getStoredAdminProfile()?.profile || null);
  const [loading, setLoading] = useState(Boolean(supabase));
  // Id do utilizador atual: resultados assíncronos de outro utilizador (ou após logout) são descartados
  const currentUserIdRef = useRef<string | null>(null);

  // Mantém a mesma referência de utilizador enquanto nada relevante mudou (ex.: refresh do token)
  const applyUser = useCallback((next: SupabaseUser | null) => {
    currentUserIdRef.current = next?.id ?? null;
    setUser((prev) => {
      if (
        prev && next &&
        prev.id === next.id &&
        prev.email === next.email &&
        prev.updated_at === next.updated_at
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const checkAdminStatus = useCallback(async (userObj: SupabaseUser) => {
    const isStale = () => currentUserIdRef.current !== userObj.id;
    const stored = getStoredAdminProfile();
    const cachedForUser = (stored && stored.userId === userObj.id) ? stored.profile : null;

    if (!supabase) {
      setAdminProfile(cachedForUser);
      setLoading(false);
      return;
    }

    // Perfil inicial vindo do storage só vale se pertencer a este utilizador
    setAdminProfile((prev) =>
      prev && (prev.user_id === userObj.id || prev.id === userObj.id) ? prev : cachedForUser
    );

    try {
      const timeoutMessage = 'Tempo limite ao verificar permissões de administrador';
      let result = await withTimeout(
        supabase.from('admins').select('*').or(`id.eq.${userObj.id},user_id.eq.${userObj.id}`).maybeSingle(),
        3500,
        timeoutMessage
      );

      // Convite ainda não associado à conta: procurar pelo email, sem distinguir maiúsculas.
      // Num filtro ILIKE, "_" e "%" são curingas: escapá-los para corresponder só ao email exato.
      if (!result.error && !result.data && userObj.email) {
        const escapedEmail = userObj.email.replace(/[\\%_]/g, '\\$&');
        result = await withTimeout(
          supabase.from('admins').select('*').ilike('email', escapedEmail).maybeSingle(),
          3500,
          timeoutMessage
        );
      }

      if (isStale()) return;

      const { data, error } = result;
      
      if (!error && data) {
        const updatePayload: Record<string, any> = {};
        if (data.user_id !== userObj.id) {
          updatePayload.user_id = userObj.id;
          data.user_id = userObj.id;
        }

        // Sincronizar carimbo de data/hora do login do utilizador na tabela admins
        const signInTime = userObj.last_sign_in_at || new Date().toISOString();
        if (data.last_sign_in_at !== signInTime) {
          updatePayload.last_sign_in_at = signInTime;
          data.last_sign_in_at = signInTime;
        }

        if (Object.keys(updatePayload).length > 0) {
          try {
            await supabase
              .from('admins')
              .update(updatePayload)
              .eq('id', data.id);
          } catch {
            // Handled or will be updated by DB trigger
          }
          if (isStale()) return;
        }
        const profile = data as Admin;
        setAdminProfile(profile);
        setStoredAdminProfile(profile, userObj.id);
      } else if (!error && !data) {
        setAdminProfile(null);
        setStoredAdminProfile(null);
      } else if (error) {
        console.warn('Erro ao consultar tabela admins, a preservar perfil em cache se disponível:', error);
        if (cachedForUser) {
          setAdminProfile(cachedForUser);
        } else {
          setAdminProfile(null);
        }
      }
    } catch (error) {
      if (isStale()) return;
      console.warn('Falha de rede/timeout ao verificar admin, a preservar cache offline:', error);
      if (cachedForUser) {
        setAdminProfile(cachedForUser);
      } else {
        setAdminProfile(null);
      }
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const client = supabase;

    // Get initial session
    client.auth.getSession()
      .then(({ data: { session } }) => {
        applyUser(session?.user ?? null);
        if (session?.user) {
          checkAdminStatus(session.user);
        } else {
          setAdminProfile(null);
          setStoredAdminProfile(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Erro ao verificar sessão local:', err);
        setLoading(false);
      });

    // Listen for auth changes
    const { data: { subscription } } = client.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          clearActivityTimestamp();
          setStoredAdminProfile(null);
        }
        applyUser(session?.user ?? null);
        if (session?.user) {
          checkAdminStatus(session.user);
        } else {
          setAdminProfile(null);
          setStoredAdminProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [applyUser, checkAdminStatus]);

  const login = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase not initialized') };

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (!error) {
      // Novo login = nova janela de inatividade (evita herdar um carimbo antigo)
      try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, Date.now().toString());
      } catch {
        // Ignora erro de storage
      }
    }
    return { error: error ? new Error(error.message) : null };
  }, []);

  const logout = useCallback(async () => {
    if (!supabase) return { error: new Error('Supabase not initialized') };

    clearActivityTimestamp();
    currentUserIdRef.current = null;
    setStoredAdminProfile(null);
    setAdminProfile(null);
    let { error } = await supabase.auth.signOut();
    if (error) {
      // Se o servidor falhar (ex: offline), termina pelo menos a sessão local
      const local = await supabase.auth.signOut({ scope: 'local' });
      error = local.error;
    }
    return { error: error ? new Error(error.message) : null };
  }, []);

  const inviteAdmin = useCallback(async (email: string, role: 'super_admin' | 'editor', name?: string) => {
    if (!supabase) return { error: new Error('Supabase not initialized') };

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name?.trim() || cleanEmail.split('@')[0];
    const redirectTo = `${window.location.origin}/set-password`;

    try {
      // Invoke the Supabase Edge Function to send the real invite email
      const { data, error: funcError } = await supabase.functions.invoke('invite-admin', {
        body: {
          email: cleanEmail,
          name: cleanName,
          role,
          redirectTo,
        },
      });

      if (funcError) {
        // If Edge Function returned an error, try to extract the specific message
        let errorMessage = funcError.message;
        try {
          // Sometimes the context contains the raw JSON response body
          if (funcError.context && funcError.context.json) {
            const errBody = await funcError.context.json();
            if (errBody && errBody.error) {
              errorMessage = errBody.error;
            }
          }
        } catch {
          // ignore parsing error
        }

        return { 
          error: new Error(
            errorMessage === 'Edge Function returned a non-2xx status code' 
              ? 'O servidor rejeitou o envio. Verifica se o URL deste site (Vercel) está adicionado aos "Redirect URLs" no Supabase.'
              : errorMessage
          ) 
        };
      }

      if (data && data.error) {
        return { error: new Error(data.error) };
      }

      return { error: null };
    } catch (err: any) {
      return { 
        error: new Error(
          err.message || 'Erro ao comunicar com o servidor de convites. Verifica se a Edge Function invite-admin está publicada.'
        ) 
      };
    }
  }, []);

  const updateAdminRole = useCallback(async (id: string, role: 'super_admin' | 'editor') => {
    if (!supabase) return { error: new Error('Supabase not initialized') };

    const { error } = await supabase
      .from('admins')
      .update({ role })
      .eq('id', id);

    return { error: error ? new Error(error.message) : null };
  }, []);

  const updateAdminName = useCallback(async (id: string, name: string) => {
    if (!supabase) return { error: new Error('Supabase not initialized') };

    const cleanName = name.trim();
    if (!cleanName) return { error: new Error('O nome não pode estar vazio.') };

    const { error } = await supabase
      .from('admins')
      .update({ name: cleanName })
      .eq('id', id);

    return { error: error ? new Error(error.message) : null };
  }, []);

  const getAdmins = useCallback(async () => {
    if (!supabase) return { data: null, error: new Error('Supabase not initialized') };

    // Tentar obter dados enriquecidos via RPC (último login, estado de ativação e contagem de músicas)
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_admins_overview');

    if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
      return { data: rpcData as Admin[], error: null };
    }

    if (rpcError) {
      console.warn('RPC get_admins_overview notice (a utilizar consulta direta):', rpcError.message);
    }

    // Fallback: consulta direta à tabela admins
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .order('created_at', { ascending: false });

    // Enriquecer fallback com contagem de cânticos
    if (data && Array.isArray(data)) {
      try {
        const { data: songsData } = await supabase.from('songs').select('created_by');
        if (songsData) {
          const countMap = new Map<string, number>();
          for (const s of songsData) {
            if (s.created_by) {
              countMap.set(s.created_by, (countMap.get(s.created_by) || 0) + 1);
            }
          }
          for (const admin of data) {
            const countByUserId = admin.user_id ? (countMap.get(admin.user_id) || 0) : 0;
            const countById = (admin.id && admin.id !== admin.user_id) ? (countMap.get(admin.id) || 0) : 0;
            admin.songs_count = countByUserId + countById;
          }
        }
      } catch {
        // Ignora erro secundário de contagem
      }
    }

    return { data: data as Admin[] | null, error: error ? new Error(error.message) : null };
  }, []);

  const removeAdmin = useCallback(async (id: string) => {
    if (!supabase) return { error: new Error('Supabase not initialized') };

    const { error } = await supabase
      .from('admins')
      .delete()
      .eq('id', id);

    return { error: error ? new Error(error.message) : null };
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      adminProfile,
      loading,
      isAdmin: !!adminProfile,
      login,
      logout,
      inviteAdmin,
      updateAdminRole,
      updateAdminName,
      getAdmins,
      removeAdmin,
    }),
    [user, adminProfile, loading, login, logout, inviteAdmin, updateAdminRole, updateAdminName, getAdmins, removeAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
