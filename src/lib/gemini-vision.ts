/**
 * Gemini Vision API client for image-to-ChordPro conversion.
 * Sends a base64-encoded image to the `gemini-vision` Supabase Edge Function,
 * which holds the Gemini API key server-side.
 */

import { cleanAndAlignChordPro } from './chordpro-parser';
import { convertToChordPro, isChordLine } from './chordpro-converter';
import { supabase } from './supabase';

const ALL_VALID_KEYS = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
  'Am', 'A#m', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Abm',
];

const SOLFEGE_MAP: Record<string, string> = {
  'dó': 'C', 'do': 'C', 'ré': 'D', 're': 'D', 'mi': 'E', 'fá': 'F', 'fa': 'F',
  'sol': 'G', 'lá': 'A', 'la': 'A', 'si': 'B',
};

export function normalizeDetectedKey(rawKey: string, content: string = ''): string {
  if (rawKey && rawKey.trim()) {
    let clean = rawKey.trim().replace(/^key:\s*/i, '').replace(/^tom:\s*/i, '').trim();
    const isMinor = /(-|m\b|menor|minor)/i.test(clean) && !/maj|maior/i.test(clean);
    const match = clean.match(/([a-gA-G]|d[óo]|r[ée]|mi|f[áa]|sol|l[áa]|si)(#|b|♯|♭)?/i);
    if (match) {
      const rootStr = match[1].toLowerCase();
      const acc = (match[2] || '').replace('♯', '#').replace('♭', 'b');
      const root = SOLFEGE_MAP[rootStr] || rootStr.toUpperCase();
      const candidate = `${root}${acc}${isMinor ? 'm' : ''}`;
      if (ALL_VALID_KEYS.includes(candidate)) {
        return candidate;
      }
    }
  }

  // Fallback: Infer tonal center from chords in content
  const matches = content.match(/\[([^\]]+)\]/g);
  if (matches && matches.length > 0) {
    const firstChord = matches[0].replace(/[[\]]/g, '').trim().split('/')[0];
    const isMinor = /m(?!aj)/i.test(firstChord) || firstChord.endsWith('-');
    const rootMatch = firstChord.match(/^([A-G]|d[óo]|r[ée]|mi|f[áa]|sol|l[áa]|si)(#|b|♯|♭)?/i);
    if (rootMatch) {
      const rootStr = rootMatch[1].toLowerCase();
      const acc = (rootMatch[2] || '').replace('♯', '#').replace('♭', 'b');
      const root = SOLFEGE_MAP[rootStr] || rootStr.toUpperCase();
      const candidate = `${root}${acc}${isMinor ? 'm' : ''}`;
      if (ALL_VALID_KEYS.includes(candidate)) {
        return candidate;
      }
    }
  }

  return 'C';
}

const SYSTEM_PROMPT = `You are an expert music transcription and OCR vision AI.
Your absolute duty is to convert song sheets, hymnals, and chord charts from the image into standard ChordPro format with 100% pixel-faithful vertical alignment of chords to lyrics.

MANDATORY TRANSCRIPTION & COLUMN-ALIGNMENT RULES:

1. CRITICAL: INLINE CHORD EMBEDDING ONLY (ABSOLUTELY NEVER 2-LINE FORMAT)
- In standard ChordPro, every single chord MUST be embedded DIRECTLY INSIDE the line of lyrics immediately before the syllable/letter it sounds on!
- NEVER, UNDER ANY CIRCUMSTANCES, output chords on a separate line above or below the lyrics!
- A line containing only chords like "[Sol] [Re] [Mim]" followed by a lyrics line "Jesus, aqui presente..." is STRICTLY FORBIDDEN and completely breaks sheet preview!
- EXAMPLE OF CORRECT INLINE CHORDPRO (ALWAYS DO THIS):
  {Estrofe 1}
  Quando o [Sol]dia amanhe[Ré]cer na montanha [Mi-]a[Mi-7]zul,
  no silêncio [Dó]deste vale escu[Lá-]tamos a Tua [Ré]voz.
  Vem connosco [Sol]caminhar sob a [Si7]luz do Teu a[Mi-]mor,
  para [Lá-]sempre cons[Ré]truir um mundo [Sol]melhor.

  {Refrão}
  [Sol]Milagre de a[Ré]mor tão infi[Mi-]nito,
  em que [Si-]Tu, meu Deus, te [Dó]tornas
  tão pe[Sol]queno e tão hu[Ré]milde para entrar em mim.

- FORBIDDEN (DO NOT DO THIS):
  Sol       Ré          Mi-
  Quando o dia amanhecer na montanha azul,
  [Sol] [Ré] [Mi-]
  Quando o dia amanhecer na montanha azul,

2. LITERAL CHORD CAPTURE (NO CONVERSIONS)
- Scan every line completely from far left to far right with extreme visual scrutiny.
- Capture 100% of all printed chords in the image: never omit chords at the right edge, passing chords, or chords on secondary verses.
- If a chord exists anywhere above a word or line in the image, IT MUST BE TRANSCRIBED.
- TRANSCRIBE CHORDS EXACTLY AS PRINTED (LITERAL CHORD NOTATION):
  * DO NOT convert, translate, or standardize chord names between notation systems.
  * If the sheet uses Portuguese solfège (e.g., Dó, Ré, Mi, Fá, Sol, Lá, Si, Ré-, Mi7, Sol#m), transcribe them verbatim: [Dó], [Ré-], [Mi], [Fá], [Sol], [Lá], [Si].
  * If the sheet uses international letters (e.g., C, D, E, F, G, A, B, Dm, E7), transcribe them verbatim: [C], [Dm], [E], [F], [G], [A], [B].
  * Keep whatever notation the sheet uses without altering it.

3. VERTICAL PLUMB-LINE & WORD ANCHORING
- Trace an exact vertical plumb line from the first letter of each chord printed above the lyrics down to the syllable below it.
- Insert the [Chord] token IMMEDIATELY before that exact letter or syllable inside the lyrics line.
- If a chord sits over an interior syllable of a word, place [Chord] INSIDE the word directly before that syllable (e.g., "te[A]rra", "ca[Sol]minho", "al[E]turas", "pre[Re]sente").
- If a chord starts on a word, keep a space before the bracket: "o [B]céu e a [E]terra".
- ONLY purely instrumental sections without lyrics (like {Intro}) have lines of separated chords (e.g., [G] [D] [Em] [C] or [Sol] [Ré] [Mi-] [Dó]). Lines with lyrics MUST ALWAYS have chords embedded inline!

4. RESPECT UN-CHORDED LEADING WORDS (NEVER SNAP FIRST CHORD TO START OF LINE)
- If a word or syllable has blank white space above it in the sheet, THAT WORD HAS NO CHORD and must remain completely chordless!
- NEVER slide, pull, or snap a chord to the left onto an earlier word just because that word begins a phrase, sentence, or line!
- HORIZONTAL INDENTATION CHECK FOR THE FIRST CHORD OF EVERY LINE:
  * Before placing the first chord of any line, compare the horizontal X-coordinate of that first chord against the left margin of the lyrics line below it.
  * If the first chord is indented to the RIGHT of the first word (or first 2-3 words), meaning the opening word(s) have empty white space above them, DO NOT put [Chord] at index 0 of the line!
  * Leave all leading words that sit under blank space completely chordless, and insert [Chord] directly before the exact word or syllable vertically underneath that chord:
  * CORRECT: "Quando o [Sol]dia amanhe[Ré]cer..." — NEVER: "[Sol]Quando o dia..."
  * CORRECT: "no [Fá]caminho da espe[Dó]rança e da [Sol]paz." — NEVER: "[Fá]no caminho..."
  * CORRECT: "Vinde [Dó]todos cantar [Mi]hinos de lou[Lá-]vor," — NEVER: "[Dó]Vinde todos..."
  * CORRECT: "O [A7]lobito canta [D]assim" — NEVER: "[A7]O lobito canta [D]assim"
  * CORRECT: "Já se [Sol]ouvem nossos [Dó]passos" — NEVER: "[Sol]Já se ouvem..."
- In repeated lyrical phrases (e.g. "Phrase A, Phrase A"), chords frequently resolve differently in the repetition. Inspect the blank spaces and visual columns of each phrase independently!

5. CADENCE & PASSING CHORDS ON PHRASE ENDINGS
- If a chord is printed above the final word or final syllable of a line (e.g. above "Senhor", "liberdade", "caminho", "cantar"), place [Chord] directly before that word or interior syllable (e.g. "liber[Lá-]dade,", "ca[Sol]minho.", "can[Dó]tar.").
- NEVER drop cadence chords or pull them backward onto earlier words.

6. VERBATIM LYRICS FIDELITY & NATURAL CASING
- Transcribe lyrics accurately as printed: keep all Portuguese accents and punctuation. DO NOT translate lyrics.
- PRESERVE EXACT PUNCTUATION: Keep commas (","), periods ("."), colons, and hyphens exactly as printed. DO NOT change commas into periods.
- NORMALIZED NATURAL CASING (NO ALL-CAPS):
  * Even if the songbook or sheet is printed in ALL-CAPS (MAIÚSCULAS), normalize it to natural sentence casing (first letter of verse capitalized, remaining in lowercase, preserving proper nouns).
- PLAIN TEXT ONLY (NO MARKDOWN / NO FONTS):
  * NEVER output markdown styling (like **bold**, *italic*, _underline_), HTML tags, or stylized/fancy Unicode fonts.
- Repeat notations like "(bis)", "(2x)", "||:", ":||" MUST REMAIN AT THE END OF THE CURRENT LINE.
- Preserve hyphenated vocal prolongations exactly as written (e.g., "gló---ó---ria", "a---men").
- If a verse or stanza in the image has NO chords printed, transcribe its lyrics WITHOUT chords.

7. TRANSCRIBE 100% OF ALL STANZAS AND VERSES (NO CUTOFFS)
- You MUST transcribe the ENTIRE song from the very first line down to the very last line at the bottom of the image!
- NEVER stop midway, NEVER summarize, NEVER omit verses or lines. If the image has 4, 5, or 6 stanzas, ALL stanzas MUST be present in the output.

8. SECTION STRUCTURE & BOLD CHORUS DETECTION
- Label every section using standard ChordPro directives on their own line:
  * {Refrão} for Chorus / Refrão / Coro / Acclamations (like "Aleluia", "Santo", "Cordeiro").
  * CRITICAL PORTUGUESE SONGBOOK RULE: In Portuguese and Scout songbooks, stanzas printed in **BOLD font weight (negrito)** are the CHORUS and MUST be labeled with {Refrão} (even if the word "Refrão" is not printed!).
  * MULTI-STANZA BOLD CHORUS: If two consecutive stanzas are BOTH printed in bold, they together form a single {Refrão} — output {Refrão} ONLY ONCE before the first bold stanza (NEVER output {Refrão} twice in a row!). Then, when normal-weight font resumes on the next stanza, label that normal-weight stanza {Estrofe 2} (or the next sequential verse number!).
  * {Estrofe 1}, {Estrofe 2}, {Estrofe 3}, etc., for normal-weight Verses.
  * {Intro} for Intro / Introdução.
  * {Ponte} for Bridge / Ponte.
- Separate sections with a blank line.

EXECUTION WORKFLOW:

STEP 1: NATIVE 0..1000 HORIZONTAL COORDINATE ALIGNMENT_MAP (BEFORE TITLE)
Use your native 0..1000 horizontal coordinate grounding (xmin and xmax in 0..1000).
First, output an ALIGNMENT_MAP: section containing one LINE entry for EVERY line in the image that has chords printed above it:
- Measure the exact horizontal xmin..xmax (in 0..1000) of the lyrics line below.
- Write the exact lyrics of that line (without chords) inside double quotes.
- After |, list every chord printed above that line in left-to-right order with its true measured xmin coordinate (in 0..1000) of the left edge of the chord: <Chord>@<xmin>.
Format for each chorded line:
LINE [<line_xmin>..<line_xmax>] "<exact lyrics of the line without chords>" | <Chord1>@<chord1_xmin>, <Chord2>@<chord2_xmin>, <Chord3>@<chord3_xmin>

STEP 2: FINAL OUTPUT (INLINE CHORDPRO ONLY)
Immediately after ALIGNMENT_MAP:, output the metadata and full song (including ALL chorded and un-chorded stanzas from top to bottom):
TITLE: <Song Title without hymnal catalogue numbers like #06 or Nº 12>
ARTIST: <Composer/Author or EMPTY>
KEY: <Musical key as printed, e.g. E, Mi, D, Ré, G, Sol, C, Dó, Am, Lá->
CAPO: <Capo fret number if printed on the sheet (e.g. 1, 2, 3), or 0 if none/unspecified>
---
{Estrofe 1} (or {Refrão})
Quando o [Sol]dia amanhe[Ré]cer na montanha [Mi-]a[Mi-7]zul,
<Remaining song lines in strict inline ChordPro format — ALL stanzas from top to bottom>`;

export interface ConversionResult {
  title: string;
  artist: string;
  key: string;
  capo?: number | null;
  content: string;
  rawResponse: string;
  coordinateAlignedCount?: number;
}

const VOWELS_RE = /[aeiouáéíóúâêôãõàü]/i;
const INSEPARABLE_CLUSTERS_RE = /^(?:ch|lh|nh|qu|gu|[bcdfgptv][lr])$/i;

function charVisualWidth(ch: string): number {
  if (ch === ' ') return 0.52;
  if (/[.,;:'"!|iíIÍl1jtf]/.test(ch)) return 0.48;
  if (/[r]/.test(ch)) return 0.65;
  if (/[mwMW]/.test(ch)) return 1.45;
  if (/[A-ZÀ-ÖØ-Þ]/.test(ch)) return 1.22;
  return 1.0;
}

function getSyllableStarts(word: string): number[] {
  const starts = [0];
  let i = 1;
  while (i < word.length) {
    const prevHasVowel = VOWELS_RE.test(word.slice(starts[starts.length - 1], i));
    if (prevHasVowel) {
      const ch = word[i];
      const next = word[i + 1] || '';
      if (!VOWELS_RE.test(ch) && VOWELS_RE.test(next)) {
        const prev = word[i - 1] || '';
        if (INSEPARABLE_CLUSTERS_RE.test(prev + ch) && i - 1 > starts[starts.length - 1]) {
          starts.push(i - 1);
        } else {
          starts.push(i);
        }
        i += 2;
        continue;
      }
    }
    i++;
  }
  return starts;
}

function snapToSyllableByVisualRatio(text: string, ratio: number): number {
  const cum = [0];
  for (let i = 0; i < text.length; i++) {
    cum.push(cum[i] + charVisualWidth(text[i]));
  }
  const totalWidth = cum[cum.length - 1] || 1;
  const targetW = ratio * totalWidth;

  const candidates: { idx: number; w: number }[] = [];
  const wordRegex = /[A-Za-zÀ-ÖØ-öø-ÿ']+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRegex.exec(text)) !== null) {
    const wStart = m.index;
    const word = m[0];
    const sylStarts = getSyllableStarts(word);
    for (const s of sylStarts) {
      const idx = wStart + s;
      candidates.push({ idx, w: cum[idx] });
    }
  }
  if (candidates.length === 0) return 0;

  let best = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.abs(c.w - targetW);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best.idx;
}

function normalizeLyricForMatch(s: string): string {
  return s
    .replace(/\[[^\]]*\]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCoordinateAlignmentMap(fullText: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const lineRegex = /LINE\s*\[(\d+)\s*\.\.\s*(\d+)\]\s*"([^"]+)"\s*\|\s*(.+)$/gim;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(fullText)) !== null) {
    const xmin = parseInt(m[1], 10);
    const xmax = parseInt(m[2], 10);
    const lyric = m[3].trim();
    const chordsRaw = m[4].trim();
    if (!lyric || !(xmax > xmin)) continue;

    const chordPairs: { chord: string; x: number }[] = [];
    const chordRegex = /([A-Za-zÀ-ÖØ-öø-ÿ0-9#b♯♭/+()-]+)\s*@\s*(\d+)/g;
    let cm: RegExpExecArray | null;
    while ((cm = chordRegex.exec(chordsRaw)) !== null) {
      chordPairs.push({ chord: cm[1].trim(), x: parseInt(cm[2], 10) });
    }
    if (chordPairs.length === 0) continue;

    const inserts = chordPairs
      .map((ch) => {
        // Se o acorde estiver muito para lá do fim da linha (acorde instrumental de passagem no fim)
        if (ch.x > xmax + 35) {
          return { chord: ch.chord, idx: lyric.length };
        }
        const ratio = Math.max(0, Math.min(1, (ch.x - xmin) / (xmax - xmin)));
        const idx = snapToSyllableByVisualRatio(lyric, ratio);
        return { chord: ch.chord, idx };
      })
      .sort((a, b) => b.idx - a.idx);

    let alignedLine = lyric;
    for (const ins of inserts) {
      alignedLine = alignedLine.slice(0, ins.idx) + `[${ins.chord}]` + alignedLine.slice(ins.idx);
    }
    const normKey = normalizeLyricForMatch(lyric);
    const existing = map.get(normKey) || [];
    existing.push(alignedLine);
    map.set(normKey, existing);
  }
  return map;
}

function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let cleaned = rawTitle
    .replace(/^[A-Za-zÀ-ÿ]+\s*#\d+\s*[-–—:]?\s*/i, '')
    .replace(/^#\d+\s*[-–—:]?\s*/i, '')
    .replace(/^\d+[\s.-]+/, '')
    .trim();

  if (!cleaned) {
    cleaned = rawTitle.replace(/#\d+/g, '').replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return cleaned;
}

function parseGeminiResponse(text: string): ConversionResult {
  const lines = text.trim().split('\n');
  let title = '';
  let artist = '';
  let rawKey = '';
  let detectedCapo: number | null = null;
  let lastMetaLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^TITLE:/i.test(line)) {
      title = line.replace(/^TITLE:\s*/i, '').trim();
      lastMetaLineIdx = i;
    } else if (/^ARTIST:/i.test(line)) {
      const val = line.replace(/^ARTIST:\s*/i, '').trim();
      artist = val === 'EMPTY' ? '' : val;
      lastMetaLineIdx = i;
    } else if (/^KEY:/i.test(line) || /^TOM:/i.test(line)) {
      const val = line.replace(/^(?:KEY|TOM):\s*/i, '').trim();
      rawKey = val === 'EMPTY' ? '' : val;
      lastMetaLineIdx = i;
    } else if (/^CAPO:/i.test(line) || /^BRA[ÇC]ADEIRA:/i.test(line)) {
      const val = line.replace(/^(?:CAPO|BRA[ÇC]ADEIRA):\s*/i, '').trim();
      const numMatch = val.match(/\d+/);
      if (numMatch) {
        const parsed = parseInt(numMatch[0], 10);
        if (parsed > 0 && parsed <= 12) {
          detectedCapo = parsed;
        }
      }
      lastMetaLineIdx = i;
    }
  }

  let bodyLines: string[] = [];
  if (lastMetaLineIdx >= 0) {
    bodyLines = lines.slice(lastMetaLineIdx + 1);
    while (bodyLines.length > 0 && (bodyLines[0].trim() === '---' || bodyLines[0].trim() === '')) {
      bodyLines.shift();
    }
  } else {
    const sepIdx = lines.findIndex((l) => l.trim() === '---');
    if (sepIdx >= 0) {
      bodyLines = lines.slice(sepIdx + 1);
    } else {
      bodyLines = lines;
    }
  }

  // Remove any scratchpad / visual alignment lines if present in bodyLines
  bodyLines = bodyLines.filter((l) => {
    const t = l.trim();
    if (/^###\s*(?:VISUAL|ALIGNMENT|STEP)/i.test(t)) return false;
    if (/^(?:ALIGNMENT_MAP|STEP\s*\d+|LINE\s*\[\d+)/i.test(t)) return false;
    if (/^\*\s*(?:Line|\*\*Line)/i.test(t)) return false;
    if (/^(?:Line \d+:|- Line \d+:|- \[[^\]]+\] is directly above|- \[[^\]]+\] ->|- \[Chord\d*\])/i.test(t)) return false;
    if (/^Words with NO chord/i.test(t)) return false;
    return true;
  });

  // If the model appended audit notes at the bottom after a '---' separator
  const trailingNotesIdx = bodyLines.findIndex(
    (l, idx) =>
      idx > 0 &&
      l.trim() === '---' &&
      bodyLines.slice(idx + 1).some((sub) => /^(?:notes|corrections|alterações|observações|auditoria)/i.test(sub.trim()))
  );
  if (trailingNotesIdx >= 0) {
    bodyLines = bodyLines.slice(0, trailingNotesIdx);
  }

  const rawContent = bodyLines.join('\n').trim();

  // Clean up any markdown code fences or markdown bold/underline formatting
  const cleanContent = rawContent
    .replace(/^```(?:chordpro|text|plain)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .trim();

  // Fail-safe automático: Detetar se o modelo devolveu formato tradicional de 2 linhas
  // (linha de acordes por cima de linha de letra). Se sim, faz merge automático para ChordPro inline!
  const contentLines = cleanContent.split('\n');
  const hasTwoLineChords = contentLines.some((line, idx) => {
    if (!isChordLine(line)) return false;
    const next = contentLines[idx + 1];
    return next !== undefined && next.trim() !== '' && !isChordLine(next);
  });

  let contentToPolish = cleanContent;
  if (hasTwoLineChords) {
    contentToPolish = convertToChordPro(cleanContent);
  }

  // Apply 0..1000 horizontal coordinate alignment map (if emitted by the vision model)
  const coordMap = parseCoordinateAlignmentMap(text);
  let coordinateAlignedCount = 0;
  if (coordMap.size > 0) {
    contentToPolish = contentToPolish
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || /^\{.*\}$/.test(trimmed)) return line;
        const normKey = normalizeLyricForMatch(trimmed);
        const queue = coordMap.get(normKey);
        if (queue && queue.length > 0) {
          coordinateAlignedCount++;
          return queue.length > 1 ? queue.shift()! : queue[0];
        }
        return line;
      })
      .join('\n');
  }

  // Smart normalization: ensure no words are glued together across chords,
  // ensure chords anchor properly to words/syllables, and preserve all word boundaries
  // Also deduplicate consecutive {Refrão} headers when a chorus spans two consecutive bold stanzas
  const rawPolished = cleanAndAlignChordPro(contentToPolish);
  const polishedLines: string[] = [];
  let activeSection = '';
  for (const line of rawPolished.split('\n')) {
    const dirMatch = line.trim().match(/^\{([^}]+)\}$/);
    if (dirMatch) {
      const secName = dirMatch[1].trim().toLowerCase();
      if (/^refr[aã]o|^coro|^chorus/i.test(secName) && activeSection === 'refrao') {
        // Skip duplicate {Refrão} when already inside the chorus block
        continue;
      }
      activeSection = /^refr[aã]o|^coro|^chorus/i.test(secName) ? 'refrao' : secName;
    }
    polishedLines.push(line);
  }
  const polishedContent = polishedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const normalizedKey = normalizeDetectedKey(rawKey, polishedContent);

  // Fallback: se o capo não estava no cabeçalho mas estiver mencionado na letra/cifra
  if (!detectedCapo) {
    const capoMatch = polishedContent.match(/(?:capo(?:dastro)?|braçadeira)\s*(?:na|no)?\s*(\d+)ª?\s*casa/i) 
      || polishedContent.match(/(?:capo(?:dastro)?|braçadeira)\s*[:=]?\s*(\d+)/i)
      || polishedContent.match(/\{capo:\s*(\d+)\}/i);
    if (capoMatch) {
      const parsed = parseInt(capoMatch[1], 10);
      if (parsed > 0 && parsed <= 12) {
        detectedCapo = parsed;
      }
    }
  }

  return {
    title: cleanTitle(title),
    artist,
    key: normalizedKey,
    capo: detectedCapo,
    content: polishedContent,
    rawResponse: text,
    coordinateAlignedCount,
  };
}

function buildAuditPrompt(preliminaryText: string): string {
  return `You are a meticulous, uncompromising music sheet auditor.
Your job is to compare the preliminary ChordPro transcription against the original image and verify every single chord, word, and section line-by-line with pixel-level scrutiny.

PRELIMINARY TRANSCRIPTION:
${preliminaryText}

MANDATORY LINE-BY-LINE AUDIT RULES:

0. AUDIT INLINE CHORD EMBEDDING (NEVER TWO-LINE FORMAT):
   - Every chord MUST be embedded directly inside the lyrics line (e.g. "[Sol]Jesus, aqui pre[Re]sente em forma [Mim]re[Mim7]al,").
   - NEVER output or leave chords on a separate line above a lyrics line (e.g. NEVER "[Sol] [Re] [Mim]" followed by "Jesus...").

1. AUDIT UN-CHORDED LEADING WORDS & HORIZONTAL COLUMN FIDELITY:
   - Check every single chord in the preliminary transcription against the image columns.
   - CRITICAL FIRST-CHORD CHECK: Did the preliminary transcription mistakenly place a chord at the very beginning of a line (index 0) when in the image that first chord is actually indented to the right above the 2nd, 3rd, or 4th word?
   - Inspect the first word(s) of EVERY line in the image: if there is blank white space above the opening word(s), MOVE the first chord rightwards to the exact word or syllable directly underneath the chord!
     * Example: If the image has "Sol" above "dia", fix "[Sol]Quando o dia..." -> "Quando o [Sol]dia..."
     * Example: If the image has "Fá" above "caminho", fix "[Fá]no caminho..." -> "no [Fá]caminho..."
     * Example: If the image has "Dó" above "todos", fix "[Dó]Vinde todos..." -> "Vinde [Dó]todos..."
     * Example: If the image has "Sol" above "ouvem", fix "[Sol]Já se ouvem..." -> "Já se [Sol]ouvem..."
   - Check interior syllables: if a chord sits over an interior syllable (e.g. "amanhe[Ré]cer", "liber[Lá-]dade", "espe[Dó]rança", "ca[Sol]minho", "can[Dó]tar"), place the bracket directly before that syllable!
   - Check repeated phrases: ensure chords are not blindly duplicated from the first repetition.

2. AUDIT MISSING CHORDS & CADENCE RESOLUTIONS:
   - Count the printed chords on each line in the image. Ensure 100% of printed chords are present in the output.
   - Pay special attention to chords near the right margin and cadence chords over the final word/syllable of phrases. If the preliminary text missed the chord on the final word, restore it!

3. AUDIT LITERAL NOTATION (NO CONVERSIONS):
   - Keep chords exactly as printed in the sheet (whether Portuguese solfège [Lá-], [Mi-], [Dó] or international letters [Am], [Em], [C]). Do NOT translate.

4. AUDIT PUNCTUATION & NATURAL CASING:
   - Preserve exact punctuation (commas, periods) from the image. Do NOT replace commas with periods.
   - Natural Portuguese sentence casing only (no ALL-CAPS). Plain text only (no bold, no markdown).

5. NEVER TRUNCATE OR OMIT STANZAS:
   - Ensure all verses and stanzas from the preliminary transcription and image are kept!
   - NEVER cut off the song before the final stanza. Every single line of the song must be preserved.

6. SECTIONS & DIRECTIVES (INCLUDING BOLD CHORUS):
   - Ensure section tags like {Refrão}, {Estrofe 1}, {Estrofe 2}, {Intro}, {Ponte} are preserved on their own line!
   - Check font weight in the image: stanzas printed in **BOLD (negrito)** are the {Refrão} (place {Refrão} only ONCE at the start of the bold chorus block, even if the chorus has 2 bold stanzas), while normal-weight stanzas are {Estrofe 1}, {Estrofe 2}, {Estrofe 3}, etc. Ensure {Estrofe N} is placed when normal-weight text resumes after a bold {Refrão}!

OUTPUT FORMAT:
First output a brief ALIGNMENT_MAP: listing each chorded line and the exact syllable/word directly beneath each chord in the image (especially checking if the first chord on any chorus or verse line is indented past the first word or syllable, e.g. amanhe[Ré]cer, no [Fá]caminho, espe[Dó]rança, liber[Lá-]dade).
Then immediately output:

TITLE: <Song Title>
ARTIST: <Composer or EMPTY>
KEY: <Key as printed on the sheet>
CAPO: <Capo fret number if printed on the sheet, or 0 if none>
---
<Audited and corrected ChordPro content — ALL stanzas preserved>`;
}

async function callGeminiApi(
  prompt: string,
  base64Data: string,
  mimeType: string
): Promise<string> {
  // O browser nunca fala diretamente com o Google: a chave do Gemini vive só como secret
  // da Edge Function `gemini-vision` do Supabase.
  if (!supabase) {
    throw new Error('Não foi possível processar a partitura: o Supabase não está configurado.');
  }

  const { data, error } = await supabase.functions.invoke('gemini-vision', {
    body: { prompt, base64Data, mimeType },
  });

  if (!error && data?.text) {
    return data.text;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (error) {
    // Se a resposta tiver um erro detalhado no body
    let msg = error.message;
    if (error.context && typeof error.context.json === 'function') {
      try {
        const body = await error.context.json();
        if (body?.error) msg = body.error;
      } catch {}
    }
    throw new Error(`Erro no servidor de conversão: ${msg}`);
  }

  throw new Error('Não foi possível processar a partitura. Verifica se a Edge Function gemini-vision está ativa no Supabase.');
}

/**
 * Redimensiona/comprime automaticamente imagens muito grandes (ex: fotos de telemóvel 4000x3000px)
 * para máx. 2200px JPEG (qualidade 0.90), evitando erros de limite de payload na Edge Function
 * e acelerando o envio sem perda de nitidez para OCR musical.
 */
async function optimizeImageForVision(
  base64Image: string,
  mimeType: string
): Promise<{ base64Data: string; mimeType: string }> {
  const rawBase64 = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') {
    return { base64Data: rawBase64, mimeType };
  }

  // Se a imagem já for pequena (< ~1.2MB em base64), envia diretamente
  if (rawBase64.length < 1_600_000) {
    return { base64Data: rawBase64, mimeType };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 2200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ base64Data: rawBase64, mimeType });
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const compressedBase64 = compressedDataUrl.split(',')[1] || rawBase64;
        resolve({ base64Data: compressedBase64, mimeType: 'image/jpeg' });
      } catch {
        resolve({ base64Data: rawBase64, mimeType });
      }
    };
    img.onerror = () => resolve({ base64Data: rawBase64, mimeType });
    img.src = base64Image.includes(',') ? base64Image : `data:${mimeType};base64,${rawBase64}`;
  });
}

export async function convertImageToChordPro(
  base64Image: string,
  mimeType: string,
  onProgress?: (stage: string) => void
): Promise<ConversionResult> {
  const { base64Data, mimeType: effectiveMimeType } = await optimizeImageForVision(base64Image, mimeType);

  // PASSO 1: Extração inicial de letra, acordes, tom, secções e coordenadas horizontais 0..1000
  if (onProgress) onProgress('A extrair letra, acordes e alinhamento espacial...');
  const pass1Text = await callGeminiApi(SYSTEM_PROMPT, base64Data, effectiveMimeType);
  const pass1Result = parseGeminiResponse(pass1Text);

  // Se o Passo 1 já incluiu e aplicou o mapa de coordenadas horizontais 0..1000 (ALIGNMENT_MAP),
  // o alinhamento ao nível da sílaba já foi calculado matematicamente — devolve de imediato!
  if (pass1Result.coordinateAlignedCount && pass1Result.coordinateAlignedCount > 0 && pass1Result.content.length > 40) {
    return pass1Result;
  }

  // PASSO 2 (Fallback): Auditoria e auto-verificação caso o modelo não tenha emitido coordenadas no Passo 1
  if (onProgress) onProgress('Passo 2/2: A auditar acordes em falta e alinhamento com a imagem...');
  try {
    const auditPrompt = buildAuditPrompt(pass1Result.content || pass1Result.rawResponse || pass1Text);
    const pass2Text = await callGeminiApi(auditPrompt, base64Data, effectiveMimeType);
    const pass2Result = parseGeminiResponse(pass2Text);

    // Proteção essencial: o Passo 2 NUNCA pode ter menos de 85% do tamanho do Passo 1,
    // caso contrário significa que o modelo resumiu, truncou ou omitiu estrofes da imagem!
    const pass1Length = (pass1Result.content || '').length;
    const pass2Length = (pass2Result.content || '').length;

    if (pass2Result.content && pass2Result.content.length > 20 && (pass1Length === 0 || pass2Length >= pass1Length * 0.85)) {
      if (!pass2Result.title && pass1Result.title) {
        pass2Result.title = pass1Result.title;
      }
      if ((!pass2Result.key || pass2Result.key === 'C') && pass1Result.key && pass1Result.key !== 'C') {
        pass2Result.key = pass1Result.key;
      }
      if (!pass2Result.artist && pass1Result.artist) {
        pass2Result.artist = pass1Result.artist;
      }
      if (!pass2Result.capo && pass1Result.capo) {
        pass2Result.capo = pass1Result.capo;
      }
      // Se o Passo 1 detectou tags de secção ({Refrão}, {Estrofe}) e o Passo 2 as omitiu:
      if (!/\{[A-Za-zÀ-ÿ0-9 ]+\}/.test(pass2Result.content) && /\{[A-Za-zÀ-ÿ0-9 ]+\}/.test(pass1Result.content)) {
        const pass1SectionMatch = pass1Result.content.match(/^(\{[A-Za-zÀ-ÿ0-9 ]+\})/m);
        if (pass1SectionMatch) {
          pass2Result.content = `${pass1SectionMatch[1]}\n${pass2Result.content}`;
        }
      }
      return pass2Result;
    } else if (pass1Length > 0 && pass2Length < pass1Length * 0.85) {
      console.warn(`Passo 2 truncou o conteúdo (${pass2Length} caracteres vs ${pass1Length} do Passo 1). A manter a transcrição completa do Passo 1.`);
    }
  } catch (auditErr) {
    console.warn('Passo 2 de verificação falhou temporariamente; a usar resultado do Passo 1:', auditErr);
  }

  return pass1Result;
}
