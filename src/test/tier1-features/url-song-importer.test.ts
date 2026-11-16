import { describe, it, expect, vi, afterEach } from 'vitest';

// A Edge Function falha sempre nestes testes: a página tem de vir de um dos proxies simulados
vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: new Error('Edge Function indisponível') }),
    },
  },
  isSupabaseConfigured: true,
}));

import {
  extractSongFromHtml,
  fetchAndExtractSong,
  importSongFromUrl,
  looksLikeBlockedPage,
} from '../../lib/url-song-importer';

// Codifica o atributo como o Ultimate Guitar faz: aspas e & como entidades, apóstrofos em bruto
function ugPage(payload: unknown): string {
  const attr = JSON.stringify(payload).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html><html><head><title>Canção Teste Chords by Grupo Teste @ Ultimate-Guitar.Com</title></head>
<body><div class="js-store" data-content="${attr}"></div></body></html>`;
}

const UG_CHORDS_PAYLOAD = {
  config: { offlineMessage: "You're offline. Don't worry!" },
  store: {
    page: {
      data: {
        tab: { song_name: "Canção D'Exemplo", artist_name: 'Grupo Teste', tonality_name: 'G', capo: 2, type: 'Chords' },
        tab_view: {
          wiki_tab: {
            content: "[Verse 1]\r\n[tab][ch]G[/ch]       [ch]D[/ch]\r\nI don't want to go[/tab]\r\n",
          },
        },
      },
    },
  },
};

const CLOUDFLARE_PAGE = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head>
<body><noscript>Enable JavaScript and cookies to continue</noscript>
<script>window._cf_chl_opt={cvId:'3',cZone:'example.com'};</script></body></html>`;

function mockResponse(body: string, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as unknown as Response;
}

function stubFetch(byHost: Record<string, string | null>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [needle, body] of Object.entries(byHost)) {
      if (url.includes(needle)) return body === null ? mockResponse('', 503) : mockResponse(body);
    }
    return mockResponse('', 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('url-song-importer: extração', () => {
  it('lê o js-store do Ultimate Guitar mesmo com apóstrofos no JSON', () => {
    const extracted = extractSongFromHtml(ugPage(UG_CHORDS_PAYLOAD), 'https://example.com/cifra');
    expect(extracted.extractionMethod).toBe('ultimate-guitar');
    expect(extracted.title).toBe("Canção D'Exemplo");
    expect(extracted.artist).toBe('Grupo Teste');
    expect(extracted.key).toBe('G');
    expect(extracted.capo).toBe(2);
    expect(extracted.chordProContent).toContain('{Estrofe 1}');
    expect(extracted.chordProContent).toContain("[G]I don't");
    expect(extracted.chordProContent).toContain('[D]want');
    expect(extracted.chordProContent).not.toContain('[ch]');
  });

  it('separa o autor do título quando o artista do Ultimate Guitar é "Misc ..."', () => {
    const payload = {
      store: {
        page: {
          data: {
            tab: { song_name: 'Autor Exemplo - Canção Exemplo', artist_name: 'Misc Originals', type: 'Chords' },
            tab_view: { wiki_tab: { content: '[ch]G[/ch]   [ch]Bm[/ch]\nLinha de letra de teste' } },
          },
        },
      },
    };
    const extracted = extractSongFromHtml(ugPage(payload), 'https://example.com/cifra');
    expect(extracted.title).toBe('Canção Exemplo');
    expect(extracted.artist).toBe('Autor Exemplo');
  });

  it('encontra o JSON do Ultimate Guitar dentro de um <script> quando não há js-store', () => {
    const json = JSON.stringify({
      tab: { song_name: 'Canção do Script', artist_name: 'Grupo Teste', tonality_name: 'C' },
      tab_view: { wiki_tab: { content: '[ch]C[/ch]        [ch]Am[/ch]\nLetra de teste para o script' } },
    });
    const html = `<html><head><title>x</title></head><body><script>window.UGAPP = ${json};</script></body></html>`;
    const extracted = extractSongFromHtml(html, 'https://example.com/cifra');
    expect(extracted.extractionMethod).toBe('ultimate-guitar');
    expect(extracted.title).toBe('Canção do Script');
    expect(extracted.artist).toBe('Grupo Teste');
    expect(extracted.chordProContent).toContain('[C]Letra');
    expect(extracted.chordProContent).toContain('[Am]');
  });

  it('explica que as tabs "Pro" do Ultimate Guitar não têm texto', () => {
    const payload = {
      store: { page: { data: { tab: { song_name: 'Canção Teste', artist_name: 'Grupo Teste', type: 'Pro' }, tab_view: {} } } },
    };
    const extracted = extractSongFromHtml(ugPage(payload), 'https://example.com/cifra');
    expect(extracted.unsupportedReason).toMatch(/"Pro"/);
    expect(extracted.chordProContent).toBe('');
  });

  it('lê o <pre> de uma página do Ultimate Guitar já renderizada e limpa o título', () => {
    const html = `<html><head><meta property="og:title" content="CANCAO TESTE CHORDS by Grupo Teste @ Ultimate-Guitar.Com"></head>
<body><h1>Canção Teste Chords</h1><pre><span>[Chorus]</span>
<span data-name="Em">Em</span>        <span data-name="C">C</span>
Linha de teste aqui
</pre></body></html>`;
    const extracted = extractSongFromHtml(html, 'https://example.com/cifra');
    expect(extracted.extractionMethod).toBe('pre-monospace');
    expect(extracted.title).toBe('Canção Teste');
    expect(extracted.chordProContent).toContain('{Refrão}');
    expect(extracted.chordProContent).toContain('[Em]Linha');
  });

  it('ignora caracteres invisíveis do CifraClub e não lê "C7M" como tom menor', () => {
    const html = `<html><head><title>Canção Teste - Grupo Teste - Cifra Club</title></head><body>
<h1>Canção Teste</h1><pre>​[Intro] <b>C7M</b>  <b>Am7</b>  <b>Bm7</b>  <b>Em</b>

<b>C7M</b>               <b>Am7</b>
Linha de letra de teste
</pre></body></html>`;
    const extracted = extractSongFromHtml(html, 'https://example.com/cifra');
    expect(extracted.chordProContent).not.toContain('​');
    expect(extracted.chordProContent).toContain('{Intro}');
    expect(extracted.chordProContent).not.toContain('[Intro]');
    expect(extracted.key).toBe('C');
  });

  it('não transforma os <div></div> vazios do LaCuerda em linhas em branco', () => {
    const html = `<html><head><title>Canção Teste - Grupo Teste</title></head><body><h1>Canção Teste</h1><pre>Intro:

<div></div>    <a>G</a> -  <a>D</a> -  <a>Em</a> -  <a>C</a>


<div></div>            <a>G</a>       <a>C</a>
Primeira linha de letra
<div></div>             <a>D</a>      <a>C</a>
Segunda linha de letra
</pre></body></html>`;
    const extracted = extractSongFromHtml(html, 'https://example.com/cifra');
    const content = extracted.chordProContent;
    expect(content.match(/\{Intro\}/g)?.length).toBe(1);
    // As duas linhas de letra ficam seguidas na mesma estrofe (sem linha em branco entre elas)
    expect(content).toMatch(/\{Estrofe 1\}\n[^\n]*\[G\][^\n]*\n[^\n]*\[D\][^\n]*/);
  });

  it('deteta páginas de bloqueio anti-robô sem marcar páginas normais', () => {
    expect(looksLikeBlockedPage(CLOUDFLARE_PAGE)).toBe(true);
    expect(looksLikeBlockedPage('<html><head><title>Access denied</title></head><body>...</body></html>')).toBe(true);
    expect(looksLikeBlockedPage(ugPage(UG_CHORDS_PAYLOAD))).toBe(false);
    expect(
      looksLikeBlockedPage(
        '<html><head><title>Promessa - CNE - Cifra Club</title><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></head><body><pre>G D</pre></body></html>'
      )
    ).toBe(false);
  });
});

describe('url-song-importer: obtenção da página', () => {
  it('ignora a página de bloqueio do primeiro proxy e usa o seguinte', async () => {
    stubFetch({ 'r.jina.ai': CLOUDFLARE_PAGE, allorigins: ugPage(UG_CHORDS_PAYLOAD), codetabs: null });
    const extracted = await fetchAndExtractSong('https://example.com/cifra');
    expect(extracted.extractionMethod).toBe('ultimate-guitar');
    expect(extracted.title).toBe("Canção D'Exemplo");
  });

  it('pede para usar foto/print quando todos os acessos são bloqueados', async () => {
    stubFetch({ 'r.jina.ai': CLOUDFLARE_PAGE, allorigins: CLOUDFLARE_PAGE, codetabs: null });
    await expect(fetchAndExtractSong('https://example.com/cifra')).rejects.toThrow(/bloqueou/);
  });

  it('indica que o link não está acessível quando nenhuma fonte responde', async () => {
    stubFetch({ 'r.jina.ai': null, allorigins: null, codetabs: null });
    await expect(fetchAndExtractSong('https://site-inacessivel.invalid/cifra')).rejects.toThrow(/aceder ao link/);
  });

  it('mostra o motivo quando a tab do Ultimate Guitar é do tipo "Pro"', async () => {
    const proPayload = {
      store: { page: { data: { tab: { song_name: 'Canção Teste', artist_name: 'Grupo Teste', type: 'Pro' }, tab_view: {} } } },
    };
    stubFetch({ 'r.jina.ai': ugPage(proPayload), allorigins: null, codetabs: null });
    await expect(fetchAndExtractSong('https://example.com/cifra')).rejects.toThrow(/"Pro"/);
  });

  it('importSongFromUrl devolve a música pronta para o formulário', async () => {
    stubFetch({ 'r.jina.ai': ugPage(UG_CHORDS_PAYLOAD), allorigins: null, codetabs: null });
    const stages: string[] = [];
    const result = await importSongFromUrl('  https://example.com/cifra ', (s) => stages.push(s));
    expect(result.title).toBe("Canção D'Exemplo");
    expect(result.artist).toBe('Grupo Teste');
    expect(result.capo).toBe(2);
    expect(result.content).toContain('[D]want');
    expect(result.sourceUrl).toBe('https://example.com/cifra');
    expect(stages.length).toBe(2);
  });
});
