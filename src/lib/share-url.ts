// Origem pública usada nos links partilhados (QR Code, WhatsApp, copiar link).
export const PUBLIC_ORIGIN = 'https://cancioneiro488.vercel.app';

/**
 * Devolve a origem https atual (produção ou pré-visualização Vercel).
 * Em http (ex.: localhost no desenvolvimento) usa a origem de produção,
 * para que o QR Code funcione noutros telemóveis.
 */
export function getPublicOrigin(): string {
  try {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && window.location.origin) {
      return window.location.origin;
    }
  } catch {
    // Ignorar
  }
  return PUBLIC_ORIGIN;
}

export function getSongShareUrl(songId: string): string {
  return `${getPublicOrigin()}/song/${encodeURIComponent(songId)}`;
}

export function getEventShareUrl(eventId: string): string {
  return `${getPublicOrigin()}/evento/${encodeURIComponent(eventId)}`;
}
