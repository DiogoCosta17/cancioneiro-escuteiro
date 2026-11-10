import React from 'react';
import { Link } from 'react-router-dom';
import { useEvents, useOfflineEventRecords } from '../hooks/useEvents';
import { parseEventDate } from '../lib/dates';
import { Calendar, MapPin, ChevronRight, BookOpen, CloudCheck } from 'lucide-react';

export const EventsList: React.FC = () => {
  const { events, loading, error } = useEvents();
  const offlineRecords = useOfflineEventRecords();
  // Recalculado a cada render (barato), para não ficar preso ao dia anterior se a PWA passar da meia-noite
  const today = new Date(new Date().setHours(0, 0, 0, 0));

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#2d5016]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          Ocorreu um erro ao carregar os eventos: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Atividades e Missas</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Repertórios oficiais organizados para atividades e eucaristias do agrupamento.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-12 text-center shadow-sm border border-gray-100">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">Sem Eventos</h2>
          <p className="text-gray-500 max-w-md mx-auto">
            Ainda não foram criados repertórios oficiais.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => {
            const eventDate = parseEventDate(event.date);
            const isPast = eventDate < today;
            const offlineRecord = offlineRecords[event.id];
            
            return (
              <Link
                key={event.id}
                to={`/evento/${event.id}`}
                className={`bg-white dark:bg-zinc-900 rounded-xl p-5 sm:p-6 border transition-all duration-200 hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${
                  isPast ? 'border-gray-200 dark:border-zinc-800 opacity-75' : 'border-[#2d5016]/20 dark:border-green-800/40'
                }`}
              >
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 group-hover:text-[#2d5016] dark:group-hover:text-green-400 transition-colors">
                    {event.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Calendar className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                      {eventDate.toLocaleDateString('pt-PT', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                        {event.location}
                      </div>
                    )}
                    {offlineRecord && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-900/50"
                        title={`Guardado neste dispositivo a ${new Date(offlineRecord.savedAt).toLocaleDateString('pt-PT')}`}
                      >
                        <CloudCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        Offline
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-[#2d5016] dark:text-green-400 font-semibold text-sm shrink-0">
                  Ver Repertório
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
