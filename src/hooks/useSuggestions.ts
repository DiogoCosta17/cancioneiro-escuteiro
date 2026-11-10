import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SongSuggestion, SongSuggestionFormData } from '../lib/types';
import { useAuth } from './useAuth';

export function useSuggestions() {
  const { user, adminProfile } = useAuth();
  const [suggestions, setSuggestions] = useState<SongSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSuggestions = useCallback(async () => {
    // Only fetch suggestions if user is authenticated admin (RLS protects it anyway)
    if (!supabase || !user) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from('song_suggestions')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchErr) {
        throw new Error(fetchErr.message);
      }

      setSuggestions(data || []);
    } catch (err: any) {
      console.error('Error fetching suggestions:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && adminProfile) {
      fetchSuggestions();
    }
  }, [user, adminProfile, fetchSuggestions]);

  const submitSuggestion = async (data: SongSuggestionFormData): Promise<{ success: boolean; error: Error | null }> => {
    if (!supabase) {
      return { success: false, error: new Error('Ligação à base de dados não disponível.') };
    }

    if (!data.title || !data.title.trim()) {
      return { success: false, error: new Error('O nome do cântico é obrigatório.') };
    }

    // Normalizar e limitar os campos aqui também (não depender apenas do formulário)
    const clean = (value: string | undefined, max: number) => value?.trim().slice(0, max) || null;
    const cleanUrl = (value: string | undefined) => {
      const url = clean(value, 300);
      return url && /^https?:\/\//i.test(url) ? url : null;
    };

    try {
      const { error: insertErr } = await supabase
        .from('song_suggestions')
        .insert([
          {
            title: data.title.trim().slice(0, 150),
            youtube_url: cleanUrl(data.youtube_url),
            chords_url: cleanUrl(data.chords_url),
            notes: clean(data.notes, 1000),
            suggested_by_name: clean(data.suggested_by_name, 100),
            status: 'pending',
          },
        ]);

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      // If admin is viewing, refresh list
      if (user && adminProfile) {
        fetchSuggestions();
      }

      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error submitting suggestion:', err);
      return { success: false, error: err };
    }
  };

  const toggleImplemented = async (
    id: string,
    currentStatus: 'pending' | 'implemented',
    adminName?: string
  ): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase não inicializado') };
    }

    const nextStatus = currentStatus === 'pending' ? 'implemented' : 'pending';
    const implementedAt = nextStatus === 'implemented' ? new Date().toISOString() : null;
    const implementedBy = nextStatus === 'implemented' ? (adminName || user?.email || 'Dirigente') : null;

    try {
      const { error: updateErr } = await supabase
        .from('song_suggestions')
        .update({
          status: nextStatus,
          implemented_at: implementedAt,
          implemented_by: implementedBy,
        })
        .eq('id', id);

      if (updateErr) {
        throw new Error(updateErr.message);
      }

      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, status: nextStatus, implemented_at: implementedAt, implemented_by: implementedBy }
            : s
        )
      );

      return { error: null };
    } catch (err: any) {
      console.error('Error updating suggestion status:', err);
      return { error: err };
    }
  };

  const deleteSuggestion = async (id: string): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase não inicializado') };
    }

    try {
      const { error: delErr } = await supabase
        .from('song_suggestions')
        .delete()
        .eq('id', id);

      if (delErr) {
        throw new Error(delErr.message);
      }

      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      return { error: null };
    } catch (err: any) {
      console.error('Error deleting suggestion:', err);
      return { error: err };
    }
  };

  const pendingCount = suggestions.filter((s) => s.status === 'pending').length;
  const implementedCount = suggestions.filter((s) => s.status === 'implemented').length;

  return {
    suggestions,
    loading,
    error,
    pendingCount,
    implementedCount,
    fetchSuggestions,
    submitSuggestion,
    toggleImplemented,
    deleteSuggestion,
  };
}
