import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ActivityLog } from '../lib/types';
import { useAuth } from './useAuth';

export function useActivityLogs() {
  const { adminProfile, user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLogs = useCallback(async () => {
    if (adminProfile?.role !== 'super_admin' || !supabase) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (err) throw err;
      setLogs((data as ActivityLog[]) || []);
      setError(null);
    } catch (e: any) {
      console.warn('Erro ao carregar histórico de atividades:', e);
      setError(e instanceof Error ? e : new Error('Erro ao carregar histórico'));
    } finally {
      setLoading(false);
    }
  }, [adminProfile?.role]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Função auxiliar para registar ações adicionais (ex: sugestões, gestão de administradores)
  const logAction = async (params: {
    action: string;
    entity_type: 'song' | 'event' | 'suggestion' | 'admin';
    entity_title: string;
    entity_id?: string;
    details?: Record<string, any>;
  }) => {
    if (!supabase || !user) return;

    try {
      const userName = adminProfile?.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Dirigente';
      const userEmail = user.email || 'desconhecido';

      // Sem .select(): o RETURNING exige permissão de leitura, que só o super_admin tem,
      // e fazia falhar o registo das ações dos editores.
      const { error: err } = await supabase
        .from('activity_logs')
        .insert([{
          user_id: user.id,
          user_name: userName,
          user_email: userEmail,
          action: params.action,
          entity_type: params.entity_type,
          entity_id: params.entity_id || null,
          entity_title: params.entity_title,
          details: params.details || {}
        }]);

      if (err) throw err;
      // Só o super_admin vê o histórico: recarregar para mostrar o novo registo
      if (adminProfile?.role === 'super_admin') {
        await fetchLogs();
      }
    } catch (e) {
      console.warn('Não foi possível registar log de atividade:', e);
    }
  };

  const clearLogs = async () => {
    if (adminProfile?.role !== 'super_admin' || !supabase) {
      throw new Error('Apenas Super Administradores têm permissão para limpar o histórico.');
    }

    try {
      // 1. Tentar chamar a RPC se instalada
      const { error: rpcErr } = await supabase.rpc('clear_activity_logs');

      if (rpcErr) {
        // 2. Se a RPC não estiver disponível, tenta apagar diretamente através de DELETE na tabela
        const { error: delErr } = await supabase
          .from('activity_logs')
          .delete()
          .not('id', 'is', null);

        if (delErr) {
          throw new Error(`Não foi possível limpar o histórico: ${delErr.message}`);
        }
      }

      setLogs([]);
      setError(null);
    } catch (e: any) {
      console.error('Erro ao limpar histórico de registos:', e);
      throw e;
    }
  };

  const deleteLog = async (logId: string) => {
    if (adminProfile?.role !== 'super_admin' || !supabase) {
      throw new Error('Apenas Super Administradores têm permissão para eliminar registos.');
    }

    try {
      const { error: delErr } = await supabase
        .from('activity_logs')
        .delete()
        .eq('id', logId);

      if (delErr) {
        throw new Error(`Não foi possível eliminar o registo: ${delErr.message}`);
      }

      setLogs(prev => prev.filter(l => l.id !== logId));
    } catch (e: any) {
      console.error('Erro ao eliminar registo:', e);
      throw e;
    }
  };

  return {
    logs,
    loading,
    error,
    refetch: fetchLogs,
    logAction,
    clearLogs,
    deleteLog
  };
}
