import { supabase } from './supabase';
import type { DailyReadings } from './daily-readings';
import type { LiturgicalDay } from './liturgical-calendar';
import type { MassPlanSlot } from './mass-planner';
import { stripChordProMarkup } from './search-utils';

/**
 * IA (Gemini) para preparar missas: cânticos do cancioneiro para cada momento, a partir das leituras do dia.
 * O versículo do Aleluia NÃO é pedido à IA: compunha versículos errados, e a pesquisa na web do Gemini não está
 * incluída no plano gratuito da conta (decisão do utilizador a 04-11-2026). O dirigente copia-o do liturgia.pt.
 * Usa a Edge Function `gemini-vision`, que só aceita administradores autenticados (a chave do Gemini nunca
 * chega ao browser).
 *
 * A IA só pode escolher entre os cânticos que lhe são enviados; a resposta é validada e tudo o que não
 * corresponder a um cântico candidato é descartado.
 */

const MAX_READING_CHARS = 1800;
const MAX_LYRICS_CHARS = 220;
const MAX_CANDIDATES_PER_MOMENT = 40;
const MAX_REASON_CHARS = 220;

export interface AiMomentPick {
  songId: string;
  reason: string;
}

export interface AiMassSuggestion {
  /** Tema das leituras numa frase. */
  theme: string | null;
  /** Escolha por momento (id do momento → cântico); só momentos com escolha válida. */
  picks: Record<string, AiMomentPick>;
}

/** Envia um pedido de texto à Edge Function e devolve a resposta do modelo. */
export async function askGemini(prompt: string): Promise<string> {
  if (!supabase) throw new Error('Supabase indisponível.');
  const { data, error } = await supabase.functions.invoke('gemini-vision', { body: { prompt } });
  if (!error && typeof data?.text === 'string') return data.text;
  let message = data?.error || error?.message || 'Resposta vazia da IA.';
  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body?.error) message = body.error;
    } catch {
      // Sem corpo legível: fica a mensagem genérica
    }
  }
  throw new Error(`Não foi possível obter a sugestão da IA: ${message}`);
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function readingsBlock(readings: DailyReadings): string {
  return readings.readings
    .map(r => `### ${r.label} — ${r.reference}${r.refrain ? `\nRefrão: ${r.refrain}` : ''}\n${truncate(r.text, MAX_READING_CHARS)}`)
    .join('\n\n');
}

function lyricsPreview(content: string): string {
  return truncate(stripChordProMarkup(content).replace(/\n+/g, ' / '), MAX_LYRICS_CHARS);
}

/** Cânticos que podem ser escolhidos em cada momento (sem os de outro tempo litúrgico nem os bloqueados). */
function proposable(slot: MassPlanSlot) {
  return slot.candidates
    .filter(c => c.seasonFit !== 'other' && !c.blockedReason)
    .slice(0, MAX_CANDIDATES_PER_MOMENT);
}

export function buildMassSuggestionPrompt(readings: DailyReadings, day: LiturgicalDay, slots: MassPlanSlot[]): string {
  const moments = slots
    .map(slot => {
      const options = proposable(slot);
      const list = options.length
        ? options.map(c => `- id: ${c.song.id} | "${c.song.title}" | etiquetas: ${(c.song.tags || []).join(', ') || '—'} | letra: ${lyricsPreview(c.song.content)}`).join('\n')
        : '- (sem cânticos disponíveis)';
      const note = slot.note ? `\n(Nota: ${slot.note})` : '';
      return `## ${slot.moment.id} — ${slot.moment.name}${note}\n${list}`;
    })
    .join('\n\n');

  return `És um animador litúrgico católico em Portugal a preparar os cânticos de uma missa com escuteiros.

Celebração: ${day.celebration || readings.title} (${day.seasonName}, Ano ${day.cycle}).

Leituras do dia:
${readingsBlock(readings)}

Para cada momento da missa, escolhe UM cântico da lista desse momento que melhor se relacione com as leituras e com o tempo litúrgico.
Regras:
- Usa APENAS ids que aparecem na lista desse momento. Se nenhum servir, usa null.
- Não repitas o mesmo cântico em dois momentos.
- "porque": uma frase curta em português de Portugal a ligar o cântico às leituras.

Responde só com JSON, sem texto à volta, neste formato:
{"tema": "frase curta", "momentos": {"entrada": {"id": "…", "porque": "…"}, "ofertorio": {"id": null, "porque": ""}}}

Momentos e cânticos disponíveis:
${moments}`;
}

/** Extrai o objeto JSON da resposta (aceita blocos ```json e texto à volta). */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA não devolveu uma resposta no formato esperado.');
  return JSON.parse(body.slice(start, end + 1));
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? truncate(text, max) : null;
}

/** Valida a resposta da IA contra os candidatos: ids desconhecidos ou repetidos são descartados. */
export function parseMassSuggestion(text: string, slots: MassPlanSlot[]): AiMassSuggestion {
  const raw = extractJson(text) as Record<string, unknown>;
  const moments = (raw && typeof raw.momentos === 'object' && raw.momentos) || {};
  const picks: Record<string, AiMomentPick> = {};
  const used = new Set<string>();

  for (const slot of slots) {
    const entry = (moments as Record<string, unknown>)[slot.moment.id] as Record<string, unknown> | undefined;
    const songId = entry && typeof entry.id === 'string' ? entry.id : null;
    if (!songId || used.has(songId)) continue;
    if (!proposable(slot).some(c => c.song.id === songId)) continue;
    used.add(songId);
    picks[slot.moment.id] = { songId, reason: cleanText(entry?.porque, MAX_REASON_CHARS) || '' };
  }

  return { theme: cleanText(raw?.tema, MAX_REASON_CHARS), picks };
}

export async function suggestMassSongs(
  readings: DailyReadings,
  day: LiturgicalDay,
  slots: MassPlanSlot[],
  ask: (prompt: string) => Promise<string> = askGemini
): Promise<AiMassSuggestion> {
  return parseMassSuggestion(await ask(buildMassSuggestionPrompt(readings, day, slots)), slots);
}
