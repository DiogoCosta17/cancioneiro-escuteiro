import { convertToChordPro } from './chordpro-converter';
import { cleanAndAlignChordPro } from './chordpro-parser';
import { normalizeDetectedKey, ConversionResult } from './gemini-vision';
import { supabase } from './supabase';

export interface UrlImportResult extends ConversionResult {
  youtubeUrl?: string;
  sourceUrl: string;
}

const ASCII_TAB_LINE_RE = /^\s*[eEBGDAE][|#:]?[-0-9hHpPbBrRsS/\\~xX|()[\]\s]{6,}\s*$/;

// 1x1 PNG transparente para compatibilidade retroativa caso a Edge Function no Supabase exija imageBase64
const TINY_1X1_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * Decodifica entidades HTML comuns preservando todos os espaços horizontais.
 */
function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Remove linhas de tablatura ASCII (E|---0---2---|) e rodapés de dicionário de acordes do CifraClub.
 */
export function stripTablatureAndFooters(rawText: string): { cleanedText: string; detectedCapo: number | null; detectedKey: string } {
  let detectedCapo: number | null = null;
  let detectedKey = '';

  const capoMatch =
    rawText.match(/(?:capo(?:traste|dastro)?|braçadeira)\s*(?:na|no|:)?\s*(\d+)[ªº°]?\s*(?:casa|traste|fret)?/i) ||
    rawText.match(/capo\s+(\d+)\s*fr/i);
  if (capoMatch) {
    const num = parseInt(capoMatch[1], 10);
    if (num > 0 && num <= 12) detectedCapo = num;
  }

  const keyMatch = rawText.match(/^(?:tom|key|tonalidade)\s*:\s*([A-G][#b♯♭]?m?(?:\b)|(?:D[óo]|R[ée]|Mi|F[áa]|Sol|L[áa]|Si)[#b♯♭]?-?m?)/im);
  if (keyMatch) {
    detectedKey = keyMatch[1].trim();
  }

  // Cortar rodapé "----------------- Acordes -----------------" do CifraClub
  const footerIdx = rawText.search(/^-{5,}\s*Acordes\s*-{5,}/im);
  const textWithoutFooter = footerIdx >= 0 ? rawText.substring(0, footerIdx) : rawText;

  const lines = textWithoutFooter.split(/\r?\n/);
  const filteredLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Ignorar linhas de metadados no topo da cifra ("Tom: G", "Capotraste na 2ª casa", "Afinação: E A D G B E")
    if (/^(?:tom|key|tonalidade)\s*:\s*\S+$/i.test(trimmed)) continue;
    if (/^(?:capo(?:traste|dastro)?|braçadeira)\s*(?:na|no|:)?\s*\d+/i.test(trimmed)) continue;
    if (/^(?:afina[çc][aã]o|tuning)\s*:/i.test(trimmed)) continue;
    // Ignorar linhas de tablatura ASCII (E|---0---|)
    if (ASCII_TAB_LINE_RE.test(trimmed)) continue;

    filteredLines.push(line);
  }

  return {
    cleanedText: filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    detectedCapo,
    detectedKey,
  };
}

/**
 * Normaliza etiquetas de secção em inglês/espanhol/português para o padrão do Cancioneiro.
 */
function normalizeSectionHeaders(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (/^\[?primeira\s+parte\]?$/i.test(t)) return '{Estrofe 1}';
      if (/^\[?segunda\s+parte\]?$/i.test(t)) return '{Estrofe 2}';
      if (/^\[?terceira\s+parte\]?$/i.test(t)) return '{Estrofe 3}';
      if (/^\[?quarta\s+parte\]?$/i.test(t)) return '{Estrofe 4}';

      const m = t.match(/^(?:\[|\{)?(verse|verso|estrofe|chorus|refr[aã]o(?:\s+final)?|coro|bridge|ponte|pre-?chorus|pr[eé]-?refr[aã]o|intro(?:du[çc][aã]o)?|outro|final|fim|coda|solo|instrumental|interl[uú]dio)(?:\s+(\d+))?(?:\]|\}|:)?$/i);
      if (!m) return line;
      const rawType = m[1].toLowerCase();
      const num = m[2] ? ` ${m[2]}` : '';
      if (rawType === 'verse' || rawType === 'verso' || rawType === 'estrofe') return `{Estrofe${num || ' 1'}}`;
      if (rawType === 'chorus' || rawType === 'coro' || rawType.startsWith('refr')) return '{Refrão}';
      if (rawType === 'bridge' || rawType === 'ponte') return '{Ponte}';
      if (/^pre-?chorus|^pr[eé]-?refr/.test(rawType)) return '{Pré-Refrão}';
      if (rawType.startsWith('intro')) return '{Intro}';
      if (rawType === 'outro' || rawType === 'final' || rawType === 'fim' || rawType === 'coda') return '{Final}';
      if (rawType === 'solo' || rawType === 'instrumental') return '{Solo}';
      if (rawType.startsWith('interl')) return '{Interlúdio}';
      return line;
    })
    .join('\n');
}

/**
 * Deteta automaticamente estrofes ({Estrofe 1}, {Estrofe 2}...) e refrões repetidos ({Refrão})
 * em cifras que não têm cabeçalhos explícitos em todos os blocos.
 */
function autoStructureStanzas(chordProText: string): string {
  // Se um bloco {Intro} tiver linhas instrumentais seguidas imediatamente por linhas com letra sem linha em branco,
  // separar as linhas instrumentais da primeira estrofe.
  const preSplitText = chordProText.replace(
    /(\{Intro\}\n(?:\s*(?:\[[^\]]+\]\s*)+\n)+)(?=\s*(?:\[[^\]]+\])*[^\s[\]\n])/gi,
    '$1\n'
  );

  const rawBlocks = preSplitText
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  // Uma etiqueta sozinha ("Intro:" seguido de linha em branco, como no LaCuerda) pertence ao bloco seguinte
  const blocks: string[] = [];
  for (let i = 0; i < rawBlocks.length; i++) {
    const next = rawBlocks[i + 1];
    if (/^\{[^}]+\}$/.test(rawBlocks[i]) && next && !/^\{[^}]+\}/.test(next)) {
      blocks.push(`${rawBlocks[i]}\n${next}`);
      i++;
    } else {
      blocks.push(rawBlocks[i]);
    }
  }

  if (blocks.length <= 1) return chordProText;

  // Se a música já tiver {Estrofe ...} ou {Refrão} na maioria dos blocos, não re-etiquetar
  const existingVerseOrChorus = blocks.filter((b) => /^\{(?:Estrofe|Refr[aã]o|Ponte)/i.test(b)).length;
  if (existingVerseOrChorus >= 2) return blocks.join('\n\n');

  const getLyricFingerprint = (block: string): string => {
    return block
      .split('\n')
      .filter((l) => !/^\{[^}]+\}$/.test(l.trim()))
      .join(' ')
      .replace(/\[[^\]]+\]/g, '')
      .toLowerCase()
      .replace(/[^a-zà-öø-ÿ0-9]+/gi, ' ')
      .trim();
  };

  // Contar quantas vezes cada bloco de letra aparece para identificar o Refrão
  const counts = new Map<string, number>();
  for (const block of blocks) {
    if (/^\{[^}]+\}$/.test(block.split('\n')[0].trim())) continue;
    const fp = getLyricFingerprint(block);
    if (fp.length >= 20) {
      counts.set(fp, (counts.get(fp) || 0) + 1);
    }
  }

  let estrofeCounter = 1;
  const structuredBlocks = blocks.map((block) => {
    const lines = block.split('\n');
    const firstLine = lines[0].trim();

    // Já começa com etiqueta {Intro}, {Refrão}, etc.
    if (/^\{[^}]+\}$/.test(firstLine)) {
      return block;
    }

    const fp = getLyricFingerprint(block);
    // Se não tem letra (apenas acordes instrumentais)
    if (!fp) {
      return `{Intro}\n${block}`;
    }

    if (fp.length >= 20 && (counts.get(fp) || 0) >= 2) {
      return `{Refrão}\n${block}`;
    }

    const header = `{Estrofe ${estrofeCounter++}}`;
    return `${header}\n${block}`;
  });

  return structuredBlocks.join('\n\n');
}

export type ExtractionMethod = 'ultimate-guitar' | 'pre-monospace' | 'dom-structured';

export interface ExtractedSong {
  title: string;
  artist: string;
  key: string;
  capo: number | null;
  youtubeUrl: string;
  chordProContent: string;
  extractionMethod: ExtractionMethod;
  /** Preenchido quando a página é válida mas não tem texto importável (ex.: tab "Pro" do Ultimate Guitar). */
  unsupportedReason?: string;
}

// Tipos de tab do Ultimate Guitar que são interativos (Guitar Pro, vídeo...) e não têm letra/acordes em texto
const UG_TEXTLESS_TAB_TYPES = /^(?:pro|power|official|video|guitar\s*pro)$/i;

// Sufixos que os sites acrescentam ao título ("Wonderwall Chords", "Hino (ver 2)", "Música (Cifra)")
const TITLE_TYPE_SUFFIX_RE =
  /\s+(?:official\s+)?(?:chords|tabs?|ukulele\s+chords|bass\s+tabs?|drum\s+tabs?|guitar\s+pro)(?:\s*\(ver\s*\d+\))?\s*$/i;

function cleanSongTitle(raw: string): string {
  return raw
    .replace(/\s*\((?:cifra|acordes|letra)[^)]*\)\s*$/i, '')
    .replace(/\s*\(ver\s*\d+\)\s*$/i, '')
    .replace(TITLE_TYPE_SUFFIX_RE, '')
    .trim();
}

function parseCapo(raw: unknown): number | null {
  const n = parseInt(String(raw ?? ''), 10);
  return n > 0 && n <= 12 ? n : null;
}

/** Lê o valor de um campo string de JSON embutido (`"campo":"valor com \"escapes\""`). */
function readJsonStringField(source: string, field: string): string {
  const m = source.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? parseJsonStringLiteral(m[1]).trim() : '';
}

/** Interpreta o corpo de uma string JSON (sem aspas), tolerando quebras de linha literais. */
function parseJsonStringLiteral(body: string): string {
  try {
    const safe = body.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    return String(JSON.parse(`"${safe}"`));
  } catch {
    return '';
  }
}

/**
 * Converte texto "acordes por cima da letra" num ChordPro estruturado e limpo.
 * `exactColumns`: o texto vem de uma fonte monoespaçada e a coluna de cada acorde é a sílaba exata.
 */
function textToChordPro(
  rawText: string,
  exactColumns: boolean
): { content: string; detectedCapo: number | null; detectedKey: string } {
  // Caracteres invisíveis (zero-width space no CifraClub) impedem o reconhecimento de "[Intro]" e acordes
  const visibleText = rawText.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
  const { cleanedText, detectedCapo, detectedKey } = stripTablatureAndFooters(visibleText);
  const withSections = normalizeSectionHeaders(cleanedText);
  const converted = convertToChordPro(withSections, { exactColumns });
  const structured = autoStructureStanzas(converted);
  return { content: cleanAndAlignChordPro(structured), detectedCapo, detectedKey };
}

/**
 * Deteta páginas de bloqueio anti-robô (Cloudflare "Just a moment...", captchas, "Access denied")
 * que alguns proxies devolvem com estado 200 em vez da página verdadeira.
 */
export function looksLikeBlockedPage(html: string): boolean {
  const head = html.slice(0, 30000);
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
  if (
    /^(?:just a (?:moment|second)|attention required|access denied|please wait|checking your browser|verify(?:ing)? you are (?:a )?human|security check|one more step|(?:403\s*)?forbidden|are you a robot|captcha|ddos-guard)/i.test(
      title
    )
  ) {
    return true;
  }
  return /cf_chl_opt|cf-browser-verification|Enable JavaScript and cookies to continue|captcha-delivery\.com|Checking if the site connection is secure/i.test(
    html.slice(0, 300000)
  );
}

/**
 * Ultimate Guitar: a cifra vem em JSON (`wiki_tab.content`, com acordes marcados por [ch]..[/ch]).
 * Lê-o do atributo `data-content` da div `.js-store` ou, se não existir (página renderizada por um proxy,
 * JSON dentro de <script>), procura os campos diretamente no código-fonte.
 */
function extractUltimateGuitar(html: string, doc: Document): ExtractedSong | null {
  let title = '';
  let artist = '';
  let rawKey = '';
  let capo: number | null = null;
  let tabType = '';
  let wikiContent = '';
  let foundUgData = false;

  // A) <div class="js-store" data-content="{...}">. O DOMParser decodifica as entidades do atributo,
  //    ao contrário de uma regex, que cortava o JSON no primeiro apóstrofo (ex.: "don't").
  const storeAttr = doc.querySelector('.js-store[data-content]')?.getAttribute('data-content') || '';
  if (storeAttr) {
    try {
      const store = JSON.parse(storeAttr);
      const data = store?.store?.page?.data ?? store?.page?.data ?? {};
      const tab = data?.tab ?? {};
      const tabView = data?.tab_view ?? {};
      foundUgData = !!(data?.tab || data?.tab_view);
      wikiContent = String(tabView?.wiki_tab?.content || '');
      title = String(tab.song_name || '').trim();
      artist = String(tab.artist_name || '').trim();
      rawKey = String(tab.tonality_name || tabView?.meta?.tonality || '').trim();
      capo = parseCapo(tab.capo ?? tabView?.meta?.capo);
      tabType = String(tab.type || tab.type_name || '').trim();
    } catch (e) {
      console.warn('Falha ao ler JSON do Ultimate Guitar (js-store), a tentar outras estratégias:', e);
    }
  }

  // B) JSON embutido noutro sítio: procurar os campos diretamente no código-fonte
  if (!wikiContent && /wiki_tab|\[ch\]|\[\/ch\]|&quot;song_name|"song_name/.test(html)) {
    const decoded = html.includes('&quot;') ? decodeHtmlEntities(html) : html;
    const wikiMatch =
      decoded.match(/"wiki_tab"\s*:\s*\{[^{}]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/) ||
      decoded.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*?\[ch\](?:[^"\\]|\\.)*)"/);
    if (wikiMatch) {
      wikiContent = parseJsonStringLiteral(wikiMatch[1]);
    }
    if (wikiContent || /"song_name"\s*:/.test(decoded)) {
      foundUgData = true;
      title = title || readJsonStringField(decoded, 'song_name');
      artist = artist || readJsonStringField(decoded, 'artist_name');
      rawKey = rawKey || readJsonStringField(decoded, 'tonality_name');
      capo = capo ?? parseCapo(decoded.match(/"capo"\s*:\s*"?(\d+)/)?.[1]);
      // O campo "type" não é lido aqui: é demasiado genérico fora do js-store e daria falsos positivos.
    }
  }

  if (!wikiContent.trim()) {
    if (foundUgData && UG_TEXTLESS_TAB_TYPES.test(tabType)) {
      return {
        title,
        artist,
        key: '',
        capo,
        youtubeUrl: '',
        chordProContent: '',
        extractionMethod: 'ultimate-guitar',
        unsupportedReason: `Este link do Ultimate Guitar é uma tab do tipo "${tabType}" (formato interativo, sem letra em texto). Escolhe uma versão "Chords" ou "Tabs" da mesma música e cola esse link.`,
      };
    }
    return null;
  }

  const cleanedUg = wikiContent
    .replace(/\r\n?/g, '\n')
    .replace(/\[\/?tab\]/gi, '')
    .replace(/\[ch\]([^[]*?)\[\/ch\]/gi, '$1');

  const { content, detectedCapo, detectedKey } = textToChordPro(cleanedUg, true);
  if (!capo && detectedCapo) capo = detectedCapo;
  if (!rawKey && detectedKey) rawKey = detectedKey;

  // Artistas genéricos do UG ("Misc Originals", "Misc Praise Songs"...): o autor real vem no
  // nome da música ("Nome do Autor - Nome da Música")
  if (/^misc\b/i.test(artist)) {
    const parts = title.split(/\s+[-–—]\s+/);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      artist = parts[0].trim();
      title = parts[1].trim();
    }
  }

  return {
    title: cleanSongTitle(title),
    artist,
    key: normalizeDetectedKey(rawKey, content),
    capo,
    youtubeUrl: '',
    chordProContent: content,
    extractionMethod: 'ultimate-guitar',
  };
}

/**
 * Extrai música e metadados diretamente de uma página HTML (CifraClub, Ultimate Guitar,
 * Cifras.com.br, LaCuerda, Letras, Cancioneiros HTML, blogs, etc.).
 */
export function extractSongFromHtml(html: string, _sourceUrl: string = ''): ExtractedSong {
  let title = '';
  let artist = '';
  let rawKey = '';
  let capo: number | null = null;
  let youtubeUrl = '';

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 1. Ultimate Guitar (JSON estruturado)
  const ug = extractUltimateGuitar(html, doc);
  if (ug) return ug;

  // 2. Parser DOM geral
  // Remover elementos de acessibilidade invisíveis (ex: <h2 class="u-srOnly">Menu principal</h2> no CifraClub)
  doc.querySelectorAll('.u-srOnly, [class*="srOnly"], [class*="sr-only"], [aria-hidden="true"]').forEach((el) => el.remove());

  // Extrair link do YouTube se existir na página
  const ytIframe = doc.querySelector('iframe[src*="youtube.com/embed/"], iframe[src*="youtu.be/"]');
  if (ytIframe) {
    const src = ytIframe.getAttribute('src') || '';
    const idMatch = src.match(/embed\/([a-zA-Z0-9_-]{11})/);
    if (idMatch) youtubeUrl = `https://www.youtube.com/watch?v=${idMatch[1]}`;
  }
  if (!youtubeUrl) {
    const ytLink = doc.querySelector('a[href*="youtube.com/watch?v="], a[href*="youtu.be/"]');
    if (ytLink) {
      const href = ytLink.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) youtubeUrl = href;
    }
  }
  if (!youtubeUrl) {
    const ytJsonMatch = html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
    if (ytJsonMatch) {
      youtubeUrl = `https://www.youtube.com/watch?v=${ytJsonMatch[1]}`;
    }
  }

  // Extrair Título e Artista de seletores conhecidos (CifraClub, Cifras, Schema.org, OpenGraph, h1/h2)
  const h1Title = doc.querySelector('h1.t1, .cifra_header h1, h1[itemprop="name"], main h1, article h1, h1')?.textContent?.trim();
  const h2Artist = doc.querySelector('h2.t3 a, h2.t3, .cifra_header h2, h2[itemprop="byArtist"], [itemprop="byArtist"], h1 + h2, h2')?.textContent?.trim();

  if (h1Title) title = cleanSongTitle(h1Title);
  if (h2Artist && !/^menu|vers[oõ]es|todos\s+artistas/i.test(h2Artist)) {
    artist = h2Artist;
  }

  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || doc.title || '';
  if (ogTitle) {
    // Limpar sufixos típicos de sites ("Música - Artista - Cifra Club", "MÚSICA CHORDS by Artista @ Ultimate-Guitar.Com")
    const cleanedTitle = ogTitle
      .replace(/\s*@\s*Ultimate[- ]Guitar(?:\.com)?.*$/i, '')
      .replace(/\s*[-|–—]\s*(?:Cifra\s*Club|Cifras\.com\.br|Ultimate[- ]Guitar\.com|LaCuerda\.net|Letras\.mus\.br|E-Chords).*$/i, '')
      .trim();
    const byMatch = cleanedTitle.match(
      /^(.+?)\s+(?:official\s+)?(?:chords|tabs?|ukulele\s+chords|bass\s+tabs?|acordes|cifra)(?:\s*\(ver\s*\d+\))?\s+(?:by|de|por)\s+(.+)$/i
    );
    const parts = cleanedTitle.split(/\s+[-–—]\s+/);
    if (byMatch) {
      if (!title) title = byMatch[1].trim();
      if (!artist) artist = byMatch[2].trim();
    } else if (parts.length >= 2) {
      if (!title) title = cleanSongTitle(parts[0]);
      if (!artist) artist = parts[1].replace(/\s*\(cifra.*?\)/i, '').trim();
    } else if (!title) {
      title = cleanSongTitle(cleanedTitle);
    }
  }

  // Extrair Tom e Capo do DOM (ex: #cifra_tom, #cifra_capo)
  const tomEl = doc.querySelector('#cifra_tom a, #cifra_tom, .cifra-tom, [data-cy="song-tonality"]');
  if (tomEl?.textContent) {
    rawKey = tomEl.textContent.replace(/^(?:tom|key)\s*:\s*/i, '').trim();
  }
  const capoEl = doc.querySelector('#cifra_capo, .cifra-capo, [data-cy="song-capo"]');
  if (capoEl?.textContent) {
    const m = capoEl.textContent.match(/(\d+)/);
    if (m) capo = parseCapo(m[1]) ?? capo;
  }

  // 3. Verificar blocos <pre> (CifraClub, Cifras.com.br, LaCuerda, E-Chords, Cancioneiros, UG renderizado)
  const preElements = Array.from(doc.querySelectorAll('pre')).filter((el) => (el.textContent || '').trim().length > 0);
  if (preElements.length > 0) {
    // Escolher o <pre> com maior conteúdo musical
    const bestPre = preElements.reduce((best, el) =>
      (el.textContent?.length || 0) > (best.textContent?.length || 0) ? el : best
    );

    // Converter <br> e </div> em \n preservando linhas em branco após </div>
    const preHtml = bestPre.innerHTML
      .replace(/\r\n/g, '\n')
      // <div></div> vazios (LaCuerda) não são quebras de linha
      .replace(/<(div|p|span)\b[^>]*><\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\n?<\/(?:div|p|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    const rawPreText = decodeHtmlEntities(preHtml);

    const { content, detectedCapo, detectedKey } = textToChordPro(rawPreText, true);
    if (!capo && detectedCapo) capo = detectedCapo;
    if (!rawKey && detectedKey) rawKey = detectedKey;

    if (content.trim().length >= 15) {
      return {
        title,
        artist,
        key: normalizeDetectedKey(rawKey, content),
        capo,
        youtubeUrl,
        chordProContent: content,
        extractionMethod: 'pre-monospace',
      };
    }
  }

  // 4. Páginas HTML gerais / Blogs / Cancioneiros sem <pre> (incluindo fallback se vier em formato Markdown)
  doc.querySelectorAll('script, style, nav, header, footer, aside, form, noscript, svg, iframe, button').forEach((el) => el.remove());

  const container =
    doc.querySelector('article, main, .entry-content, .post-content, .song-content, .cifra, .lyrics, #content') ||
    doc.body;

  const containerHtml = (container?.innerHTML || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|section|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  let rawBodyText = decodeHtmlEntities(containerHtml);

  // Caso algum proxy tenha devolvido cabeçalhos estilo Jina Markdown ("Title: ... URL Source: ... Markdown Content:")
  if (/^Title:\s+/m.test(rawBodyText) && /Markdown Content:/i.test(rawBodyText)) {
    const titleMatch = rawBodyText.match(/^Title:\s*(.+)$/m);
    if (titleMatch && !title) {
      const cleanedMdTitle = titleMatch[1]
        .replace(/\s*[-|–—]\s*(?:Cifra\s*Club|Cifras\.com\.br|Ultimate[- ]Guitar\.com|LaCuerda\.net|Letras\.mus\.br).*$/i, '')
        .trim();
      const parts = cleanedMdTitle.split(/\s+[-–—]\s+/);
      title = parts[0]?.trim() || cleanedMdTitle;
      if (!artist && parts[1]) artist = parts[1].trim();
    }
    rawBodyText = rawBodyText.replace(/^[\s\S]*?Markdown Content:\s*/i, '');
    rawBodyText = rawBodyText
      .replace(/^##\s+Menu.*$/gim, '')
      .replace(/\*\*([A-G][#b♯♭]?(?:m|maj|min|dim|aug|sus|add|[0-9/+()-])*)\*\*/g, '[$1]');
  }

  const { content, detectedCapo, detectedKey } = textToChordPro(rawBodyText, false);
  if (!capo && detectedCapo) capo = detectedCapo;
  if (!rawKey && detectedKey) rawKey = detectedKey;

  return {
    title,
    artist,
    key: normalizeDetectedKey(rawKey, content),
    capo,
    youtubeUrl,
    chordProContent: content,
    extractionMethod: 'dom-structured',
  };
}

/** Uma extração é "forte" quando veio de dados estruturados/monoespaçados e tem acordes reconhecidos. */
function isStrongExtraction(ex: ExtractedSong): boolean {
  return (
    ex.extractionMethod !== 'dom-structured' &&
    ex.chordProContent.trim().length >= 15 &&
    /\[[^\]\n]+\]/.test(ex.chordProContent)
  );
}

async function fetchTextWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<string | null> {
  // O timeout só é limpo depois de ler o corpo (res.text() também pode ficar pendurado)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fontes para obter o código-fonte de um URL público. Cada site bloqueia fontes diferentes
 * (ex.: o Ultimate Guitar recusa muitos IPs de servidores), por isso usam-se várias em paralelo.
 */
function buildHtmlSources(targetUrl: string): Array<() => Promise<string | null>> {
  return [
    // Jina Reader em modo HTML: executa o JavaScript da página (sites SPA) e tem CORS ativo
    () => fetchTextWithTimeout(`https://r.jina.ai/${targetUrl}`, { headers: { 'X-Return-Format': 'html' } }, 20000),
    // Edge Function própria (só para administradores autenticados): código-fonte original, sem CORS
    async () => {
      if (!supabase) return null;
      try {
        const { data, error } = await supabase.functions.invoke('gemini-vision', {
          body: { action: 'fetch-url', targetUrl },
        });
        return !error && typeof data?.html === 'string' ? data.html : null;
      } catch {
        return null;
      }
    },
    // Proxies CORS públicos
    () => fetchTextWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, {}, 15000),
    () => fetchTextWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, {}, 15000),
  ];
}

/**
 * Descarrega a página por todas as fontes em paralelo e devolve a primeira extração válida.
 * Respostas de bloqueio (Cloudflare, captcha) ou sem música são ignoradas em vez de interromperem
 * a importação. Se nenhuma fonte der dados estruturados, fica a melhor extração genérica.
 */
export async function fetchAndExtractSong(targetUrl: string): Promise<ExtractedSong> {
  const sources = buildHtmlSources(targetUrl);
  let gotAnyPage = false;
  let gotBlockedPage = false;
  let bestWeak: ExtractedSong | null = null;

  return new Promise<ExtractedSong>((resolve, reject) => {
    let pending = sources.length;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (bestWeak) {
        resolve(bestWeak);
      } else if (gotBlockedPage) {
        reject(
          new Error(
            'Este site bloqueou a leitura automática (proteção anti-robô). Tira um print da cifra e usa a opção "Foto / Print" abaixo.'
          )
        );
      } else if (gotAnyPage) {
        reject(new Error('Não foi possível encontrar letra ou acordes nesta página.'));
      } else {
        reject(new Error('Não foi possível aceder ao link indicado. Verifica se o endereço está correto e é público.'));
      }
    };

    for (const load of sources) {
      load()
        .then((html) => {
          if (settled || !html || html.trim().length < 80) return;
          gotAnyPage = true;
          if (looksLikeBlockedPage(html)) {
            gotBlockedPage = true;
            return;
          }
          let extracted: ExtractedSong;
          try {
            extracted = extractSongFromHtml(html, targetUrl);
          } catch (err) {
            console.warn('Falha a extrair a música da página:', err);
            return;
          }
          if (extracted.unsupportedReason) {
            settled = true;
            reject(new Error(extracted.unsupportedReason));
            return;
          }
          if (isStrongExtraction(extracted)) {
            settled = true;
            resolve(extracted);
            return;
          }
          if (
            extracted.chordProContent.trim().length >= 15 &&
            extracted.chordProContent.length > (bestWeak?.chordProContent.length || 0)
          ) {
            bestWeak = extracted;
          }
        })
        .catch(() => {
          // Fonte falhou: as outras continuam
        })
        .finally(() => {
          pending -= 1;
          if (pending === 0) finish();
        });
    }
  });
}

/**
 * Usa o Gemini para estruturar secções ({Estrofe 1}, {Refrão}, {Ponte}) e limpar textos vindos de páginas web,
 * preservando rigorosamente as posições de acordes já alinhadas.
 */
async function polishExtractedSongWithAi(
  extracted: ExtractedSong,
  sourceUrl: string
): Promise<UrlImportResult> {
  const prompt = `You are a music transcription and ChordPro formatting specialist.
Below is a song extracted from the webpage URL: ${sourceUrl}
Extraction method: ${extracted.extractionMethod}
Detected Title: ${extracted.title || 'UNKNOWN'}
Detected Artist: ${extracted.artist || 'UNKNOWN'}
Detected Key: ${extracted.key || 'UNKNOWN'}
Detected Capo: ${extracted.capo ?? 0}

EXTRACTED SONG TEXT:
${extracted.chordProContent.slice(0, 14000)}

MANDATORY RULES:
1. If chords are already inline in brackets like "Hoje é o [Dó]dia da [Sol]vitória", PRESERVE their exact syllable/word positions!
2. If any lines still have chords on a separate line above the lyrics, merge them inline into the lyrics line at their exact column position!
3. Remove any leftover website navigation text, ads, comments, copyright notices, or guitar tab ASCII diagrams.
4. Label song sections cleanly on their own line in Portuguese:
   - {Intro} for instrumental intros
   - {Estrofe 1}, {Estrofe 2}, {Estrofe 3}... for verses
   - {Refrão} for choruses
   - {Ponte} for bridges
   - {Final} for outros/endings
5. Keep the chord notation system (C, D, E or Dó, Ré, Mi) as it appears in the song.
6. Output ONLY in this exact format:

TITLE: <Clean Song Title>
ARTIST: <Clean Artist/Author or EMPTY>
KEY: <Musical Key>
CAPO: <Capo fret number or 0>
---
<Complete clean inline ChordPro song>`;

  try {
    let aiResponseText = '';

    // 1. Tentar Edge Function (enviando PNG 1x1 para compatibilidade retroativa com funções que exijam imageBase64)
    if (supabase) {
      try {
        const { data, error } = await supabase.functions.invoke('gemini-vision', {
          body: {
            prompt,
            imageBase64: TINY_1X1_PNG,
            mimeType: 'image/png',
          },
        });
        if (!error && data?.text) {
          aiResponseText = data.text;
        }
      } catch {
        // Sem resposta da IA: fica o texto extraído da página, sem polimento.
      }
    }

    if (aiResponseText) {
      const lines = aiResponseText.trim().split('\n');
      let aiTitle = extracted.title;
      let aiArtist = extracted.artist;
      let aiRawKey = extracted.key;
      let aiCapo = extracted.capo;
      let lastMetaIdx = -1;

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (/^TITLE:/i.test(l)) {
          const v = l.replace(/^TITLE:\s*/i, '').trim();
          if (v && v !== 'UNKNOWN') aiTitle = v;
          lastMetaIdx = i;
        } else if (/^ARTIST:/i.test(l)) {
          const v = l.replace(/^ARTIST:\s*/i, '').trim();
          if (v && v !== 'EMPTY' && v !== 'UNKNOWN') aiArtist = v;
          lastMetaIdx = i;
        } else if (/^KEY:/i.test(l)) {
          const v = l.replace(/^KEY:\s*/i, '').trim();
          if (v && v !== 'EMPTY' && v !== 'UNKNOWN') aiRawKey = v;
          lastMetaIdx = i;
        } else if (/^CAPO:/i.test(l)) {
          const m = l.match(/(\d+)/);
          if (m) {
            const n = parseInt(m[1], 10);
            if (n > 0 && n <= 12) aiCapo = n;
          }
          lastMetaIdx = i;
        }
      }

      let body = lastMetaIdx >= 0 ? lines.slice(lastMetaIdx + 1) : lines;
      while (body.length > 0 && (body[0].trim() === '---' || body[0].trim() === '')) body.shift();
      const rawBody = body.join('\n').replace(/^```(?:chordpro|text|plain)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();

      if (rawBody.length >= 30) {
        const polished = cleanAndAlignChordPro(rawBody);
        return {
          title: aiTitle,
          artist: aiArtist,
          key: normalizeDetectedKey(aiRawKey, polished),
          capo: aiCapo,
          content: polished,
          rawResponse: aiResponseText,
          youtubeUrl: extracted.youtubeUrl || undefined,
          sourceUrl,
        };
      }
    }
  } catch (err) {
    console.warn('Polimento IA opcional falhou, a usar extração determinística do código-fonte:', err);
  }

  return {
    title: extracted.title,
    artist: extracted.artist,
    key: extracted.key,
    capo: extracted.capo,
    content: extracted.chordProContent,
    rawResponse: extracted.chordProContent,
    youtubeUrl: extracted.youtubeUrl || undefined,
    sourceUrl,
  };
}

/**
 * Importa uma música a partir do link (URL) de qualquer site de cifras ou cancioneiro.
 */
export async function importSongFromUrl(
  rawUrl: string,
  onProgress?: (stage: string) => void
): Promise<UrlImportResult> {
  const trimmedUrl = rawUrl.trim();
  if (!/^https?:\/\/.+/i.test(trimmedUrl)) {
    throw new Error('Por favor, introduz um link válido começando por https:// ou http://');
  }

  if (onProgress) onProgress('Passo 1/2: A ler o código-fonte da página...');
  const extracted = await fetchAndExtractSong(trimmedUrl);

  if (onProgress) onProgress('Passo 2/2: A extrair acordes, letra, tom e estrutura para ChordPro...');

  // Quando a página tem um bloco <pre> monoespaçado (CifraClub, Cifras, LaCuerda, E-Chords, Cancioneiros)
  // ou JSON estruturado do Ultimate Guitar, os acordes já estão 100% alinhados nas sílabas exatas das colunas
  // e as estrofes/refrão já foram estruturados deterministicamente.
  if (
    (extracted.extractionMethod === 'pre-monospace' ||
      extracted.extractionMethod === 'ultimate-guitar') &&
    extracted.title
  ) {
    return {
      title: extracted.title,
      artist: extracted.artist,
      key: extracted.key,
      capo: extracted.capo,
      content: extracted.chordProContent,
      rawResponse: extracted.chordProContent,
      youtubeUrl: extracted.youtubeUrl || undefined,
      sourceUrl: trimmedUrl,
    };
  }

  return polishExtractedSongWithAi(extracted, trimmedUrl);
}
