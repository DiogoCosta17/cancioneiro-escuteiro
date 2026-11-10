import { useCallback, useSyncExternalStore } from 'react';

// Favoritos guardados apenas neste dispositivo (sem conta, sem servidor).
// Ordem: o favorito mais recente primeiro.
export const FAVORITES_STORAGE_KEY = 'cancioneiro_favorites_v1';
export const MAX_FAVORITES = 500;
const MAX_ID_LENGTH = 128;

/**
 * Valida dados vindos do localStorage: só aceita uma lista de strings não vazias,
 * remove duplicados e limita o tamanho. Qualquer outro formato devolve lista vazia.
 */
export function sanitizeFavoriteIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || id.length > MAX_ID_LENGTH || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_FAVORITES) break;
  }
  return result;
}

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeFavoriteIds(JSON.parse(raw));
  } catch {
    // JSON corrompido ou storage bloqueado (modo privado): começar sem favoritos
    return [];
  }
}

// Cópia em memória partilhada por todos os componentes deste separador.
// Mantém referência estável entre leituras (requisito do useSyncExternalStore).
let memoryIds: string[] | null = null;
let memorySet: Set<string> = new Set();

function setMemory(ids: string[]) {
  memoryIds = ids;
  memorySet = new Set(ids);
}

function ensureLoaded(): string[] {
  if (memoryIds === null) setMemory(readFromStorage());
  return memoryIds as string[];
}

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(listener => listener());
}

function handleExternalChange(e: Event) {
  // Evento 'storage' só chega de outros separadores; filtrar pela nossa chave
  if (e instanceof StorageEvent && e.key !== null && e.key !== FAVORITES_STORAGE_KEY) return;
  setMemory(readFromStorage());
  notify();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', handleExternalChange);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', handleExternalChange);
    }
  };
}

/** Lista atual de favoritos (mais recentes primeiro). */
export function getFavoriteIds(): string[] {
  return ensureLoaded();
}

export function isFavoriteId(id: string): boolean {
  ensureLoaded();
  return memorySet.has(id);
}

/** Substitui a lista completa de favoritos e avisa todos os componentes. */
export function setFavoriteIds(ids: string[]): string[] {
  const clean = sanitizeFavoriteIds(ids);
  setMemory(clean);
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(clean));
  } catch (e) {
    // Quota cheia ou storage bloqueado: os favoritos continuam válidos nesta sessão
    console.warn('Não foi possível guardar os favoritos:', e);
  }
  // Todos os componentes subscritos neste separador; os outros recebem o evento 'storage'
  notify();
  return clean;
}

/** Alterna o estado de favorito de um cântico. Devolve o novo estado. */
export function toggleFavoriteId(id: string): boolean {
  if (typeof id !== 'string' || !id.trim()) return false;
  const current = ensureLoaded();
  if (memorySet.has(id)) {
    setFavoriteIds(current.filter(x => x !== id));
    return false;
  }
  // Novo favorito à cabeça; se exceder o limite, cai o mais antigo
  setFavoriteIds([id, ...current].slice(0, MAX_FAVORITES));
  return isFavoriteId(id);
}

/** Apenas para testes: força nova leitura do localStorage. */
export function resetFavoritesMemoryForTests() {
  memoryIds = null;
  memorySet = new Set();
}

const getServerSnapshot = (): string[] => [];

/** Lista completa de favoritos (re-renderiza quando muda). */
export function useFavorites() {
  const favoriteIds = useSyncExternalStore(subscribe, getFavoriteIds, getServerSnapshot);
  const toggleFavorite = useCallback((id: string) => toggleFavoriteId(id), []);
  const isFavorite = useCallback((id: string) => favoriteIds.includes(id), [favoriteIds]);
  return { favoriteIds, isFavorite, toggleFavorite };
}

/**
 * Estado de favorito de um único cântico. Só re-renderiza o componente
 * cujo valor mudou (importante na grelha da Home com centenas de cartões).
 */
export function useIsFavorite(songId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isFavoriteId(songId),
    () => false
  );
}
