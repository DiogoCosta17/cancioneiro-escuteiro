import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, CheckCircle2, AlertCircle, ArrowLeft, Mail, Eye, EyeOff } from 'lucide-react';

export default function SetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => (!supabase ? 'Supabase não está configurado.' : null));
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(() => Boolean(supabase));
  const [isRecoveryLink, setIsRecoveryLink] = useState(() => window.location.hash.includes('type=recovery'));
  const navigate = useNavigate();

  useEffect(() => {
    const client = supabase;
    if (!client) {
      return;
    }

    let active = true;
    const hash = window.location.hash;
    const hasTokenInUrl = hash.includes('access_token');

    const onValidSession = (email: string) => {
      if (!active) return;
      setUserEmail(email);
      setError(null);
      setChecking(false);
    };

    // Escutar a troca de autenticação (o Supabase lê o token do hash do link)
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setIsRecoveryLink(true);
      if (session?.user?.email) {
        onValidSession(session.user.email);
      } else if (event === 'SIGNED_OUT') {
        setError('O link expirou ou é inválido. Pede um novo convite ao responsável ou usa "Esqueci-me da palavra-passe" no login.');
        setChecking(false);
      }
    });

    // Verificar se já existe uma sessão ativa (o Supabase pode já ter lido o token)
    client.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) onValidSession(session.user.email);
    }).catch(() => {
      // Os temporizadores abaixo tratam da falha
    });

    // Sem token no URL nem sessão: bloquear acesso direto após 1.5s
    const directAccessTimer = setTimeout(() => {
      if (hasTokenInUrl || hash.includes('type=')) return;
      client.auth.getSession().then(({ data: { session } }) => {
        if (active && !session) {
          setError('Acesso restrito: Esta página só pode ser acedida através do link de convite ou de recuperação enviado para o teu email.');
          setChecking(false);
        }
      }).catch(() => {});
    }, 1500);

    // Token no URL mas inválido/expirado: não deixar o spinner infinito
    const finalTimer = setTimeout(() => {
      client.auth.getSession().then(({ data: { session } }) => {
        if (active && !session) {
          setError('O link expirou ou é inválido. Pede um novo convite ao responsável ou usa "Esqueci-me da palavra-passe" no login.');
          setChecking(false);
        }
      }).catch(() => {
        if (active) {
          setError('O link expirou ou é inválido. Pede um novo convite ao responsável ou usa "Esqueci-me da palavra-passe" no login.');
          setChecking(false);
        }
      });
    }, 8000);

    return () => {
      active = false;
      subscription.unsubscribe();
      clearTimeout(directAccessTimer);
      clearTimeout(finalTimer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('A palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As palavras-passe não coincidem.');
      return;
    }

    setLoading(true);

    try {
      if (!supabase) {
        throw new Error('Supabase não está configurado.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/admin');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Erro ao definir palavra-passe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md p-6 sm:p-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-gray-100 dark:border-zinc-800">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-[#2d5016]/10 text-[#2d5016] dark:text-green-400 rounded-full flex items-center justify-center mb-3">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Definir Palavra-passe</h2>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1 text-center">
            {isRecoveryLink
              ? 'Define a tua nova palavra-passe para voltares a aceder ao painel.'
              : 'Bem-vindo ao Cancioneiro do Agrupamento 488! Define a tua palavra-passe para acederes ao painel.'}
          </p>

          {/* Email da conta identificada através do link */}
          {userEmail && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/50 rounded-full text-xs text-green-800 dark:text-green-300 font-medium">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>{userEmail}</span>
            </div>
          )}
        </div>

        {checking ? (
          <div className="py-8 flex flex-col items-center justify-center text-gray-400">
            <div className="w-6 h-6 border-2 border-[#2d5016] border-t-transparent rounded-full animate-spin mb-2"></div>
            <p className="text-xs">A validar o link...</p>
          </div>
        ) : error && !userEmail ? (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
                {error}
              </div>
            </div>
            <Link
              to="/"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 font-medium rounded-xl transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar à Página Inicial
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {success ? (
              <div className="p-4 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/50 rounded-xl flex items-center gap-3 text-green-800 dark:text-green-300">
                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Palavra-passe definida com sucesso!</p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">A entrar no painel de administração...</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                    Nova Palavra-passe
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-2.5 pr-10 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-[#2d5016] focus:border-[#2d5016] outline-none transition-colors text-sm text-gray-900 dark:text-gray-100"
                      placeholder="Mínimo 6 caracteres"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
                      title={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                    Confirmar Palavra-passe
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-2.5 pr-10 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-[#2d5016] focus:border-[#2d5016] outline-none transition-colors text-sm text-gray-900 dark:text-gray-100"
                      placeholder="Repete a palavra-passe"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      tabIndex={-1}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
                      title={showConfirmPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#2d5016] hover:bg-[#3a681d] text-white font-medium rounded-xl transition-colors flex items-center justify-center disabled:opacity-70 shadow-sm mt-2 cursor-pointer"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    'Guardar e Entrar'
                  )}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
