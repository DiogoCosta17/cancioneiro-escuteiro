import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEvents } from '../../hooks/useEvents';
import { parseEventDate } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import { Calendar, MapPin, Plus, Edit, Trash2, Copy } from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';

export const AdminEvents: React.FC = () => {
  const { events, loading, refetch } = useEvents();
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteEventId) return;
    try {
      const { error } = await supabase!.from('events').delete().eq('id', deleteEventId);
      if (error) throw error;
      refetch();
    } catch (err) {
      console.error(err);
      alert('Não foi possível eliminar o evento.');
    } finally {
      setDeleteEventId(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">A carregar eventos...</div>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Eventos Oficiais</h2>
          <p className="text-xs text-gray-500 mt-0.5">{events.length} celebrações agendadas</p>
        </div>
        <Link
          to="/admin/events/new"
          className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-transparent rounded-xl shadow-sm text-xs sm:text-sm font-bold text-white bg-[#2d5016] hover:bg-[#3a681d] transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-1.5 shrink-0" />
          Criar Evento
        </Link>
      </div>

      <div className="bg-white dark:bg-zinc-900 shadow-sm rounded-xl sm:rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
        <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
          {events.length === 0 ? (
            <li className="px-6 py-12 text-center text-gray-500 text-sm">
              Ainda não tens eventos criados. Clica em "Criar Evento" para começares!
            </li>
          ) : (
            events.map((event) => {
              const eventDate = parseEventDate(event.date);
              return (
                <li key={event.id} className="p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <Link
                    to={`/evento/${event.id}`}
                    className="flex-1 min-w-0 group block cursor-pointer"
                    title="Ver página do evento"
                  >
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors leading-snug">
                      {event.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-500">
                      <div className="flex items-center gap-1 font-medium bg-gray-50 dark:bg-zinc-800 px-2 py-0.5 rounded border border-gray-200 dark:border-zinc-700">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        {eventDate.toLocaleDateString('pt-PT')}
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-1 font-medium bg-gray-50 dark:bg-zinc-800 px-2 py-0.5 rounded border border-gray-200 dark:border-zinc-700">
                          <MapPin className="w-3 h-3 text-gray-400" />
                          {event.location}
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-zinc-800">
                    <Link
                      to={`/evento/${event.id}`}
                      className="px-3 py-1.5 text-xs font-semibold text-[#2d5016] dark:text-green-400 bg-green-50 dark:bg-green-950/40 hover:bg-green-100 rounded-lg border border-green-200 dark:border-green-900/50 transition-colors"
                    >
                      Ver Página
                    </Link>
                    <Link
                      to={`/admin/events/edit/${event.id}`}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                    <Link
                      to={`/admin/events/new?from=${event.id}`}
                      className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Duplicar (usar como modelo para um novo evento)"
                      aria-label={`Duplicar ${event.title}`}
                    >
                      <Copy className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => setDeleteEventId(event.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <ConfirmModal
        isOpen={!!deleteEventId}
        onClose={() => setDeleteEventId(null)}
        onConfirm={confirmDelete}
        title="Eliminar evento?"
        message="Tem a certeza que deseja eliminar este evento? O PDF e o alinhamento de cânticos serão perdidos."
        confirmText="Sim, eliminar"
        cancelText="Cancelar"
        variant="danger"
        icon="trash"
      />
    </div>
  );
};
