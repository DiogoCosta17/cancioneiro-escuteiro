import { useEffect, useCallback } from 'react';

const DEFAULT_MESSAGE = 'Tens alterações por guardar. Queres mesmo sair?';

/**
 * Avisa o utilizador antes de perder alterações não guardadas.
 * - Fechar/recarregar o separador: aviso nativo do browser (beforeunload).
 * - Navegação dentro da app (botões "Cancelar"/"Voltar"): usar `confirmLeave()` antes de navegar.
 * (A app usa <BrowserRouter>, por isso o useBlocker do React Router não está disponível.)
 */
export function useUnsavedChangesWarning(isDirty: boolean, message: string = DEFAULT_MESSAGE) {
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const confirmLeave = useCallback(() => {
    return !isDirty || window.confirm(message);
  }, [isDirty, message]);

  return { confirmLeave };
}
