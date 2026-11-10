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

  const blocks = preSplitText
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

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

/**
 * Extrai música e metadados diretamente de uma página HTML (CifraClub, Ultimate Guitar,
 * Cifras.com.br, LaCuerda, Letras, Cancioneiros HTML, blogs, etc.).
 */
export function extractSongFromHtml(html: string, _sourceUrl: string = ''): {
  title: string;
  artist: string;
  key: string;
  capo: number | null;
  youtubeUrl: string;
  chordProContent: string;
  extractionMethod: 'ultimate-guitar' | 'pre-monospace' | 'dom-structured';
} {
  let title = '';
  let artist = '';
  let rawKey = '';
  let capo: number | null = null;
  let youtubeUrl = '';

  // 1. Verificar formato Ultimate Guitar (<div class="js-store" data-content="...">)
  const ugMatch = html.match(/class=["']js-store["'][^>]*data-content=["']([^"']+)["']/i);
  if (ugMatch) {
    try {
      const jsonStr = decodeHtmlEntities(ugMatch[1]);
      const store = JSON.parse(jsonStr);
      const tab = store?.store?.page?.data?.tab;
      const tabView = store?.store?.page?.data?.tab_view;
      const wikiContent: string = tabView?.wiki_tab?.content || '';

      if (tab?.song_name) title = String(tab.song_name).trim();
      if (tab?.artist_name) artist = String(tab.artist_name).trim();
      if (tab?.tonality_name) rawKey = String(tab.tonality_name).trim();
      if (tabView?.meta?.tonality) rawKey = rawKey || String(tabView.meta.tonality).trim();
      const rawUgCapo = tab?.capo ?? tabView?.meta?.capo;
      if (rawUgCapo) {
        const parsedCapo = parseInt(String(rawUgCapo), 10);
        if (parsedCapo > 0 && parsedCapo <= 12) capo = parsedCapo;
      }

      if (wikiContent) {
        const cleanedUg = wikiContent
          .replace(/\r\n/g, '\n')
          .replace(/\[tab\]/gi, '')
          .replace(/\[\/tab\]/gi, '')
          .replace(/\[ch\]([^[]+?)\[\/ch\]/gi, '$1');

        const { cleanedText, detectedCapo, detectedKey } = stripTablatureAndFooters(cleanedUg);
        if (!capo && detectedCapo) capo = detectedCapo;
        if (!rawKey && detectedKey) rawKey = detectedKey;

        const withSections = normalizeSectionHeaders(cleanedText);
        const converted = convertToChordPro(withSections);
        const structured = autoStructureStanzas(converted);
        const polished = cleanAndAlignChordPro(structured);

        return {
          title,
          artist,
          key: normalizeDetectedKey(rawKey, polished),
          capo,
          youtubeUrl,
          chordProContent: polished,
          extractionMethod: 'ultimate-guitar',
        };
      }
    } catch (e) {
      console.warn('Falha ao ler JSON do Ultimate Guitar, a continuar com parser HTML:', e);
    }
  }

  // 2. Parser DOM geral
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

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

  if (h1Title) title = h1Title;
  if (h2Artist && !/^menu|vers[oõ]es|todos\s+artistas/i.test(h2Artist)) {
    artist = h2Artist;
  }

  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || doc.title || '';
  if (ogTitle) {
    // Limpar sufixos típicos de sites ("Música - Artista - Cifra Club", "Música Chords by Artista")
    const cleanedTitle = ogTitle
      .replace(/\s*[-|–—]\s*(?:Cifra\s*Club|Cifras\.com\.br|Ultimate[- ]Guitar\.com|LaCuerda\.net|Letras\.mus\.br).*$/i, '')
      .trim();
    const parts = cleanedTitle.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) {
      if (!title) title = parts[0].trim();
      if (!artist) artist = parts[1].replace(/\s*\(cifra.*?\)/i, '').trim();
    } else if (!title) {
      title = cleanedTitle;
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
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 12) capo = n;
    }
  }

  // 3. Verificar blocos <pre> (CifraClub, Cifras.com.br, LaCuerda, E-Chords, Cancioneiros)
  const preElements = Array.from(doc.querySelectorAll('pre'));
  if (preElements.length > 0) {
    // Escolher o <pre> com maior conteúdo musical
    const bestPre = preElements.reduce((best, el) =>
      (el.textContent?.length || 0) > (best.textContent?.length || 0) ? el : best
    );

    // Converter <br> e </div> em \n preservando linhas em branco após </div>
    const preHtml = bestPre.innerHTML
      .replace(/\r\n/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\n?<\/(?:div|p|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    const rawPreText = decodeHtmlEntities(preHtml);

    const { cleanedText, detectedCapo, detectedKey } = stripTablatureAndFooters(rawPreText);
    if (!capo && detectedCapo) capo = detectedCapo;
    if (!rawKey && detectedKey) rawKey = detectedKey;

    const withSections = normalizeSectionHeaders(cleanedText);
    const converted = convertToChordPro(withSections);
    const structured = autoStructureStanzas(converted);
    const polished = cleanAndAlignChordPro(structured);

    return {
      title,
      artist,
      key: normalizeDetectedKey(rawKey, polished),
      capo,
      youtubeUrl,
      chordProContent: polished,
      extractionMethod: 'pre-monospace',
    };
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

  const { cleanedText, detectedCapo, detectedKey } = stripTablatureAndFooters(rawBodyText);
  if (!capo && detectedCapo) capo = detectedCapo;
  if (!rawKey && detectedKey) rawKey = detectedKey;

  const withSections = normalizeSectionHeaders(cleanedText);
  const converted = convertToChordPro(withSections);
  const structured = autoStructureStanzas(converted);
  const polished = cleanAndAlignChordPro(structured);

  return {
    title,
    artist,
    key: normalizeDetectedKey(rawKey, polished),
    capo,
    youtubeUrl,
    chordProContent: polished,
    extractionMethod: 'dom-structured',
  };
}

/**
 * Descarrega o código-fonte HTML de um URL público usando Jina HTML Reader (que suporta CORS e ultrapassa Cloudflare 522),
 * Edge Function e proxies de fallback.
 */
async function fetchWebpageHtml(targetUrl: string): Promise<string> {
  // 1. Tentar Jina Reader em modo HTML puro ('X-Return-Format': 'html') — rápido (~1s), CORS ativo e preserva <pre>
  // O timeout só é limpo depois de ler o corpo (res.text() também pode ficar pendurado)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`https://r.jina.ai/${targetUrl}`, {
      headers: {
        'X-Return-Format': 'html',
      },
      signal: controller.signal,
    });
    if (res.ok) {
      const html = await res.text();
      if (html && html.trim().length > 100 && /<[a-z][\s\S]*>/i.test(html)) {
        return html;
      }
    }
  } catch {
    // Continua para Edge Function / outros proxies
  } finally {
    clearTimeout(timeout);
  }

  // 2. Tentar via Supabase Edge Function (se suportar fetch-url)
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('gemini-vision', {
        body: { action: 'fetch-url', targetUrl },
      });
      if (!error && data?.html && typeof data.html === 'string' && data.html.length > 100) {
        return data.html;
      }
    } catch {
      // Continua para os proxies CORS de cliente
    }
  }

  // 3. Outros proxies CORS públicos de fallback
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
  ];

  let lastErr: Error | null = null;
  for (const proxyUrl of proxies) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(proxyUrl, { signal: controller.signal });

      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 80) {
          return text;
        }
      }
    } catch (err: any) {
      lastErr = err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastErr || new Error('Não foi possível aceder ao link indicado. Verifica se o endereço é público.');
}

/**
 * Usa o Gemini para estruturar secções ({Estrofe 1}, {Refrão}, {Ponte}) e limpar textos vindos de páginas web,
 * preservando rigorosamente as posições de acordes já alinhadas.
 */
async function polishExtractedSongWithAi(
  extracted: ReturnType<typeof extractSongFromHtml>,
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
  const html = await fetchWebpageHtml(trimmedUrl);

  if (onProgress) onProgress('Passo 2/2: A extrair acordes, letra, tom e estrutura para ChordPro...');
  const extracted = extractSongFromHtml(html, trimmedUrl);

  if (!extracted.chordProContent || extracted.chordProContent.trim().length < 15) {
    throw new Error('Não foi possível encontrar letra ou acordes nesta página.');
  }

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
