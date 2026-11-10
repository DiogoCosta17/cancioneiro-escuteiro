import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { InviteAdmin } from './InviteAdmin';
import { 
  UserMinus, 
  Shield, 
  Edit3, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Music, 
  Send, 
  Check, 
  AlertCircle,
  Pencil,
  X,
  History
} from 'lucide-react';
import { Admin } from '../../lib/types';
import { useActivityLogs } from '../../hooks/useActivityLogs';

interface AdminListProps {
  onViewUserLogs?: (email: string) => void;
}

function formatLastSeen(dateStr?: string | null, isCurrentUser?: boolean, confirmedStr?: string | null): string {
  if (isCurrentUser) return 'Sessão ativa agora';
  const effectiveDate = dateStr || confirmedStr;
  if (!effectiveDate) return 'Nunca acedeu ao site';

  try {
    const d = new Date(effectiveDate);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 5) return 'Acedeu há instantes';
    if (diffMins < 60) return `Acedeu há ${diffMins} min`;
    if (diffHours < 24) return `Acedeu há ${diffHours}h`;
    if (diffDays === 1) return `Acedeu ontem`;
    if (diffDays < 7) return `Acedeu há ${diffDays} dias`;

    return `Último acesso a ${d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  } catch {
    return 'Data desconhecida';
  }
}

function formatJoinDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function AdminList({ onViewUserLogs }: AdminListProps = {}) {
  const { adminProfile, user, getAdmins, removeAdmin, updateAdminRole, updateAdminName, inviteAdmin } = useAuth();
  const { logAction } = useActivityLogs();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>('');
  const [savingName, setSavingName] = useState<boolean>(false);

  const loadAdmins = useCallback(async () => {
    if (adminProfile?.role === 'super_admin' && getAdmins) {
      try {
        const res = await getAdmins();
        if (res.data) setAdmins(res.data);
      } catch (error) {
        console.error('Erro ao carregar admins', error);
      } finally {
        setLoading(false);
      }
    }
  }, [adminProfile?.role, getAdmins]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  if (adminProfile?.role !== 'super_admin') {
    return <div className="text-gray-500">Acesso restrito a Super Administradores.</div>;
  }

  const handleRoleChange = async (adminId: string, newRole: 'super_admin' | 'editor') => {
    try {
      const targetAdmin = admins.find(a => a.id === adminId);
      const res = await updateAdminRole(adminId, newRole);
      if (res.error) {
        alert(res.error.message);
      } else {
        setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, role: newRole } : a));
        const oldRoleLabel = targetAdmin?.role === 'super_admin' ? 'Super Administrador' : 'Editor';
        const newRoleLabel = newRole === 'super_admin' ? 'Super Administrador' : 'Editor';
        logAction({
          action: 'admin_role_changed',
          entity_type: 'admin',
          entity_id: adminId,
          entity_title: targetAdmin?.name || targetAdmin?.email || 'Dirigente',
          details: {
            role: newRole,
            old_role: targetAdmin?.role || 'editor',
            email: targetAdmin?.email,
            changes: {
              role: {
                old: oldRoleLabel,
                new: newRoleLabel
              }
            }
          }
        });
      }
    } catch {
      alert('Erro ao atualizar cargo.');
    }
  };

  const startEditingName = (admin: Admin) => {
    setEditingAdminId(admin.id);
    setEditingNameValue(admin.name || '');
  };

  const cancelEditingName = () => {
    setEditingAdminId(null);
    setEditingNameValue('');
  };

  const handleSaveName = async (adminId: string) => {
    const trimmed = editingNameValue.trim();
    if (!trimmed) return;
    const adminToEdit = admins.find(a => a.id === adminId);
    setSavingName(true);
    try {
      if (updateAdminName) {
        const res = await updateAdminName(adminId, trimmed);
        if (res.error) {
          alert(res.error.message);
        } else {
          setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, name: trimmed } : a));
          setEditingAdminId(null);
          const oldName = adminToEdit?.name || '(Sem nome)';
          logAction({
            action: 'admin_renamed',
            entity_type: 'admin',
            entity_id: adminId,
            entity_title: trimmed,
            details: {
              old_name: adminToEdit?.name || null,
              new_name: trimmed,
              email: adminToEdit?.email,
              changes: {
                name: {
                  old: oldName,
                  new: trimmed
                }
              }
            }
          });
        }
      }
    } catch {
      alert('Erro ao guardar o novo nome.');
    } finally {
      setSavingName(false);
    }
  };

  const handleResendInvite = async (admin: Admin) => {
    if (!inviteAdmin) return;
    setResendingEmail(admin.email);
    setResendNotice(null);
    try {
      const { error } = await inviteAdmin(admin.email, admin.role, admin.name);
      if (error) {
        setResendNotice({ 
          type: 'error', 
          text: `Erro ao reenviar convite: ${error.message}` 
        });
      } else {
        setResendNotice({ 
          type: 'success', 
          text: `Novo email com link de convite reenviado com sucesso para ${admin.name || admin.email}!` 
        });
      }
    } catch {
      setResendNotice({ type: 'error', text: 'Não foi possível reenviar o convite.' });
    } finally {
      setResendingEmail(null);
    }
  };

  const handleRemove = async (admin: Admin) => {
    const isSelf = user?.id === admin.user_id || user?.id === admin.id;
    if (isSelf) {
      alert('Não pode remover a sua própria conta de administrador.');
      return;
    }

    if (window.confirm(`Tem a certeza que deseja remover o acesso de ${admin.name || admin.email}?`)) {
      try {
        if (removeAdmin) {
          const res = await removeAdmin(admin.id);
          if (res.error) {
            alert(res.error.message);
          } else {
            setAdmins(prev => prev.filter(a => a.id !== admin.id));
            logAction({
              action: 'admin_removed',
              entity_type: 'admin',
              entity_id: admin.id,
              entity_title: admin.name || admin.email,
              details: { email: admin.email, role: admin.role }
            });
          }
        }
      } catch {
        alert('Erro ao remover administrador.');
      }
    }
  };

  return (
    <div>
      <InviteAdmin onSuccess={loadAdmins} />

      {resendNotice && (
        <div className={`mb-6 p-4 rounded-xl border text-sm flex items-start justify-between gap-3 shadow-xs ${
          resendNotice.type === 'success' 
            ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' 
            : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
        }`}>
          <div className="flex items-center gap-2">
            {resendNotice.type === 'success' ? (
              <Check className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            )}
            <span>{resendNotice.text}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setResendNotice(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 shadow-sm overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">
            Administradores & Dirigentes Autorizados ({admins.length})
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Gestão de permissões de acesso
          </span>
        </div>

        <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
          {loading ? (
            <li className="p-8 text-center text-gray-400">A carregar administradores...</li>
          ) : admins.length === 0 ? (
            <li className="p-8 text-center text-gray-500">Nenhum administrador encontrado.</li>
          ) : (
            admins.map((admin) => {
              const isCurrentUser = user?.id === admin.user_id || user?.id === admin.id;
              // O dirigente só é considerado verdadeiramente Ativo se já tiver efetuado login no sistema ou confirmado conta
              const hasLoggedIn = isCurrentUser || !!admin.last_sign_in_at || !!admin.confirmed_at;

              return (
                <li key={admin.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/70 dark:hover:bg-zinc-800/40 transition-colors">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border ${
                      admin.role === 'super_admin' 
                        ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' 
                        : hasLoggedIn 
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}>
                      {(admin.name || admin.email).charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {editingAdminId === admin.id ? (
                          <form 
                            onSubmit={(e) => { e.preventDefault(); handleSaveName(admin.id); }}
                            className="flex items-center gap-1.5"
                          >
                            <input
                              type="text"
                              value={editingNameValue}
                              onChange={(e) => setEditingNameValue(e.target.value)}
                              autoFocus
                              placeholder="Nome do dirigente..."
                              className="text-xs sm:text-sm font-semibold px-2.5 py-1 rounded-lg border border-green-500 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500 w-40 sm:w-56 shadow-xs"
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') cancelEditingName();
                              }}
                            />
                            <button
                              type="submit"
                              disabled={savingName || !editingNameValue.trim()}
                              className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                              title="Guardar nome"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingName}
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
                              title="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-1.5 group/name">
                            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {admin.name || admin.email}
                            </span>
                            <button
                              type="button"
                              onClick={() => startEditingName(admin)}
                              className="p-1 text-gray-400 hover:text-green-600 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                              title="Alterar nome"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {isCurrentUser && (
                          <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-full font-medium border border-gray-200 dark:border-zinc-700">
                            Tu
                          </span>
                        )}

                        {hasLoggedIn ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/80">
                            <CheckCircle2 className="w-3 h-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-800" title="O convite foi enviado por email mas o dirigente ainda não efetuou o 1.º login">
                            <Clock className="w-3 h-3 text-amber-600" /> Aguarda 1.º login
                          </span>
                        )}
                      </div>

                      {/* Informações detalhadas e úteis sobre o dirigente */}
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-y-1 gap-x-3 mt-1.5">
                        <span className="text-gray-600 dark:text-gray-300 font-mono text-[11px] sm:text-xs">
                          {admin.email}
                        </span>

                        <span>•</span>

                        {/* Estado do Último Login */}
                        <span className={`inline-flex items-center gap-1 ${
                          hasLoggedIn ? 'text-gray-600 dark:text-gray-400' : 'text-amber-700 dark:text-amber-400 font-medium'
                        }`}>
                          <Clock className="w-3 h-3 opacity-70" />
                          <span>{formatLastSeen(admin.last_sign_in_at, isCurrentUser, admin.confirmed_at)}</span>
                        </span>

                        {/* Data em que foi adicionado/convidado */}
                        {admin.created_at && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                              <Calendar className="w-3 h-3 opacity-70" />
                              <span>Convidado a {formatJoinDate(admin.created_at)}</span>
                            </span>
                          </>
                        )}

                        {/* Contagem de cânticos criados */}
                        {admin.songs_count !== undefined && (
                          <>
                            <span>•</span>
                            {onViewUserLogs ? (
                              <button
                                type="button"
                                onClick={() => onViewUserLogs(admin.email)}
                                className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300 font-medium hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
                                title={`Ver histórico de ${admin.name || admin.email}`}
                              >
                                <Music className="w-3 h-3 text-[#2d5016] dark:text-green-400" />
                                <span>{admin.songs_count} {admin.songs_count === 1 ? 'música adicionada' : 'músicas adicionadas'}</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300 font-medium">
                                <Music className="w-3 h-3 text-[#2d5016] dark:text-green-400" />
                                <span>{admin.songs_count} {admin.songs_count === 1 ? 'música adicionada' : 'músicas adicionadas'}</span>
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações: Histórico, Reenviar Convite, Alterar Cargo e Remover */}
                  <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-auto shrink-0">
                    {/* Botão de Histórico de Atividade */}
                    {onViewUserLogs && (
                      <button
                        type="button"
                        onClick={() => onViewUserLogs(admin.email)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 rounded-lg transition-colors cursor-pointer"
                        title={`Ver histórico de atividade de ${admin.name || admin.email}`}
                      >
                        <History className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span className="hidden sm:inline">Histórico</span>
                      </button>
                    )}

                    {/* Botão de Reenviar Convite para dirigentes pendentes */}
                    {!hasLoggedIn && !isCurrentUser && (
                      <button
                        type="button"
                        onClick={() => handleResendInvite(admin)}
                        disabled={resendingEmail === admin.email}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        title="Reenviar email de convite com novo link de acesso"
                      >
                        {resendingEmail === admin.email ? (
                          <>
                            <div className="w-3 h-3 border-2 border-amber-700 border-t-transparent rounded-full animate-spin" />
                            <span>A reenviar...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span>Reenviar Convite</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Role selector */}
                    <div className="flex items-center">
                      {isCurrentUser ? (
                        <span className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                          admin.role === 'super_admin' 
                            ? 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800' 
                            : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                        }`}>
                          {admin.role === 'super_admin' ? (
                            <><Shield className="w-3.5 h-3.5 mr-1" /> Super Admin</>
                          ) : (
                            <><Edit3 className="w-3.5 h-3.5 mr-1" /> Editor</>
                          )}
                        </span>
                      ) : (
                        <select
                          value={admin.role}
                          onChange={(e) => handleRoleChange(admin.id, e.target.value as 'super_admin' | 'editor')}
                          className="text-xs font-semibold rounded-lg border-gray-300 dark:border-zinc-700 shadow-xs focus:border-green-600 focus:ring-green-600 py-1.5 px-2.5 border bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 cursor-pointer"
                        >
                          <option value="editor">Editor</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      )}
                    </div>

                    {!isCurrentUser && (
                      <button
                        onClick={() => handleRemove(admin)}
                        className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        title="Remover acesso deste administrador"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
