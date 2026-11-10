import { useEffect, type DependencyList } from 'react';

const SCROLL_KEY = 'return_to_scroll_y';
const SONG_KEY = 'return_to_song_id';

// O sessionStorage lança exceção com os dados do site bloqueados (ex.: "bloquear todos os cookies")
function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function clearReturnPosition() {
  try {
    sessionStorage.removeItem(SCROLL_KEY);
    sessionStorage.removeItem(SONG_KEY);
  } catch {
    // Sem armazenamento não há nada a limpar
  }
}

/**
 * Ao voltar de uma música, restaura a posição exata de scroll onde o utilizador clicou.
 * A posição é gravada pelo clique no cartão (`return_to_scroll_y` / `return_to_song_id`).
 * `deps` deve mudar quando a lista acaba de carregar, para tentar outra vez com o conteúdo já no ecrã.
 */
export function useRestoreReturnScroll(deps: DependencyList) {
  useEffect(() => {
    const savedY = readSession(SCROLL_KEY);
    const savedSongId = readSession(SONG_KEY);

    if (savedY !== null || savedSongId) {
      const y = savedY ? parseInt(savedY, 10) : 0;

      const restore = () => {
        if (savedSongId) {
          const el = document.getElementById(`song-card-${savedSongId}`);
          if (el) {
            window.scrollTo({ top: y, behavior: 'instant' });
            clearReturnPosition();
            return true;
          }
        }
        if (y > 0) {
          window.scrollTo({ top: y, behavior: 'instant' });
          clearReturnPosition();
          return true;
        }
        return false;
      };

      if (!restore()) {
        const t1 = setTimeout(restore, 20);
        const t2 = setTimeout(restore, 80);
        const t3 = setTimeout(restore, 200);
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
        };
      }
    }
    // As dependências vêm de quem chama (a lista da página e o estado de carregamento)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
