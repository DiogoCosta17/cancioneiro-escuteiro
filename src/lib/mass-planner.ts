import type { Song } from './types';
import type { LiturgicalDay, LiturgicalSeason } from './liturgical-calendar';
import { SEASON_NAMES } from './liturgical-calendar';
import { LITURGICAL_MOMENTS, LiturgicalMoment } from './liturgical-moments';
import { normalizeSearchText } from './search-utils';

/**
 * Sugestões de cânticos para cada momento da missa, só pelas etiquetas e pelo tempo litúrgico.
 * Não usa o histórico de missas (o que foi cantado e quando): decisão do utilizador a 03-11-2026.
 * Funções puras: nada aqui lê ou escreve na base de dados.
 */

// Etiquetas que identificam cânticos próprios de um tempo litúrgico
export const SEASON_TAGS: Record<LiturgicalSeason, string[]> = {
  advento: ['advento'],
  natal: ['natal'],
  quaresma: ['quaresma', 'semana santa'],
  pascoa: ['páscoa', 'pascoa', 'pascal', 'ressurreição'],
  comum: ['tempo comum'],
};

const MARIAN_TAGS = ['marianas', 'mariana', 'nossa senhora', 'maria'];

// Na Quaresma o Aleluia é substituído por uma aclamação ao Evangelho
const LENT_ACCLAMATION_TAGS = ['aclamação', 'aclamacao', 'aclamação ao evangelho', 'aclamacao ao evangelho'];

export const LENT_ALELUIA_BLOCKED = 'Não se canta na Quaresma';

export const LENT_ALELUIA_NOTE =
  'Na Quaresma não se canta o Aleluia: usa uma aclamação ao Evangelho (etiqueta "Aclamação").';

const SEASON_TAG_SETS = Object.fromEntries(
  Object.entries(SEASON_TAGS).map(([season, tags]) => [season, new Set(tags.map(normalizeSearchText))])
) as Record<LiturgicalSeason, Set<string>>;

const MARIAN_TAG_SET = new Set(MARIAN_TAGS.map(normalizeSearchText));
const LENT_ACCLAMATION_SET = new Set(LENT_ACCLAMATION_TAGS.map(normalizeSearchText));

export type SeasonFit = 'match' | 'neutral' | 'other';

export interface MomentCandidate {
  song: Song;
  score: number;
  /** 'match': próprio deste tempo; 'other': próprio de outro tempo; 'neutral': sem tempo definido. */
  seasonFit: SeasonFit;
  /** Nomes dos tempos a que o cântico pertence (quando `seasonFit === 'other'`). */
  otherSeasons: string[];
  /** Cântico de Nossa Senhora numa celebração mariana. */
  marianMatch: boolean;
  /** Motivo pelo qual não pode ser proposto nesta data (ex.: Aleluia na Quaresma). */
  blockedReason: string | null;
}

export interface MassPlanSlot {
  moment: LiturgicalMoment;
  candidates: MomentCandidate[];
  note: string | null;
}

function songTagSet(song: Song): Set<string> {
  return new Set((Array.isArray(song.tags) ? song.tags : []).map(normalizeSearchText).filter(Boolean));
}

function songSeasons(tags: Set<string>): LiturgicalSeason[] {
  return (Object.keys(SEASON_TAG_SETS) as LiturgicalSeason[]).filter(season =>
    [...tags].some(t => SEASON_TAG_SETS[season].has(t))
  );
}

function isLentAleluia(moment: LiturgicalMoment, day: LiturgicalDay): boolean {
  return moment.id === 'aleluia' && day.season === 'quaresma';
}

/** Etiquetas aceites para o momento neste dia (na Quaresma o Aleluia aceita também aclamações). */
function momentTagSet(moment: LiturgicalMoment, day: LiturgicalDay): Set<string> {
  const tags = new Set(moment.tags.map(normalizeSearchText));
  if (isLentAleluia(moment, day)) LENT_ACCLAMATION_SET.forEach(t => tags.add(t));
  return tags;
}

export function momentNote(moment: LiturgicalMoment, day: LiturgicalDay): string | null {
  return isLentAleluia(moment, day) ? LENT_ALELUIA_NOTE : null;
}

/** Cânticos possíveis para um momento, do mais adequado para o menos adequado nesta data. */
export function rankMomentCandidates(songs: Song[], moment: LiturgicalMoment, day: LiturgicalDay): MomentCandidate[] {
  const wanted = momentTagSet(moment, day);
  const lentAleluia = isLentAleluia(moment, day);
  const candidates: MomentCandidate[] = [];

  for (const song of Array.isArray(songs) ? songs : []) {
    if (!song || !song.id) continue;
    const tags = songTagSet(song);
    if (![...tags].some(t => wanted.has(t))) continue;

    // Na Quaresma só se propõem aclamações; os Aleluias continuam visíveis, mas assinalados
    const blockedReason = lentAleluia && ![...tags].some(t => LENT_ACCLAMATION_SET.has(t)) ? LENT_ALELUIA_BLOCKED : null;

    const seasons = songSeasons(tags);
    const seasonFit: SeasonFit = seasons.length === 0 ? 'neutral' : seasons.includes(day.season) ? 'match' : 'other';
    const marianMatch = day.marian && [...tags].some(t => MARIAN_TAG_SET.has(t));

    let score = 0;
    if (seasonFit === 'match') score += 40;
    if (seasonFit === 'other' || blockedReason) score -= 100;
    if (marianMatch) score += 25;

    candidates.push({
      song,
      score,
      seasonFit,
      otherSeasons: seasonFit === 'other' ? seasons.map(s => SEASON_NAMES[s]) : [],
      marianMatch,
      blockedReason,
    });
  }

  return candidates.sort(
    (a, b) => b.score - a.score || (a.song.title || '').localeCompare(b.song.title || '', 'pt')
  );
}

/** Candidatos de todos os momentos da missa para o dia litúrgico. */
export function buildMassPlan(songs: Song[], day: LiturgicalDay): MassPlanSlot[] {
  return LITURGICAL_MOMENTS.map(moment => ({
    moment,
    candidates: rankMomentCandidates(songs, moment, day),
    note: momentNote(moment, day),
  }));
}

/** Pode ser proposto automaticamente (cânticos de outro tempo só se escolhem à mão). */
function isProposable(candidate: MomentCandidate): boolean {
  return candidate.seasonFit !== 'other' && !candidate.blockedReason;
}

/**
 * Escolha inicial: o melhor candidato de cada momento, sem repetir o mesmo cântico em dois momentos.
 * Devolve o id do cântico por momento (ou null se não houver nenhum adequado).
 */
export function initialSelection(slots: MassPlanSlot[]): (string | null)[] {
  const taken = new Set<string>();
  return slots.map(slot => {
    const pick = slot.candidates.find(c => isProposable(c) && !taken.has(c.song.id));
    if (!pick) return null;
    taken.add(pick.song.id);
    return pick.song.id;
  });
}

