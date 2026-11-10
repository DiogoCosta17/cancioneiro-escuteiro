/**
 * Leituras da missa de um dia, a partir do Evangelho Quotidiano (Evangelizo), em português de Portugal
 * (tradução litúrgica). Usa a API de publicação que o próprio site usa (publication.evangelizo.ws), com
 * autorização do Evangelizo dada ao agrupamento (novembro de 2026). Um pedido por dia; inclui o refrão
 * do salmo. Os textos são tratados como texto simples (nunca se insere HTML de terceiros na página).
 */

export const READINGS_SOURCE_NAME = 'Evangelho Quotidiano';
export const READINGS_SOURCE_URL = 'https://www.evangelizo.org';
/** Crédito da tradução (mostra-se uma vez na página). */
export const READINGS_TRANSLATION = 'Tradução litúrgica da Bíblia';
const API_URL = 'https://publication.evangelizo.ws';
const LANGUAGE = 'PT';

export type ReadingKind = 'first' | 'psalm' | 'second' | 'gospel';

export interface Reading {
  kind: ReadingKind;
  label: string;
  /** Ex.: "Livro da Sabedoria 6,12-16" */
  reference: string;
  text: string;
  /** Refrão do salmo responsorial, sem o "R/" (só no salmo). */
  refrain?: string;
}

export interface DailyReadings {
  /** 'YYYY-MM-DD' */
  date: string;
  /** Nome do dia segundo a fonte (ex.: "32º Domingo do Tempo Comum"). */
  title: string;
  readings: Reading[];
}

const LABELS: Record<ReadingKind, string> = {
  first: '1.ª Leitura',
  psalm: 'Salmo Responsorial',
  second: '2.ª Leitura',
  gospel: 'Evangelho',
};

/** Datas que a fonte ainda não publicou (demasiado no futuro). */
export class ReadingsUnavailableError extends Error {
  constructor() {
    super('As leituras deste dia ainda não estão publicadas na fonte. Para datas mais distantes, consulta o liturgia.pt.');
    this.name = 'ReadingsUnavailableError';
  }
}

/** Texto de uma leitura da API: sem marcadores de versículo ("[[Mt 25,1]]"), com mudanças de linha normalizadas. */
export function cleanReadingText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Refrão sem o prefixo "R/" (ou null). */
export function cleanRefrain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/^\s*R\s*\/\s*/i, '').replace(/\s+/g, ' ').trim();
  return text || null;
}

interface ApiReading {
  type?: unknown;
  title?: unknown;
  book?: { full_title?: unknown } | null;
  reference_displayed?: unknown;
  text?: unknown;
  chorus?: unknown;
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Obtém o título do dia e as leituras (a 2.ª leitura só existe aos domingos e solenidades). */
export async function fetchDailyReadings(dateISO: string, fetchImpl: FetchLike = fetch): Promise<DailyReadings> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error('Data inválida');

  const res = await fetchImpl(`${API_URL}/${LANGUAGE}/days/${dateISO}`);
  const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown>; error?: { message?: string } } | null;
  if (body?.error) {
    if (/future/i.test(body.error.message || '')) throw new ReadingsUnavailableError();
    throw new Error(`Fonte das leituras: ${body.error.message || 'erro desconhecido'}`);
  }
  if (!res.ok || !body?.data) throw new Error(`Fonte das leituras respondeu ${res.status}`);

  const data = body.data;
  const readings: Reading[] = [];
  let readingCount = 0;
  for (const raw of Array.isArray(data.readings) ? (data.readings as ApiReading[]) : []) {
    // A API marca 1.ª e 2.ª leitura ambas como "reading": a ordem decide
    let kind: ReadingKind | null = null;
    if (raw?.type === 'psalm') kind = 'psalm';
    else if (raw?.type === 'gospel') kind = 'gospel';
    else if (raw?.type === 'reading') kind = readingCount++ === 0 ? 'first' : 'second';
    if (!kind) continue;

    const book = typeof raw.title === 'string' ? raw.title : typeof raw.book?.full_title === 'string' ? raw.book.full_title : '';
    const ref = typeof raw.reference_displayed === 'string' ? raw.reference_displayed : '';
    const reference = `${book} ${ref}`.replace(/\s+/g, ' ').replace(/\.$/, '').trim();
    const text = cleanReadingText(raw.text);
    if (!reference || !text) continue;

    const reading: Reading = { kind, label: LABELS[kind], reference, text };
    const refrain = kind === 'psalm' ? cleanRefrain(raw.chorus) : null;
    if (refrain) reading.refrain = refrain;
    readings.push(reading);
  }

  if (readings.length === 0) throw new Error('Não há leituras disponíveis para este dia.');
  const title = typeof data.liturgic_title === 'string' ? data.liturgic_title.replace(/\s+/g, ' ').trim() : '';
  return { date: dateISO, title, readings };
}

// --- Cópia local (para abrir sem rede as leituras já vistas) ---

// v2: inclui o refrão do salmo (as cópias v1, do feed antigo, não o tinham)
export const READINGS_CACHE_KEY = 'cancioneiro_readings_v2';
export const LEGACY_READINGS_CACHE_KEY = 'cancioneiro_readings_v1';
const CACHE_LIMIT = 30;

function readCache(): Record<string, DailyReadings & { savedAt: number }> {
  try {
    const raw = localStorage.getItem(READINGS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getCachedReadings(dateISO: string): DailyReadings | null {
  const entry = readCache()[dateISO];
  if (!entry || !Array.isArray(entry.readings) || typeof entry.title !== 'string') return null;
  return { date: dateISO, title: entry.title, readings: entry.readings };
}

export function saveCachedReadings(data: DailyReadings): void {
  try {
    const cache = readCache();
    cache[data.date] = { ...data, savedAt: Date.now() };
    // Guarda só as mais recentes
    const kept = Object.entries(cache)
      .sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0))
      .slice(0, CACHE_LIMIT);
    localStorage.setItem(READINGS_CACHE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Armazenamento cheio ou indisponível: as leituras só não ficam para usar offline
  }
}

/** Leituras de um dia: da cópia local se existir, senão da rede (e guarda-as). */
export async function loadDailyReadings(dateISO: string): Promise<DailyReadings> {
  const cached = getCachedReadings(dateISO);
  if (cached) return cached;
  const fresh = await fetchDailyReadings(dateISO);
  saveCachedReadings(fresh);
  return fresh;
}

// --- Fonte oficial (Secretariado Nacional de Liturgia) ---
// O liturgia.pt tem as leituras e a aclamação ao Evangelho oficial de cada dia, mas está protegido contra
// acessos automáticos (Cloudflare): a app não o lê, apenas abre a página do dia certo.

export const OFFICIAL_LITURGY_NAME = 'liturgia.pt';

/** Página do dia no liturgia.pt (formato da data sem zeros à esquerda: 2026-11-8). */
export function liturgiaPtUrl(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  return `https://www.liturgia.pt/liturgiadiaria/dia.php?data=${y}-${m}-${d}`;
}

/** Página do dia no site do Evangelho Quotidiano. */
export function evangelhoQuotidianoUrl(dateISO: string): string {
  return `https://evangelhoquotidiano.org/PT/gospel/${dateISO}`;
}

/** Evangelho do dia (ou null se a fonte não o trouxer). */
export function gospelOf(readings: DailyReadings): Reading | null {
  return readings.readings.find(r => r.kind === 'gospel') || null;
}
