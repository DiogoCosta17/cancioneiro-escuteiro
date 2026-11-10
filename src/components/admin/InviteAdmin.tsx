import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useActivityLogs } from '../../hooks/useActivityLogs';
import { Mail, CheckCircle, AlertCircle, Send } from 'lucide-react';

interface InviteAdminProps {
  onSuccess?: () => void;
}

export function InviteAdmin({ onSuccess }: InviteAdminProps) {
  const { inviteAdmin, adminProfile } = useAuth();
  const { logAction } = useActivityLogs();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'super_admin' | 'editor'>('editor');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  if (adminProfile?.role !== 'super_admin') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await inviteAdmin(email, inviteRole, name);
      if (error) {
        let errorMsg = error.message;
        if (/rate limit/i.test(errorMsg)) {
          errorMsg = 'Limite temporário de emails atingido no Supabase (o serviço de email gratuito do Supabase tem um limite de proteção de cerca de 3 a 4 convites por hora). Aguarda cerca de 1 hora para o limite reiniciar, ou ativa um fornecedor SMTP próprio nas definições do teu projeto Supabase para envios ilimitados.';
        }
        setMessage({ type: 'error', text: errorMsg });
      } else {
        setMessage({ 
          type: 'success', 
          text: `Convite enviado por email para ${email}! O dirigente receberá uma mensagem para definir a sua palavra-passe.` 
        });
        logAction({
          action: 'admin_invited',
          entity_type: 'admin',
          entity_title: name ? `${name} (${email})` : email,
          details: { email, role: inviteRole, name: name || null }
        });
        setEmail('');
        setName('');
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao enviar convite.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 mb-8">
      <div className="flex items-center gap-2 mb-2">
        <Mail className="w-5 h-5 text-scout-green" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Convidar Administrador por Email</h3>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        O sistema envia um email com o link de convite. O convidado clica no link, define a sua palavra-passe e entra diretamente no painel.
      </p>

      {message && (
        <div
          className={`mb-5 p-3.5 rounded-lg text-sm flex items-start gap-2.5 ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
        <div className="sm:col-span-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
            Nome do Convidado (aparece no email)
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border-gray-300 dark:border-zinc-700 shadow-sm focus:border-scout-green focus:ring-scout-green p-2.5 border text-sm"
            placeholder="Ex: Chefe João"
          />
        </div>

        <div className="sm:col-span-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
            Email de Destino *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border-gray-300 dark:border-zinc-700 shadow-sm focus:border-scout-green focus:ring-scout-green p-2.5 border text-sm"
            placeholder="dirigente@agrupamento488.pt"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
            Função
          </label>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'super_admin' | 'editor')}
            className="w-full rounded-lg border-gray-300 dark:border-zinc-700 shadow-sm focus:border-scout-green focus:ring-scout-green p-2.5 border text-sm bg-white dark:bg-zinc-900"
          >
            <option value="editor">Editor</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-scout-green text-white font-medium text-sm rounded-lg hover:bg-scout-green/90 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Enviar Convite</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
