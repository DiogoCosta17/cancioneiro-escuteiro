import { useEffect, useState } from 'react';
import { DailyReadings, ReadingsUnavailableError, fetchDailyReadings, getCachedReadings, saveCachedReadings } from '../lib/daily-readings';

/** Leituras de um dia: mostra logo a cópia local (se houver) e atualiza com a rede. */
export function useDailyReadings(dateISO: string) {
  const [data, setData] = useState<DailyReadings | null>(() => getCachedReadings(dateISO));
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  // A fonte ainda não publicou este dia (data demasiado no futuro)
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedReadings(dateISO);
    setData(cached);
    setLoading(!cached);
    setError(null);
    setUnavailable(false);

    fetchDailyReadings(dateISO)
      .then(fresh => {
        if (cancelled) return;
        setData(fresh);
        saveCachedReadings(fresh);
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('Não foi possível obter as leituras:', err);
        if (!cached) {
          setError(err instanceof Error ? err.message : 'Não foi possível obter as leituras.');
          setUnavailable(err instanceof ReadingsUnavailableError);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dateISO]);

  return { data, loading, error, unavailable };
}
