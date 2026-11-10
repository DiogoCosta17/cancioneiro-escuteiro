import React, { useState } from 'react';
import { WifiOff, X } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export function OfflineIndicator() {
  const { isOffline, lastSync } = useNetworkStatus();
  const [dismissed, setDismissed] = useState(false);

  if (!isOffline || dismissed) {
    return null;
  }

  const formatLastSync = (isoStr: string | null) => {
    if (!isoStr) return 'recentemente';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'recentemente';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 animate-in slide-in-from-bottom-3 duration-200">
      <div className="bg-amber-900/90 dark:bg-amber-950/95 text-amber-100 border border-amber-500/40 p-3.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-start justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 bg-amber-500/20 text-amber-300 rounded-lg shrink-0 mt-0.5">
            <WifiOff className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-amber-200 flex items-center gap-1.5">
              <span>Sem ligação à Internet</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 font-semibold text-amber-300">
                Modo Offline
              </span>
            </div>
            <p className="text-amber-100/80 text-xs mt-0.5 leading-snug">
              Não te preocupes: todos os cânticos e acordes estão guardados no teu telemóvel e prontos a usar! (Sincronizado às {formatLastSync(lastSync)})
            </p>
          </div>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="text-amber-300/70 hover:text-amber-100 p-1 rounded-lg hover:bg-amber-800/40 transition-colors shrink-0 cursor-pointer"
          title="Fechar aviso"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
