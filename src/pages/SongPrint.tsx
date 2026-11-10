import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSongs } from '../hooks/useSongs';
import { parseChordPro, transposeParsedLines } from '../lib/chordpro-parser';
import { getKeyName, ChordNotation } from '../lib/chords';
import { ChordLine } from '../components/songs/ChordLine';
import type { Song, ParsedLine } from '../lib/types';
import {
  Printer,
  FileDown,
  ArrowLeft,
  Columns,
  Type,
  Music,
  Minus,
  Plus,
  RotateCcw,
  Info,
} from 'lucide-react';

const FONT_SIZES = [
  { label: '-2', sizePx: 11, linePx: 16 },
  { label: '-1', sizePx: 13, linePx: 19 },
  { label: '0',  sizePx: 15, linePx: 22 },
  { label: '+1', sizePx: 17, linePx: 25 },
  { label: '+2', sizePx: 20, linePx: 29 },
];

export default function SongPrint() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getSong } = useSongs();

  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);

  // Print controls state
  const initialNotation = (location.state?.notation as ChordNotation) || 'alfabetica';
  const [showChords, setShowChords] = useState<boolean>(initialNotation !== 'ocultar');
  const [twoColumns, setTwoColumns] = useState(true);
  const [fontIndex, setFontIndex] = useState(2); // Default is index 2 ('0', 15px)
  const [semitones, setSemitones] = useState<number>(location.state?.semitones || 0);
  const [notation, setNotation] = useState<ChordNotation>(initialNotation === 'ocultar' ? 'alfabetica' : initialNotation);
  // Sem estado (página aberta diretamente): undefined mantém os acidentes tal como escritos
  const [preferFlats] = useState<boolean | undefined>(location.state?.preferFlats);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      try {
        const data = await getSong(id);
        if (!cancelled) setSong(data || null);
      } catch (err) {
        console.error('Failed to load song:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, getSong]);

  // Transpose parsed lines
  const parsedLines = useMemo(() => {
    if (!song) return [];
    const lines = parseChordPro(song.content);
    return transposeParsedLines(lines, semitones, preferFlats, notation);
  }, [song, semitones, preferFlats, notation]);

  // Group lines into sections for avoid-break styling in columns
  const sections = useMemo(() => {
    const res: { header?: string | null; lines: ParsedLine[] }[] = [];
    let current: { header?: string | null; lines: ParsedLine[] } = { lines: [] };

    for (const line of parsedLines) {
      if (line.sectionHeader) {
        if (current.lines.length > 0 || current.header) {
          res.push(current);
        }
        current = { header: line.sectionHeader, lines: [] };
      } else if (line.isBlank && current.lines.length > 0) {
        res.push(current);
        current = { lines: [] };
      } else {
        current.lines.push(line);
      }
    }
    if (current.lines.length > 0 || current.header) {
      res.push(current);
    }
    return res;
  }, [parsedLines]);

  const currentKeyDisplay = song?.original_key
    ? getKeyName(song.original_key, semitones, preferFlats, notation === 'silabica' ? 'silabica' : 'alfabetica')
    : '';

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-zinc-950 text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
      </div>
    );
  }

  if (!song) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-zinc-950 text-white p-4">
        <p className="text-lg mb-4">Música não encontrada.</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-amber-500 text-black font-semibold rounded-lg"
        >
          Voltar ao Início
        </button>
      </div>
    );
  }

  const currentFont = FONT_SIZES[fontIndex];

  return (
    <div className="min-h-screen bg-zinc-900 text-gray-100 py-6 px-4 sm:px-6 lg:px-8 print:bg-white print:text-black print:p-0">
      {/* Top Bar (screen only) */}
      <div className="max-w-6xl mx-auto mb-6 flex items-center justify-between print:hidden">
        <button
          onClick={() => navigate(`/song/${song.id}`)}
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Cântico
        </button>
        <span className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
          Modo de Impressão e PDF
        </span>
      </div>

      {/* Main Container: Sheet on Left/Center + Controls on Right */}
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-start justify-center gap-8 print:block print:max-w-none print:w-full print:m-0">
        
        {/* ============================================================== */}
        {/* THE PAPER SHEET (Styled as white A4 page)                      */}
        {/* ============================================================== */}
        <div
          id="print-sheet"
          className="print-sheet bg-white text-black shadow-2xl rounded-sm border border-gray-300 w-full max-w-[850px] min-h-[1100px] p-8 sm:p-12 transition-all print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none print:w-full print:rounded-none"
        >
          {/* Header */}
          <div className="border-b border-gray-300 pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-black tracking-tight leading-tight">
                  {song.title}
                </h1>
                {song.artist && (
                  <p className="text-sm sm:text-base font-semibold text-gray-700 mt-0.5">
                    por {song.artist}
                  </p>
                )}
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                {currentKeyDisplay ? (
                  <span className="inline-block px-2.5 py-0.5 bg-gray-100 border border-gray-300 text-xs font-bold rounded text-gray-800">
                    Tom: {currentKeyDisplay}
                  </span>
                ) : null}
                {(() => {
                  const effectivePrintCapo = location.state?.capo !== undefined ? location.state.capo : song.capo;
                  return effectivePrintCapo && effectivePrintCapo > 0 ? (
                    <span className="inline-block px-2.5 py-0.5 bg-amber-50 border border-amber-300 text-xs font-bold rounded text-amber-900">
                      Capo: {effectivePrintCapo}ª Casa
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
          </div>

          {/* LYRICS & CHORDS CONTENT (Two Columns and Font Size directly scaled) */}
          <div
            className={`font-mono transition-all ${twoColumns ? 'w-full' : 'max-w-2xl'}`}
            style={{
              columnCount: twoColumns ? 2 : 1,
              columnGap: '2.5rem',
              columnFill: 'balance',
              fontSize: `${currentFont.sizePx}px`,
              lineHeight: `${currentFont.linePx}px`,
            }}
          >
            {sections.map((section, sIdx) => {
              const hasAnyLyrics = section.lines.some((l) =>
                (l.tokens || []).some((t) => t.text && t.text.trim())
              );
              if (!showChords && !hasAnyLyrics) {
                return null;
              }
              return (
                <div
                  key={sIdx}
                  className="mb-5 break-inside-avoid [page-break-inside:avoid]"
                  style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                >
                  {section.header && (
                    <div className="font-bold text-gray-900 border-b border-gray-200 pb-0.5 mb-1.5 text-[0.8em] uppercase tracking-wider inline-block">
                      [{section.header}]
                    </div>
                  )}
                  {section.lines.map((line, lIdx) => (
                    <div key={lIdx} className="my-0.5">
                      <ChordLine tokens={line.tokens || []} showChords={showChords} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* ============================================================== */}
        {/* RIGHT SIDEBAR CONTROLS (Screen only)                           */}
        {/* ============================================================== */}
        <div className="w-full lg:w-80 shrink-0 space-y-4 print:hidden lg:sticky lg:top-8">
          <div className="bg-zinc-800/90 border border-zinc-700/80 backdrop-blur rounded-2xl p-5 shadow-xl space-y-5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-zinc-700 pb-3">
              <Type className="w-4 h-4 text-amber-400" />
              Opções de Impressão
            </h3>

            {/* 1. CHORDS TOGGLE */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <Music className="w-4 h-4 text-zinc-400" />
                <span>Mostrar Acordes</span>
              </div>
              <button
                type="button"
                onClick={() => setShowChords(!showChords)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                  showChords ? 'bg-green-500' : 'bg-zinc-600'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    showChords ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 2. TWO COLUMNS TOGGLE */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <Columns className="w-4 h-4 text-zinc-400" />
                <span>Duas Colunas</span>
              </div>
              <button
                type="button"
                onClick={() => setTwoColumns(!twoColumns)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                  twoColumns ? 'bg-green-500' : 'bg-zinc-600'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    twoColumns ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 3. FONT SIZE CONTROLS */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-700/60">
              <span className="text-sm font-medium text-zinc-200">
                Tamanho da Fonte <span className="text-xs text-zinc-400">({FONT_SIZES[fontIndex].label})</span>
              </span>
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-lg p-1">
                <button
                  onClick={() => setFontIndex(Math.max(0, fontIndex - 1))}
                  disabled={fontIndex === 0}
                  className="w-7 h-7 flex items-center justify-center rounded text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                  title="Diminuir tamanho"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-bold text-amber-400 px-1.5 min-w-[1.5rem] text-center">
                  {FONT_SIZES[fontIndex].label}
                </span>
                <button
                  onClick={() => setFontIndex(Math.min(FONT_SIZES.length - 1, fontIndex + 1))}
                  disabled={fontIndex === FONT_SIZES.length - 1}
                  className="w-7 h-7 flex items-center justify-center rounded text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                  title="Aumentar tamanho"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 4. TOM / TRANSPOSIÇÃO (Only if chords enabled) */}
            {showChords && (
              <div className="flex items-center justify-between pt-2 border-t border-zinc-700/60">
                <div>
                  <span className="text-sm font-medium text-zinc-200 block">Tom</span>
                  <span className="text-xs font-bold text-amber-400">
                    {currentKeyDisplay || 'Padrão'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-lg p-1">
                  <button
                    onClick={() => setSemitones(semitones - 1)}
                    className="w-7 h-7 flex items-center justify-center rounded text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer text-xs font-bold"
                    title="-1 semitom"
                  >
                    -1
                  </button>
                  {semitones !== 0 && (
                    <button
                      onClick={() => setSemitones(0)}
                      className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                      title="Repor tom original"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => setSemitones(semitones + 1)}
                    className="w-7 h-7 flex items-center justify-center rounded text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer text-xs font-bold"
                    title="+1 semitom"
                  >
                    +1
                  </button>
                </div>
              </div>
            )}

            {/* Capo / Braçadeira */}
            {song.capo && song.capo > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-zinc-700/60">
                <span className="text-sm font-medium text-zinc-200 block">Capo / Braçadeira</span>
                <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  {song.capo}ª Casa
                </span>
              </div>
            )}

            {/* 5. NOTATION (C D E vs Dó Ré Mi - Only if chords enabled) */}
            {showChords && (
              <div className="flex items-center justify-between pt-2 border-t border-zinc-700/60">
                <span className="text-sm font-medium text-zinc-200">Notação</span>
                <div className="flex bg-zinc-900 border border-zinc-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setNotation('silabica')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      notation === 'silabica'
                        ? 'bg-amber-500 text-black shadow'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Dó Ré Mi
                  </button>
                  <button
                    onClick={() => setNotation('alfabetica')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      notation === 'alfabetica'
                        ? 'bg-amber-500 text-black shadow'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    C D E
                  </button>
                </div>
              </div>
            )}

            {/* ACTION BUTTONS (PRINT & DOWNLOAD PDF) */}
            <div className="pt-4 border-t border-zinc-700 space-y-2.5">
              <button
                onClick={handlePrint}
                className="w-full py-3 bg-[#ffc83d] hover:bg-[#e6b436] text-black font-black text-sm uppercase tracking-wider rounded-xl shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>

              <button
                onClick={handlePrint}
                className="w-full py-2.5 bg-zinc-700/60 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl border border-zinc-600 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                title="Abre a janela de impressão onde podes escolher 'Guardar como PDF'"
              >
                <FileDown className="w-4 h-4" />
                Descarregar PDF
              </button>
            </div>

            {/* Dica para remover cabeçalhos/rodapés do navegador */}
            <div className="pt-3 border-t border-zinc-700/60">
              <div className="p-3 bg-zinc-900/90 rounded-xl border border-zinc-700 text-xs text-zinc-300 flex items-start gap-2.5 leading-relaxed">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-zinc-100 block mb-0.5">Dica para impressão limpa:</span>
                  Na janela do navegador ao imprimir, em <em>Opções</em>, desmarca a caixa <strong>"Cabeçalhos e rodapés"</strong> para não aparecer a data, a hora e o link na folha.
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
