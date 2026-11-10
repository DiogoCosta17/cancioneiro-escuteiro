import React from 'react';
import { X, Smartphone, Share, PlusSquare, CheckCircle2 } from 'lucide-react';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  isIOS: boolean;
}

export function InstallAppModal({ isOpen, onClose, isIOS }: InstallAppModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-gray-800 dark:text-gray-200"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center text-[#2d5016] dark:text-green-400 shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Instalar o Cancioneiro
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Acede rapidamente e utiliza mesmo sem rede
            </p>
          </div>
        </div>

        {isIOS ? (
          <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No iPhone ou iPad (Safari), instala em apenas 3 passos simples:
            </p>

            <ol className="space-y-3">
              <li className="flex items-start gap-3 bg-gray-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-gray-100 dark:border-zinc-700/60">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                  1
                </div>
                <div className="text-xs leading-relaxed">
                  Toca no botão de <strong className="text-gray-900 dark:text-gray-100">Partilhar</strong> <Share className="inline w-3.5 h-3.5 mx-0.5 text-blue-500" /> na barra inferior do Safari.
                </div>
              </li>

              <li className="flex items-start gap-3 bg-gray-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-gray-100 dark:border-zinc-700/60">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                  2
                </div>
                <div className="text-xs leading-relaxed">
                  Desliza o menu para baixo e escolhe <strong className="text-gray-900 dark:text-gray-100">"Adicionar ao Ecrã Principal"</strong> <PlusSquare className="inline w-3.5 h-3.5 mx-0.5 text-gray-700 dark:text-gray-300" />.
                </div>
              </li>

              <li className="flex items-start gap-3 bg-gray-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-gray-100 dark:border-zinc-700/60">
                <div className="w-7 h-7 rounded-lg bg-green-100 dark:bg-green-950/80 text-green-600 dark:text-green-400 flex items-center justify-center font-bold text-xs shrink-0">
                  3
                </div>
                <div className="text-xs leading-relaxed">
                  Toca em <strong className="text-gray-900 dark:text-gray-100">"Adicionar"</strong> no canto superior direito. Pronto!
                </div>
              </li>
            </ol>
          </div>
        ) : (
          <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
            <p className="text-xs leading-relaxed">
              Podes instalar esta aplicação no teu dispositivo Android, Windows ou Mac através do teu navegador (Chrome, Edge, Samsung Internet).
            </p>
            <div className="bg-gray-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-gray-100 dark:border-zinc-700/60 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
              <span>Funciona em ecrã total e abre instantaneamente como uma app real.</span>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 text-sm font-semibold rounded-xl bg-[#2d5016] hover:bg-[#233f11] text-white transition-colors cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
