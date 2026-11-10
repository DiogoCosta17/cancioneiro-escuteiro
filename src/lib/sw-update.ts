/**
 * Quando sai uma versão nova, o service worker novo instala-se em segundo plano e toma conta da página
 * (skipWaiting + clientsClaim), mas a página aberta continuava a mostrar a versão antiga até ser fechada.
 * Recarrega uma vez quando o service worker muda, para os visitantes verem logo a versão nova.
 *
 * Não recarrega:
 * - na primeira instalação (não havia versão anterior a substituir);
 * - na área de administração, para não perder um formulário a meio (a versão nova aparece na próxima visita).
 */
export function reloadOnServiceWorkerUpdate(
  win: Pick<Window, 'location' | 'navigator'> & Partial<Pick<Window, 'document'>> = window
): void {
  const sw = win.navigator?.serviceWorker;
  if (!sw) return;

  const hadController = Boolean(sw.controller);
  let reloading = false;

  sw.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (win.location.pathname.startsWith('/admin')) return;
    reloading = true;

    // Se a página está visível (alguém a usar o afinador, metrónomo, modo palco...), adia o reload
    // para quando passar a segundo plano; se já está escondida, recarrega já.
    const doc = win.document;
    if (doc && doc.visibilityState === 'visible') {
      const onChange = () => {
        if (doc.visibilityState !== 'hidden') return;
        doc.removeEventListener('visibilitychange', onChange);
        win.location.reload();
      };
      doc.addEventListener('visibilitychange', onChange);
      return;
    }
    win.location.reload();
  });
}
