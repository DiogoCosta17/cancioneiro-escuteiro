/**
 * Calendário litúrgico (rito romano, calendário de Portugal).
 *
 * Tudo é calculado no dispositivo a partir da data da Páscoa: não há pedidos à rede.
 * Particularidades portuguesas: a Epifania celebra-se no domingo entre 2 e 8 de janeiro
 * e a Ascensão passa para o domingo seguinte (VII Domingo da Páscoa).
 * Só são nomeadas as celebrações relevantes para preparar missas com cânticos
 * (domingos e principais solenidades); os restantes dias da semana devolvem `celebration: null`.
 */

export type LiturgicalSeason = 'advento' | 'natal' | 'quaresma' | 'pascoa' | 'comum';
export type LiturgicalColor = 'roxo' | 'rosa' | 'branco' | 'vermelho' | 'verde';
export type LiturgicalCycle = 'A' | 'B' | 'C';

export interface LiturgicalDay {
  season: LiturgicalSeason;
  /** Nome a mostrar do tempo (ex.: "Advento", "Semana Santa"). */
  seasonName: string;
  color: LiturgicalColor;
  /** Ano do ciclo dominical (A, B ou C). */
  cycle: LiturgicalCycle;
  /** Nome do domingo ou solenidade; `null` nos dias de semana comuns. */
  celebration: string | null;
  /** Celebração de Nossa Senhora (ex.: Imaculada Conceição). */
  marian: boolean;
  isSunday: boolean;
}

export const SEASON_NAMES: Record<LiturgicalSeason, string> = {
  advento: 'Advento',
  natal: 'Natal',
  quaresma: 'Quaresma',
  pascoa: 'Páscoa',
  comum: 'Tempo Comum',
};

export const COLOR_NAMES: Record<LiturgicalColor, string> = {
  roxo: 'Roxo',
  rosa: 'Rosa',
  branco: 'Branco',
  vermelho: 'Vermelho',
  verde: 'Verde',
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Datas sempre à meia-noite local; somar dias pelo construtor evita problemas com a hora de verão.
function dayOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Domingo de Páscoa (algoritmo gregoriano anónimo / Meeus). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** I Domingo do Advento: o quarto domingo antes do Natal (entre 27 de novembro e 3 de dezembro). */
export function firstSundayOfAdvent(year: number): Date {
  const christmas = new Date(year, 11, 25);
  const weekday = christmas.getDay();
  const fourthSunday = addDays(christmas, -(weekday === 0 ? 7 : weekday));
  return addDays(fourthSunday, -21);
}

/** Epifania em Portugal: domingo entre 2 e 8 de janeiro. */
export function epiphany(year: number): Date {
  const jan2 = new Date(year, 0, 2);
  return addDays(jan2, (7 - jan2.getDay()) % 7);
}

/** Batismo do Senhor: domingo a seguir à Epifania, ou segunda-feira se a Epifania calhar a 7 ou 8. */
export function baptismOfTheLord(year: number): Date {
  const ep = epiphany(year);
  return ep.getDate() >= 7 ? addDays(ep, 1) : addDays(ep, 7);
}

/** Sagrada Família: domingo na oitava do Natal, ou 30 de dezembro se não houver domingo. */
function holyFamily(year: number): Date {
  for (let day = 26; day <= 31; day++) {
    const d = new Date(year, 11, day);
    if (d.getDay() === 0) return d;
  }
  return new Date(year, 11, 30);
}

// Festas do Senhor e solenidades de data fixa que, no Tempo Comum, se sobrepõem ao domingo
const FIXED_ORDINARY_CELEBRATIONS: { month: number; day: number; name: string; color: LiturgicalColor }[] = [
  { month: 1, day: 2, name: 'Apresentação do Senhor', color: 'branco' },
  { month: 5, day: 24, name: 'Nascimento de São João Batista', color: 'branco' },
  { month: 5, day: 29, name: 'São Pedro e São Paulo, Apóstolos', color: 'vermelho' },
  { month: 7, day: 6, name: 'Transfiguração do Senhor', color: 'branco' },
  { month: 8, day: 14, name: 'Exaltação da Santa Cruz', color: 'vermelho' },
  { month: 10, day: 9, name: 'Dedicação da Basílica de Latrão', color: 'branco' },
];

const ROMAN: [number, string][] = [
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function toRoman(value: number): string {
  let n = Math.max(0, Math.floor(value));
  let out = '';
  for (const [num, sym] of ROMAN) {
    while (n >= num) {
      out += sym;
      n -= num;
    }
  }
  return out;
}

/** Ciclo dominical: o ano litúrgico que termina em 2026 (começa no Advento de 2025) é o Ano A. */
export function liturgicalCycle(date: Date): LiturgicalCycle {
  const d = dayOnly(date);
  const year = d.getFullYear();
  const endingYear = d >= firstSundayOfAdvent(year) ? year + 1 : year;
  return (['C', 'A', 'B'] as const)[endingYear % 3];
}

interface DayInfo {
  season: LiturgicalSeason;
  seasonName?: string;
  color: LiturgicalColor;
  celebration: string | null;
  marian?: boolean;
}

function computeDay(d: Date): DayInfo {
  const year = d.getFullYear();
  const month = d.getMonth();
  const date = d.getDate();
  const isSunday = d.getDay() === 0;

  const advent1 = firstSundayOfAdvent(year);
  const christmas = new Date(year, 11, 25);

  // Advento (até 24 de dezembro)
  if (d >= advent1 && d < christmas) {
    // Imaculada Conceição a 8/12; se calhar a um domingo do Advento passa para segunda-feira
    const dec8 = new Date(year, 11, 8);
    const immaculate = dec8.getDay() === 0 ? addDays(dec8, 1) : dec8;
    if (sameDay(d, immaculate)) {
      return { season: 'advento', color: 'branco', celebration: 'Imaculada Conceição da Virgem Santa Maria', marian: true };
    }
    const week = Math.floor(diffDays(advent1, d) / 7) + 1;
    if (isSunday) {
      return { season: 'advento', color: week === 3 ? 'rosa' : 'roxo', celebration: `${toRoman(week)} Domingo do Advento` };
    }
    return { season: 'advento', color: 'roxo', celebration: null };
  }

  // Natal (25 a 31 de dezembro)
  if (d >= christmas) {
    if (sameDay(d, christmas)) return { season: 'natal', color: 'branco', celebration: 'Natal do Senhor' };
    if (sameDay(d, holyFamily(year))) return { season: 'natal', color: 'branco', celebration: 'Sagrada Família de Jesus, Maria e José' };
    return { season: 'natal', color: 'branco', celebration: null };
  }

  // Natal (1 de janeiro até ao Batismo do Senhor)
  const baptism = baptismOfTheLord(year);
  if (d <= baptism) {
    if (month === 0 && date === 1) {
      return { season: 'natal', color: 'branco', celebration: 'Santa Maria, Mãe de Deus', marian: true };
    }
    if (sameDay(d, epiphany(year))) return { season: 'natal', color: 'branco', celebration: 'Epifania do Senhor' };
    if (sameDay(d, baptism)) return { season: 'natal', color: 'branco', celebration: 'Batismo do Senhor' };
    return { season: 'natal', color: 'branco', celebration: null };
  }

  const easter = easterSunday(year);
  const ashWednesday = addDays(easter, -46);
  const palmSunday = addDays(easter, -7);
  const pentecost = addDays(easter, 49);

  // Quaresma e Semana Santa (até Sábado Santo)
  if (d >= ashWednesday && d < easter) {
    if (sameDay(d, ashWednesday)) return { season: 'quaresma', color: 'roxo', celebration: 'Quarta-feira de Cinzas' };
    if (d >= palmSunday) {
      const holyWeek = { season: 'quaresma' as const, seasonName: 'Semana Santa' };
      if (sameDay(d, palmSunday)) return { ...holyWeek, color: 'vermelho', celebration: 'Domingo de Ramos na Paixão do Senhor' };
      const toEaster = diffDays(d, easter);
      if (toEaster === 3) return { ...holyWeek, color: 'branco', celebration: 'Quinta-feira Santa (Ceia do Senhor)' };
      if (toEaster === 2) return { ...holyWeek, color: 'vermelho', celebration: 'Sexta-feira Santa (Paixão do Senhor)' };
      if (toEaster === 1) return { ...holyWeek, color: 'roxo', celebration: 'Sábado Santo' };
      return { ...holyWeek, color: 'roxo', celebration: null };
    }
    if (isSunday) {
      const week = Math.floor(diffDays(addDays(ashWednesday, 4), d) / 7) + 1;
      return { season: 'quaresma', color: week === 4 ? 'rosa' : 'roxo', celebration: `${toRoman(week)} Domingo da Quaresma` };
    }
    return { season: 'quaresma', color: 'roxo', celebration: null };
  }

  // Páscoa (até ao Pentecostes)
  if (d >= easter && d <= pentecost) {
    if (sameDay(d, easter)) return { season: 'pascoa', color: 'branco', celebration: 'Domingo de Páscoa da Ressurreição do Senhor' };
    if (sameDay(d, pentecost)) return { season: 'pascoa', color: 'vermelho', celebration: 'Domingo de Pentecostes' };
    if (isSunday) {
      const week = Math.floor(diffDays(easter, d) / 7) + 1;
      if (week === 7) return { season: 'pascoa', color: 'branco', celebration: 'Ascensão do Senhor' };
      return { season: 'pascoa', color: 'branco', celebration: `${toRoman(week)} Domingo da Páscoa` };
    }
    return { season: 'pascoa', color: 'branco', celebration: null };
  }

  // Tempo Comum: solenidades que se sobrepõem ao domingo
  if (sameDay(d, addDays(pentecost, 7))) return { season: 'comum', color: 'branco', celebration: 'Santíssima Trindade' };
  if (sameDay(d, addDays(pentecost, 11))) {
    return { season: 'comum', color: 'branco', celebration: 'Santíssimo Corpo e Sangue de Cristo (Corpo de Deus)' };
  }
  if (month === 7 && date === 15) {
    return { season: 'comum', color: 'branco', celebration: 'Assunção de Nossa Senhora', marian: true };
  }
  if (month === 10 && date === 1) return { season: 'comum', color: 'branco', celebration: 'Todos os Santos' };
  if (month === 10 && date === 2) {
    return { season: 'comum', color: 'roxo', celebration: 'Comemoração de Todos os Fiéis Defuntos' };
  }

  const fixed = FIXED_ORDINARY_CELEBRATIONS.find(c => c.month === month && c.day === date);
  if (fixed) return { season: 'comum', color: fixed.color, celebration: fixed.name };

  const christTheKing = addDays(advent1, -7);
  if (sameDay(d, christTheKing)) {
    return { season: 'comum', color: 'branco', celebration: 'Nosso Senhor Jesus Cristo, Rei do Universo' };
  }

  if (!isSunday) return { season: 'comum', color: 'verde', celebration: null };

  // Domingos do Tempo Comum: antes da Quaresma conta-se a partir do Batismo (que é o I),
  // depois do Pentecostes conta-se para trás a partir de Cristo Rei (XXXIV).
  const number = d < ashWednesday
    ? 1 + Math.ceil(diffDays(baptism, d) / 7)
    : 34 - Math.round(diffDays(d, christTheKing) / 7);
  return { season: 'comum', color: 'verde', celebration: `Domingo ${toRoman(number)} do Tempo Comum` };
}

export function getLiturgicalDay(date: Date): LiturgicalDay {
  const d = dayOnly(date);
  const info = computeDay(d);
  return {
    season: info.season,
    seasonName: info.seasonName || SEASON_NAMES[info.season],
    color: info.color,
    cycle: liturgicalCycle(d),
    celebration: info.celebration,
    marian: Boolean(info.marian),
    isSunday: d.getDay() === 0,
  };
}
