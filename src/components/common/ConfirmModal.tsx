import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, AlertCircle } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  icon?: 'trash' | 'warning' | 'info';
  hideCancel?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  icon = 'trash',
  hideCancel = false
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderIcon = () => {
    switch (icon) {
      case 'trash':
        return <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />;
      case 'info':
      default:
        return <AlertCircle className="w-6 h-6 text-blue-600 dark:text-blue-400" />;
    }
  };

  const getIconBg = () => {
    switch (variant) {
      case 'warning':
        return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/50 dark:border-amber-900/30';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-950/40 border-blue-200/50 dark:border-blue-900/30';
      case 'danger':
      default:
        return 'bg-red-50 dark:bg-red-950/40 border-red-200/50 dark:border-red-900/30';
    }
  };

  const getConfirmBtnClass = () => {
    switch (variant) {
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 text-white';
      case 'info':
        return 'bg-[#2d5016] hover:bg-[#3a681d] text-white';
      case 'danger':
      default:
        return 'bg-red-600 hover:bg-red-700 text-white';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl shadow-xl max-w-sm w-full p-6 text-center transform transition-all animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-12 h-12 rounded-full border ${getIconBg()} flex items-center justify-center mx-auto mb-4`}>
          {renderIcon()}
        </div>

        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {title}
        </h3>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-6 leading-relaxed">
          {message}
        </p>

        <div className="flex items-center gap-3">
          {!hideCancel && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-sm"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (onConfirm) onConfirm();
              onClose();
            }}
            className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors shadow-xs cursor-pointer text-sm ${getConfirmBtnClass()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
