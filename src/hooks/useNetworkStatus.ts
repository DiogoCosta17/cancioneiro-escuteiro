import { useState, useEffect } from 'react';
import { getLastSyncTime } from '../lib/offline-storage';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [lastSync, setLastSync] = useState<string | null>(getLastSyncTime());

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setLastSync(getLastSyncTime());
    };

    const handleOffline = () => {
      setIsOnline(false);
      setLastSync(getLastSyncTime());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
    lastSync,
  };
}
