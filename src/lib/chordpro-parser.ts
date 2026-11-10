import type { ChordToken, ParsedLine } from './types';
import { transposeChord, formatChordNotation } from './chords';

export function parseChordProLine(line: string): ChordToken[] {
  if (!line || typeof line !== 'string') return [];
  const tokens: ChordToken[] = [];
  const regex = /\[([^\]]+)\]([^[]*)/g;

  const firstBracket = line.indexOf('[');
  if (firstBracket > 0) {
    tokens.push({ chord: null, text: line.substring(0, firstBracket) });
  } else if (firstBracket === -1) {
    return [{ chord: null, text: line }];
  }

  regex.lastIndex = firstBracket >= 0 ? firstBracket : 0;
  let lastEnd = regex.lastIndex;
  // Texto que não pertence a nenhum acorde válido (ex: "[" sem fecho, "[]") não pode desaparecer da letra
  const appendStray = (stray: string) => {
    if (!stray) return;
    if (tokens.length > 0) tokens[tokens.length - 1].text += stray;
    else tokens.push({ chord: null, text: stray });
  };
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    appendStray(line.substring(lastEnd, match.index));
    lastEnd = regex.lastIndex;
    const chord = match[1];
    let text = match[2];

    // Se o texto a seguir ao acorde começar por espaços mas tiver letras logo a seguir (ex: "[G] palavra"):
    // O espaço pertence ao intervalo entre palavras e não deve ficar por baixo do acorde,
    // caso contrário o acorde fica "deslocado/ligeiramente fora" por cima de um espaço vazio.
    const leadingSpaceMatch = text.match(/^(\s+)(\S.*)$/);
    if (leadingSpaceMatch) {
      const remainder = leadingSpaceMatch[2];
      if (tokens.length > 0) {
        if (!tokens[tokens.length - 1].text.endsWith(' ')) {
          tokens[tokens.length - 1].text += ' ';
        }
      }
      text = remainder;
    }

    tokens.push({ chord, text });
  }
  appendStray(line.substring(lastEnd));

  return tokens;
}

/**
 * Normaliza e limpa o texto em formato ChordPro garantindo que:
 * 1. NUNCA há palavras coladas por causa de acordes (ex: "os[Lá]olhos" -> "os [Lá]olhos")
 * 2. O acorde fica sempre colado à sílaba certa sem espaços estranhos (ex: "[G] palavra" -> "[G]palavra")
 * 3. Se um acorde estava encostado à palavra anterior mas tinha espaço a seguir ("os[Lá] olhos"),
 *    o espaço passa para antes do acorde ("os [Lá]olhos") para separar as palavras e ancorar na palavra seguinte.
 * 4. Acordes que dividam uma palavra sem núcleo vocálico (ex: "S[G]enhor", "pr[D]esente", "Senho[G]r")
 *    são automaticamente alinhados ao início da palavra, preservando divisões silábicas reais ("cami[G]nhos").
 */
export function cleanAndAlignChordPro(content: string): string {
  if (!content || typeof content !== 'string') return '';

  let lines = content.split('\n');

  lines = lines.map((line) => {
    let trimmed = line.trimEnd();

    // Preserva diretivas de secção como {Refrão}, {Intro} ou [Refrão], [Intro]
    if (/^\{.*\}$/.test(trimmed.trim()) || isSectionDirective(trimmed.trim())) {
      return trimmed.trim();
    }

    // 1. Se estiver no início da linha: "^[Chord]  Palavra" -> "^[Chord]Palavra"
    trimmed = trimmed.replace(/^(\s*)\[([^\]]+)\][ \t]+([A-Za-zÀ-ÖØ-öø-ÿ0-9])/g, '$1[$2]$3');

    // 2. Se houver espaços de ambos os lados: "palavra1  [Chord]  palavra2" -> "palavra1 [Chord]palavra2"
    trimmed = trimmed.replace(/([A-Za-zÀ-ÖØ-öø-ÿ0-9.,;:!?])[ \t]+\[([^\]]+)\][ \t]+([A-Za-zÀ-ÖØ-öø-ÿ0-9])/g, '$1 [$2]$3');

    // 3. Se o acorde estiver colado à palavra anterior mas tiver espaço antes da próxima:
    // ex: "os[Lá] olhos" -> "os [Lá]olhos"
    // ex: "auxílio[Lá] vem" -> "auxílio [Lá]vem"
    // Move o espaço para ANTES do acorde, garantindo que as palavras ficam separadas e o acorde ancora na palavra seguinte.
    trimmed = trimmed.replace(/([A-Za-zÀ-ÖØ-öø-ÿ0-9.,;:!?])\[([^\]]+)\][ \t]+([A-Za-zÀ-ÖØ-öø-ÿ0-9])/g, '$1 [$2]$3');

    // 4. Auto-reparo de palavras coladas ou divisões fonológicas impossíveis em português:
    const SINGLE_WORDS_WITH_PREFIX = new Set([
      'osso', 'ossos', 'ostra', 'ostras', 'osga', 'osgas',
      'nosso', 'nossa', 'nossos', 'nossas', 'nosco',
      'nascer', 'nasce', 'nasceu', 'nascido', 'nascida', 'nascidos', 'nascidas', 'nascente', 'nascentes',
      'asa', 'asas', 'astro', 'astros', 'asfalto', 'asma', 'aspas', 'aspecto', 'aspirar', 'assinar', 'assunto',
      'aspira', 'aspiro', 'aspereza', 'áspero', 'áspera', 'astúcia',
      'ostentar', 'ostenta', 'ostentação', 'ostensivo', 'ostensiva',
      'nastro', 'nasal'
    ]);
    const SAFE_GLUED_PREFIXES = /^(os|as|dos|das|nos|nas|teus|tuas|seus|suas)$/i;
    const CONSONANT_ONLY_ONSET = /^(?:qu|gu|[bcdfghjklmnpqrstvwxzç])+$/i;
    const CONSONANT_ONLY_CODA = /^[bcdfghjklmnpqrstvwxzç]+$/i;

    trimmed = trimmed.replace(/(^|\s)([A-Za-zÀ-ÖØ-öø-ÿ0-9]+)\[([^\]]+)\]([A-Za-zÀ-ÖØ-öø-ÿ0-9]+)/g, (match, space, w1, chord, w2) => {
      const combined = (w1 + w2).toLowerCase();
      if (SINGLE_WORDS_WITH_PREFIX.has(combined)) {
        return `${space}[${chord}]${w1}${w2}`;
      }
      // "as[G]sim", "dos[G]sel", "as[C]sento": um "s" de cada lado é o "ss" no meio de uma palavra, nunca um artigo colado
      if (SAFE_GLUED_PREFIXES.test(w1) && !/^s/i.test(w2)) {
        return `${space}${w1} [${chord}]${w2}`;
      }
      // Se um acorde dividiu uma palavra de 2 ou 3 letras (ex: "s[F]ó" -> "[F]só", "co[C]m" -> "[C]com")
      // ou deixou apenas consoantes sem vogal num dos lados (ex: "S[G]enhor", "pr[D]esente", "Senho[G]r")
      if ((w1 + w2).length <= 3 || CONSONANT_ONLY_ONSET.test(w1) || CONSONANT_ONLY_CODA.test(w2)) {
        return `${space}[${chord}]${w1}${w2}`;
      }
      return match;
    });

    return trimmed;
  });

  return lines.join('\n');
}

export function parseChordPro(content: string): ParsedLine[] {
  if (!content || typeof content !== 'string') return [];
  content = cleanAndAlignChordPro(content.normalize('NFC').replace(/♯/g, '#').replace(/♭/g, 'b'));
  return content.split('\n').map((line) => {
    const trimmed = line.trim();
    if (trimmed === '' || /^\{(?:end_of_[a-z]+|eo[vc])\}$/i.test(trimmed)) {
      return { tokens: [], isBlank: true, sectionHeader: null };
    }
    const section = isSectionDirective(trimmed);
    if (section) {
      return { tokens: [], isBlank: false, sectionHeader: section };
    }
    return { tokens: parseChordProLine(trimmed), isBlank: false, sectionHeader: null };
  });
}

export function transposeParsedLines(
  lines: ParsedLine[], 
  semitones: number,
  preferFlats?: boolean,
  notation: 'silabica' | 'alfabetica' | 'ocultar' = 'alfabetica'
): ParsedLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => {
    if (!line) return { tokens: [], isBlank: true, sectionHeader: null };
    if (line.isBlank || line.sectionHeader) return line;

    return {
      ...line,
      tokens: (line.tokens || []).map((token) => {
        if (!token || !token.chord) return token || { chord: null, text: '' };
        if (notation === 'ocultar') {
          return { ...token, chord: null };
        }
        const transposed = transposeChord(token.chord, semitones, preferFlats);
        const formatted = formatChordNotation(transposed, notation);
        return {
          ...token,
          chord: formatted,
        };
      }),
    };
  });
}

const SECTION_KEYWORD_REGEX = /^(?:refrão|refrao|coro|intro(?:dução|ducao)?|estrofe(?:\s+\d+)?|verso(?:\s+\d+)?|verse(?:\s+\d+)?|ponte|bridge|coda|final|fim|outro|solo(?:\s+.*)?|interlúdio|interludio|entrada|salmo|aclamação|aclamacao|ofertório|ofertorio|santo|comunhão|comunhao|pós-comunhão|pos-comunhao|pré-refrão|pre-refrão|pre-chorus)(?:\s*:\s*.*)?$/i;

export function isSectionDirective(line: string): string | null {
  if (!line || typeof line !== 'string') return null;
  const trimmed = line.trim();

  // Diretivas de fecho padrão do ChordPro: ignorar para não poluir
  if (/^\{(?:end_of_[a-z]+|eo[vc])\}$/i.test(trimmed)) {
    return null;
  }

  // Diretivas de abertura padrão ChordPro: {start_of_chorus: Refrão}, {soc: Refrão}, {start_of_verse: Estrofe 1}, etc.
  const startMatch = trimmed.match(/^\{(?:start_of_([a-z]+)|so([vc]))(?::\s*([^}]+))?\}$/i);
  if (startMatch) {
    const custom = startMatch[3]?.trim();
    if (custom) return custom;
    const type = (startMatch[1] || (startMatch[2] === 'c' ? 'chorus' : 'verse')).toLowerCase();
    return type === 'chorus' ? 'Refrão' : 'Estrofe';
  }

  // Diretiva de comentário {comment: ...} ou {c: ...}
  const commentDir = trimmed.match(/^\{(?:comment|c):\s*([^}]+)\}$/i);
  if (commentDir) return commentDir[1].trim();

  // Diretivas com chavetas simples: {Refrão}, {Estrofe 1}, {Intro}, {Ponte}, etc.
  const match = trimmed.match(/^\{([A-Za-zÀ-ÖØ-öø-ÿ0-ÿ0-9][\w\sÀ-ÖØ-öø-ÿ-.:]*)\}$/);
  if (match) return match[1];

  // Feature 16: Diretivas em parênteses retos: [Refrão], [Intro], [Estrofe 1], [Ponte], [Coda], etc.
  const bracketMatch = trimmed.match(/^\[([A-Za-zÀ-ÖØ-öø-ÿ0-9][\w\sÀ-ÖØ-öø-ÿ-.:]*)\]$/);
  if (bracketMatch) {
    const inner = bracketMatch[1].trim();
    if (SECTION_KEYWORD_REGEX.test(inner)) {
      return inner;
    }
  }

  const commentMatch = trimmed.match(/^#\s*(.+)$/);
  if (commentMatch) return commentMatch[1];
  return null;
}

/**
 * Devolve as classes de cor para diferenciar visualmente cada tipo de secção musical:
 * - Refrão / Coro: Âmbar / Dourado
 * - Ponte / Pré-Refrão / Interlúdio: Roxo / Violeta
 * - Intro / Solo / Instrumental: Azul Céu
 * - Final / Fim / Coda / Outro: Rosa / Coral
 * - Estrofe / Verso (padrão): Verde Escuteiro
 */
export function getSectionBadgeClasses(sectionHeader: string): string {
  const s = (sectionHeader || '').trim().toLowerCase();

  // Pré-Refrão deve ser verificado antes de Refrão para não cair na regra de Refrão
  if (/pr[eé]-?refr[aã]o|pre-?chorus|ponte|bridge|interl[uú]dio/i.test(s)) {
    return 'text-purple-900 bg-purple-100 dark:bg-purple-950/70 dark:text-purple-300 border-purple-300 dark:border-purple-700 shadow-xs';
  }

  if (/refr[aã]o|coro|chorus|aclama[çc][aã]o|aleluia|santo/i.test(s)) {
    return 'text-amber-900 bg-amber-100 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-700 shadow-xs';
  }

  if (/intro(?:du[çc][aã]o)?|solo|instrumental/i.test(s)) {
    return 'text-sky-900 bg-sky-100 dark:bg-sky-950/70 dark:text-sky-300 border-sky-300 dark:border-sky-700 shadow-xs';
  }

  if (/final|fim|coda|outro/i.test(s)) {
    return 'text-rose-900 bg-rose-100 dark:bg-rose-950/70 dark:text-rose-300 border-rose-300 dark:border-rose-700 shadow-xs';
  }

  return 'text-[#2d5016] bg-green-100/80 dark:bg-green-950/70 dark:text-green-300 border-green-200/80 dark:border-green-800';
}
