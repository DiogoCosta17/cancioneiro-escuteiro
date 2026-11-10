import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  normalizeSearchText,
  stripChordProMarkup,
  getMatchingLyricSnippet,
  searchAndRankSongs,
} from '../../lib/search-utils';
import { getCapoSuggestion, isBarreChord, isEasyOpenChord } from '../../lib/capo-advisor';
import { getSectionBadgeClasses } from '../../lib/chordpro-parser';
import {
  TUNER_STRINGS,
  playGuitarChord,
  playSingleString,
  detectPitchAutocorrelation,
  analyzeGuitarPitch,
} from '../../lib/audio-synth';
import { generateQrMatrix, generateQrSvgDataUrl } from '../../lib/qr-svg';
import { extractSongFromHtml, stripTablatureAndFooters } from '../../lib/url-song-importer';
import NotFound from '../../pages/NotFound';
import { ShareRepertoireModal } from '../../components/common/ShareRepertoireModal';
import { AutoScrollBar } from '../../components/songs/AutoScrollBar';
import { TunerModal } from '../../components/songs/TunerModal';
import type { Song } from '../../lib/types';

const MOCK_SONGS: Song[] = [
  {
    id: '1',
    title: 'Oração de São Francisco',
    artist: 'CNE',
    original_key: 'G',
    content: '{Estrofe 1}\n[G]Senhor, fazei de [Em]mim um instru[C]mento da Vossa [D]Paz',
    tags: ['Oração', 'Comunhão'],
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  },
  {
    id: '2',
    title: 'Hino do Corpo Nacional de Escutas',
    artist: 'Agrupamento 488',
    original_key: 'D',
    content: '{Refrão}\n[D]Sempre Alerta para [A]servir na [G]estrada da [D]promessa',
    tags: ['Escutistas', 'Promessa'],
    created_at: '2026-02-01T10:00:00Z',
    updated_at: '2026-02-01T10:00:00Z',
  },
];

describe('Distinction Features Suite (Search, Capo Advisor, Audio, QR, UI)', () => {
  beforeEach(() => {
    document.title = 'Cancioneiro 488-Mafra';
  });

  describe('1. Accent-Insensitive Weighted Search & Snippets (search-utils.ts)', () => {
    it('normalizes Portuguese accents and diacritics accurately', () => {
      expect(normalizeSearchText('  Oração   de São   João  ')).toBe('oracao de sao joao');
      expect(normalizeSearchText('Pós-Comunhão')).toBe('pos-comunhao');
    });

    it('strips ChordPro brackets and section directives cleanly', () => {
      const stripped = stripChordProMarkup('{Refrão}\n[G]Senhor, fazei de [Em]mim');
      expect(stripped).toContain('Senhor, fazei de mim');
      expect(stripped).not.toContain('[G]');
      expect(stripped).not.toContain('{Refrão}');
    });

    it('extracts matching lyric snippets without ChordPro tokens', () => {
      const snippet = getMatchingLyricSnippet(MOCK_SONGS[0].content, 'instrumento');
      expect(snippet).toBe('Senhor, fazei de mim um instrumento da Vossa Paz');
    });

    it('ranks accent-insensitive matches and sorts properly', () => {
      const results = searchAndRankSongs(MOCK_SONGS, 'oracao');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');

      const lyricMatch = searchAndRankSongs(MOCK_SONGS, 'instrumento');
      expect(lyricMatch).toHaveLength(1);
      expect(lyricMatch[0].id).toBe('1');

      const sortedRecent = searchAndRankSongs(MOCK_SONGS, '', 'recent');
      expect(sortedRecent[0].id).toBe('2');
    });
  });

  describe('2. Smart Capo Advisor (capo-advisor.ts)', () => {
    it('identifies barre chords vs easy open camp chords', () => {
      expect(isBarreChord('F#m')).toBe(true);
      expect(isBarreChord('Bm')).toBe(true);
      expect(isBarreChord('Eb')).toBe(true);
      expect(isEasyOpenChord('G')).toBe(true);
      expect(isEasyOpenChord('Em')).toBe(true);
      expect(isBarreChord('C')).toBe(false);
    });

    it('suggests Capo 2 (G/Em/C/D shapes) for a song in A with F#m and Bm', () => {
      const suggestion = getCapoSuggestion(['A', 'E', 'F#m', 'D', 'Bm'], 'A');
      expect(suggestion).not.toBeNull();
      expect(suggestion?.capoFret).toBe(2);
      expect(suggestion?.shapesSemitones).toBe(-2);
      expect(suggestion?.targetKeyShapes).toBe('G');
      expect(suggestion?.barreCountAfter).toBe(0);
    });

    it('returns null when song already uses only open chords', () => {
      expect(getCapoSuggestion(['G', 'Em', 'C', 'D'], 'G')).toBeNull();
    });

    it('suggests Capo 2 (Am shapes) instead of Capo 7 for Pequeno Rebanho in Sim (Bm)', () => {
      const suggestion = getCapoSuggestion(
        ['Sim7', 'Sim', 'Ré', 'Rémaj7', 'Lásus4', 'Lá#dim7', 'Dó9', 'Lá', 'Lám', 'Ré7'],
        'Sim'
      );
      expect(suggestion).not.toBeNull();
      expect(suggestion?.capoFret).toBe(2);
      expect(suggestion?.targetKeyShapes).toBe('Am');
    });

    it('assigns distinct badge colors for Estrofe, Refrão, Ponte, Intro, and Final', () => {
      expect(getSectionBadgeClasses('Estrofe 1')).toContain('green');
      expect(getSectionBadgeClasses('Refrão')).toContain('amber');
      expect(getSectionBadgeClasses('Ponte')).toContain('purple');
      expect(getSectionBadgeClasses('Pré-Refrão')).toContain('purple');
      expect(getSectionBadgeClasses('Intro')).toContain('sky');
      expect(getSectionBadgeClasses('Final')).toContain('rose');
    });
  });

  describe('3. Web Audio Synthesizer & Tuner (audio-synth.ts)', () => {
    it('exposes all 6 standard guitar reference strings', () => {
      expect(TUNER_STRINGS).toHaveLength(6);
      expect(TUNER_STRINGS[0].note).toBe('E2');
      expect(TUNER_STRINGS[5].note).toBe('E4');
    });

    it('gracefully handles missing AudioContext in test environment', () => {
      expect(() => playGuitarChord([-1, 3, 2, 0, 1, 0], 1)).not.toThrow();
      expect(() => playSingleString(0)).not.toThrow();
    });

    it('accurately detects fundamental pitch via autocorrelation (NSDF) and identifies closest guitar string', () => {
      const sampleRate = 44100;
      const buffer = new Float32Array(4096);
      const targetFreq = 110.0; // 5ª corda Lá (A2 = 110 Hz)
      for (let i = 0; i < buffer.length; i++) {
        // Fundamental + 2nd harmonic (realistic guitar waveform)
        buffer[i] =
          0.5 * Math.sin((2 * Math.PI * targetFreq * i) / sampleRate) +
          0.2 * Math.sin((2 * Math.PI * (targetFreq * 2) * i) / sampleRate);
      }

      const detected = detectPitchAutocorrelation(buffer, sampleRate);
      expect(detected).not.toBeNull();
      expect(Math.abs((detected ?? 0) - 110.0)).toBeLessThan(0.5);

      const analysis = analyzeGuitarPitch(detected ?? 110.0);
      expect(analysis.targetString.note).toBe('A2');
      expect(analysis.status).toBe('in-tune');
      expect(Math.abs(analysis.cents)).toBeLessThanOrEqual(5);

      // Test flat and sharp detection
      const flatAnalysis = analyzeGuitarPitch(80.0); // Below E2 (82.41 Hz)
      expect(flatAnalysis.targetString.note).toBe('E2');
      expect(flatAnalysis.status).toBe('flat');

      const sharpAnalysis = analyzeGuitarPitch(334.0); // Above E4 (329.63 Hz)
      expect(sharpAnalysis.targetString.note).toBe('E4');
      expect(sharpAnalysis.status).toBe('sharp');
    });
  });

  describe('4. Zero-Dependency Offline QR Code Generator (qr-svg.ts)', () => {
    it('generates a valid square QR matrix with intact finder patterns', () => {
      const matrix = generateQrMatrix('https://cancioneiro488.vercel.app/lista?share=1,2');
      expect(matrix.length).toBeGreaterThanOrEqual(21);
      expect(matrix.length).toBe(matrix[0].length);
      // Top-left 7x7 finder corners must be dark
      expect(matrix[0][0]).toBe(true);
      expect(matrix[0][6]).toBe(true);
      expect(matrix[6][0]).toBe(true);
      expect(matrix[6][6]).toBe(true);
      expect(matrix[3][3]).toBe(true);
    });

    it('generates a valid SVG data URL', () => {
      const dataUrl = generateQrSvgDataUrl('https://cancioneiro488.vercel.app');
      expect(dataUrl.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    });
  });

  describe('5. UI Components (NotFound, ShareRepertoireModal, AutoScrollBar, TunerModal)', () => {
    it('renders the custom 404 NotFound page and updates document.title', () => {
      render(
        <MemoryRouter>
          <NotFound />
        </MemoryRouter>
      );
      expect(screen.getByText(/Parece que saíste do trilho/i)).toBeInTheDocument();
      expect(document.title).toContain('Página Não Encontrada');
    });

    it('renders ShareRepertoireModal with QR Code SVG and share URL', () => {
      render(
        <ShareRepertoireModal
          isOpen={true}
          onClose={() => {}}
          title="Missa de Domingo"
          shareUrl="https://cancioneiro488.vercel.app/evento/123"
          songCount={5}
        />
      );
      expect(screen.getByTestId('repertoire-qr-svg')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://cancioneiro488.vercel.app/evento/123')).toBeInTheDocument();
    });

    it('renders AutoScrollBar and cycles speeds 1x..5x', () => {
      render(<AutoScrollBar />);
      const speedBtn = screen.getByLabelText(/Velocidade do Auto-Scroll/i);
      expect(speedBtn).toHaveTextContent('2x');
      fireEvent.click(speedBtn);
      expect(speedBtn).toHaveTextContent('3x');
    });

    it('renders TunerModal with automatic GuitarTuna mode and all 6 guitar strings', () => {
      render(<TunerModal isOpen={true} onClose={() => {}} />);
      expect(screen.getByText('Afinador Escuteiro')).toBeInTheDocument();
      expect(screen.getByText(/Ativar Afinador por Microfone/i)).toBeInTheDocument();
      expect(screen.getByText('AUTO ON')).toBeInTheDocument();
      expect(screen.getByText('6ª Mi')).toBeInTheDocument();
      expect(screen.getByText('1ª Mi')).toBeInTheDocument();
    });
  });

  describe('6. Universal URL Song Importer (CifraClub, Ultimate Guitar, Blogs)', () => {
    it('extracts CifraClub <pre> HTML preserving column alignment, key, capo, and YouTube link', () => {
      const cifraClubHtml = `
        <html>
          <head><title>Promessa Escutista - CNE - Cifra Club</title></head>
          <body>
            <h1 class="t1">Promessa Escutista</h1>
            <h2 class="t3"><a href="/cne/">CNE</a></h2>
            <span id="cifra_tom"><a href="#">G</a></span>
            <span id="cifra_capo">2ª casa</span>
            <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
            <pre>
[Intro] <b>G</b>  <b>D</b>  <b>Em</b>  <b>C</b>

[Primeira Parte]
<b>G</b>             <b>D</b>
Sempre alerta para servir
<b>Em</b>            <b>C</b>
No caminho da fraternidade

E|---3---2---0---|
B|---0---3---0---|

----------------- Acordes -----------------
G = 3 2 0 0 0 3
D = X X 0 2 3 2
            </pre>
          </body>
        </html>
      `;

      const extracted = extractSongFromHtml(cifraClubHtml, 'https://www.cifraclub.com.br/cne/promessa/');
      expect(extracted.title).toBe('Promessa Escutista');
      expect(extracted.artist).toBe('CNE');
      expect(extracted.key).toBe('G');
      expect(extracted.capo).toBe(2);
      expect(extracted.youtubeUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(extracted.chordProContent).toContain('[G]Sempre alerta [D]para servir');
      expect(extracted.chordProContent).not.toContain('E|---3---2---0---|');
      expect(extracted.chordProContent).not.toContain('G = 3 2 0 0 0 3');
    });

    it('extracts Ultimate Guitar js-store JSON with [ch] tags and metadata', () => {
      const ugPayload = {
        store: {
          page: {
            data: {
              tab: {
                song_name: 'Hino de São Francisco',
                artist_name: 'Escuteiros',
                tonality_name: 'Am',
                capo: 3,
              },
              tab_view: {
                wiki_tab: {
                  content: '[Intro]\r\n[tab][ch]Am[/ch]        [ch]G[/ch]\r\nSenhor fazei de mim[/tab]',
                },
              },
            },
          },
        },
      };
      const encodedJson = JSON.stringify(ugPayload).replace(/"/g, '&quot;');
      const ugHtml = `<html><body><div class="js-store" data-content="${encodedJson}"></div></body></html>`;

      const extracted = extractSongFromHtml(ugHtml, 'https://tabs.ultimate-guitar.com/tab/123');
      expect(extracted.title).toBe('Hino de São Francisco');
      expect(extracted.artist).toBe('Escuteiros');
      expect(extracted.key).toBe('Am');
      expect(extracted.capo).toBe(3);
      expect(extracted.chordProContent).toContain('[Am]Senhor [G]fazei de mim');
    });

    it('strips guitar tablature and metadata headers via stripTablatureAndFooters', () => {
      const raw = [
        'Tom: D',
        'Capotraste na 4ª casa',
        'D          A',
        'Caminhando juntos',
        'E|--2--0--|',
        'B|--3--2--|',
      ].join('\n');
      const res = stripTablatureAndFooters(raw);
      expect(res.detectedKey).toBe('D');
      expect(res.detectedCapo).toBe(4);
      expect(res.cleanedText).toContain('Caminhando juntos');
      expect(res.cleanedText).not.toContain('E|--2--0--|');
    });

    it('extracts modern CifraClub <div class="kvMV"> structure (Ergue-te Ao Sol) with [Intro] inline chords and auto-stanza labels', () => {
      const modernCifraClubHtml = `
        <html>
          <head><title>Ergue-te Ao Sol - Escuteiros - Cifra Club</title></head>
          <body>
            <h1 class="_5QAC sKA9">Ergue-te Ao Sol</h1>
            <h2 class="u-srOnly" id="header-title">Menu principal</h2>
            <h2 class="_5QAC avtl1 zljom">Escuteiros</h2>
            <pre class="_crVx" data-chord-content="true">
<div class="kvMV">[Intro] <b data-chord-name="A9">A9</b>  <b data-chord-name="F#m">F#m</b>  <b data-chord-name="E">E</b>
</div><div class="kvMV">        <b data-chord-name="A9">A9</b>  <b data-chord-name="F#m">F#m</b>  <b data-chord-name="E">E</b>
</div>
<div class="kvMV"><b data-chord-name="A9">A9</b>         <b data-chord-name="F#m">F#m</b>      <b data-chord-name="E">E</b>
Quando acordares olha por mim
</div><div class="kvMV"><b data-chord-name="A9">A9</b>     <b data-chord-name="F#m">F#m</b>                <b data-chord-name="E">E</b>
E em silêncio beija-me assim
</div>

<div class="kvMV"><b data-chord-name="E">E</b>            <b data-chord-name="A9">A9</b>
Ergue-te ao Sol
</div><div class="kvMV"><b data-chord-name="F#m">F#m</b>           <b data-chord-name="C#m">C#m</b>
Vive cada dia como um só
</div>

<div class="kvMV"><b data-chord-name="E">E</b>            <b data-chord-name="A9">A9</b>
Ergue-te ao Sol
</div><div class="kvMV"><b data-chord-name="F#m">F#m</b>           <b data-chord-name="C#m">C#m</b>
Vive cada dia como um só
</div>
            </pre>
          </body>
        </html>
      `;

      const extracted = extractSongFromHtml(
        modernCifraClubHtml,
        'https://www.cifraclub.com.br/escuteiros/ergue-te-ao-sol/'
      );
      expect(extracted.title).toBe('Ergue-te Ao Sol');
      expect(extracted.artist).toBe('Escuteiros');
      expect(extracted.chordProContent).toContain('{Intro}');
      expect(extracted.chordProContent).not.toContain('[Intro]');
      expect(extracted.chordProContent).toContain('{Estrofe 1}');
      expect(extracted.chordProContent).toContain('[A9]Quando [F#m]acordares [E]olha por mim');
      expect(extracted.chordProContent).toContain('{Refrão}');
      expect(extracted.chordProContent).toContain('[E]Ergue-te ao [A9]Sol');
    });
  });
});

