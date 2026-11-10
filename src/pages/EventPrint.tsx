import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEvent } from '../hooks/useEvents';
import { parseEventDate } from '../lib/dates';
import { parseChordPro, transposeParsedLines } from '../lib/chordpro-parser';
import { ChordNotation } from '../lib/chords';
import { ChordLine } from '../components/songs/ChordLine';
import { isAleluiaMoment } from '../lib/liturgical-moments';
import { describeEventSongKey, normalizeEventSongNotes } from '../lib/event-song-settings';
import type { ParsedLine, EventSong } from '../lib/types';
import {
  Printer,
  FileDown,
  ArrowLeft,
  Columns,
  Type,
  Music,
  Minus,
  Plus,
  FileText,
  Calendar,
  MapPin,
  Info,
  ListOrdered,
} from 'lucide-react';

const FONT_SIZES = [
  { label: '-2', sizePx: 11, linePx: 16 },
  { label: '-1', sizePx: 13, linePx: 19 },
  { label: '0',  sizePx: 15, linePx: 22 },
  { label: '+1', sizePx: 17, linePx: 25 },
  { label: '+2', sizePx: 20, linePx: 29 },
];

export default function EventPrint() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { event, eventSongs, loading, error } = useEvent(id);

  // Print controls state (uniform with SongPrint and ListPrint)
  const [showChords, setShowChords] = useState(true);
  const [twoColumns, setTwoColumns] = useState(true);
  const [fontIndex, setFontIndex] = useState(2); // '0' default (15px)
  const [pageBreakPerSong, setPageBreakPerSong] = useState(true);
  const [showIndex, setShowIndex] = useState(false);
  const [notation, setNotation] = useState<ChordNotation>('silabica');

  const validSongs = useMemo(() => {
    if (!Array.isArray(eventSongs)) return [];
    return eventSongs.filter((es): es is EventSong & { song: NonNullable<EventSong['song']> } => {
      return Boolean(es && es.song && typeof es.song === 'object');
    });
  }, [eventSongs]);

  // Versículo do Aleluia: impresso junto ao primeiro cântico do momento Aleluia
  const acclamation = event?.gospel_acclamation?.trim() || '';
  const acclamationSongId = validSongs.find(es => isAleluiaMoment(es.moment_name))?.id;

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

  if (error || !event) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-zinc-950 text-white p-4">
        <p className="text-lg mb-4">{error || 'Evento não encontrado.'}</p>
        <button
          onClick={() => navigate('/eventos')}
          className="px-4 py-2 bg-amber-500 text-black font-semibold rounded-lg cursor-pointer"
        >
          Voltar aos Eventos
        </button>
      </div>
    );
  }

  const eventDate = parseEventDate(event.date);
  const currentFont = FONT_SIZES[fontIndex];

  return (
    <div className="min-h-screen bg-zinc-900 text-gray-100 py-6 px-4 sm:px-6 lg:px-8 print:bg-white print:text-black print:p-0">
      {/* Top Bar (screen only) */}
      <div className="max-w-6xl mx-auto mb-6 flex items-center justify-between print:hidden">
        <button
          onClick={() => navigate(`/evento/${event.id}`)}
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Evento
        </button>
        <span className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
          Modo de Impressão • Repertório de Evento ({validSongs.length} músicas)
        </span>
      </div>

      {/* Main Container: Sheet on Left/Center + Controls on Right */}
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-start justify-center gap-8 print:block print:max-w-none print:w-full print:m-0">
        
        {/* ============================================================== */}
        {/* THE PAPER SHEET (Styled as white booklet pages)                */}
        {/* ============================================================== */}
        <div
          id="print-sheet"
          className="print-sheet bg-white text-black shadow-2xl rounded-sm border border-gray-300 w-full max-w-[850px] min-h-[1100px] p-8 sm:p-12 transition-all print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none print:w-full print:rounded-none"
        >
          {/* Event Header */}
          <div className="border-b-2 border-black pb-4 mb-8">
            <h1 className="text-2xl sm:text-3xl font-black text-black tracking-tight leading-tight">
              {event.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-gray-600 mt-2">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                {eventDate.toLocaleDateString('pt-PT', { 
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
                })}
              </span>
              {event.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  {event.location}
                </span>
              )}
            </div>
          </div>

          {/* Optional Printed Repertoire Index / Cover Box */}
          {showIndex && validSongs.length > 0 && (
            <div
              data-testid="print-repertoire-index"
              className={`mb-10 pb-8 border-b-2 border-black ${
                pageBreakPerSong ? 'print:[break-after:page] print:[page-break-after:always]' : 'print:mb-8'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-black text-black uppercase tracking-wider">
                  Índice do Repertório
                </h2>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  {validSongs.length} {validSongs.length === 1 ? 'cântico' : 'cânticos'}
                </span>
              </div>

              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-300 text-xs font-bold uppercase tracking-wider text-gray-700">
                      <th className="py-2 px-3 w-10">#</th>
                      <th className="py-2 px-3 w-36">Momento</th>
                      <th className="py-2 px-3">Cântico</th>
                      <th className="py-2 px-3 w-28 text-right">Tom / Capo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {validSongs.map((eventSong, idx) => {
                      const song = eventSong.song;
                      const idxInfo = describeEventSongKey(eventSong, song, notation === 'silabica' ? 'silabica' : 'alfabetica');
                      const idxKey = idxInfo.keyLabel || '—';
                      return (
                        <tr key={`index-${eventSong.id}-${idx}`} className="text-gray-900">
                          <td className="py-2 px-3 font-bold text-gray-500">{idx + 1}.</td>
                          <td className="py-2 px-3 text-xs font-bold uppercase tracking-wider text-amber-900">
                            {eventSong.moment_name || '—'}
                          </td>
                          <td className="py-2 px-3 font-semibold">
                            {song?.title || 'Sem título'}
                            {song?.artist && (
                              <span className="text-xs font-normal text-gray-500 ml-2">
                                ({song.artist})
                              </span>
                            )}
                            {acclamation && eventSong.id === acclamationSongId && (
                              <span className="block text-xs font-normal italic text-gray-600 mt-0.5">℣ {acclamation}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs font-bold">
                            <span>{idxKey}</span>
                            {idxInfo.capo > 0 ? (
                              <span className="ml-1.5 text-amber-800">(Capo {idxInfo.capo}ª)</span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Songs List */}
          <div className="space-y-12 print:space-y-0">
            {validSongs.map((eventSong, songIndex) => {
              const song = eventSong.song;
              const content = song?.content || '';
              const lines = parseChordPro(content);
              // Tom e capo escolhidos para este evento (ou os da música)
              const keyInfo = describeEventSongKey(eventSong, song, notation === 'silabica' ? 'silabica' : 'alfabetica');
              const notes = normalizeEventSongNotes(eventSong.notes);
              const processedLines = transposeParsedLines(lines, keyInfo.effectiveSemitones, keyInfo.preferFlats, notation);
              const keyDisplay = keyInfo.keyLabel;

              // Group lines into sections
              const sections: { header?: string | null; lines: ParsedLine[] }[] = [];
              let currentSection: { header?: string | null; lines: ParsedLine[] } = { lines: [] };

              for (const line of processedLines) {
                if (line.sectionHeader) {
                  if (currentSection.lines.length > 0 || currentSection.header) {
                    sections.push(currentSection);
                  }
                  currentSection = { header: line.sectionHeader, lines: [] };
                } else if (line.isBlank && currentSection.lines.length > 0) {
                  sections.push(currentSection);
                  currentSection = { lines: [] };
                } else {
                  currentSection.lines.push(line);
                }
              }
              if (currentSection.lines.length > 0 || currentSection.header) {
                sections.push(currentSection);
              }

              return (
                <div
                  key={eventSong.id}
                  className={`pb-10 mb-10 border-b border-gray-300 last:border-b-0 print:border-b-0 print:pb-0 ${
                    pageBreakPerSong ? 'print:[break-after:page] print:[page-break-after:always]' : 'print:mb-8'
                  }`}
                >
                  {/* Moment Badge (e.g. Entrada, Comunhão, etc.) */}
                  {eventSong.moment_name && (
                    <div className="mb-2">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                        {eventSong.moment_name}
                      </span>
                    </div>
                  )}
                  {acclamation && eventSong.id === acclamationSongId && (
                    <p className="mb-3 text-sm italic text-gray-800 whitespace-pre-line">
                      <span className="not-italic font-bold">℣ </span>
                      {acclamation}
                    </p>
                  )}

                  {/* Song Header */}
                  <div className="border-b border-gray-200 pb-3 mb-5 flex justify-between items-start">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-black tracking-tight flex items-baseline gap-2">
                        <span className="text-gray-400 font-normal text-lg">{songIndex + 1}.</span>
                        <span>{song?.title || 'Sem título'}</span>
                      </h2>
                      {song?.artist && (
                        <p className="text-xs sm:text-sm font-semibold text-gray-600 mt-0.5 ml-6">
                          por {song.artist}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {keyDisplay ? (
                        <span className="px-2.5 py-0.5 bg-gray-100 border border-gray-300 text-xs font-bold rounded text-gray-800">
                          Tom: {keyDisplay}
                        </span>
                      ) : null}
                      {keyInfo.capo > 0 ? (
                        <span className="px-2.5 py-0.5 bg-amber-50 border border-amber-300 text-xs font-bold rounded text-amber-900">
                          Capo: {keyInfo.capo}ª Casa
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {notes && (
                    <p className="-mt-2 mb-4 text-sm text-gray-800 whitespace-pre-line border-l-4 border-amber-300 pl-3">
                      <span className="font-bold">Nota: </span>
                      {notes}
                    </p>
                  )}

                  {/* Song Lyrics & Chords */}
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

            {/* 3. PAGE BREAK PER SONG */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <FileText className="w-4 h-4 text-zinc-400" />
                <span>1 Música por Página</span>
              </div>
              <button
                type="button"
                onClick={() => setPageBreakPerSong(!pageBreakPerSong)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                  pageBreakPerSong ? 'bg-green-500' : 'bg-zinc-600'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    pageBreakPerSong ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 3b. REPERTOIRE INDEX / COVER SHEET */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <ListOrdered className="w-4 h-4 text-zinc-400" />
                <span>Índice / Folha de Rosto</span>
              </div>
              <button
                type="button"
                aria-label="Índice / Folha de Rosto"
                onClick={() => setShowIndex(!showIndex)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                  showIndex ? 'bg-green-500' : 'bg-zinc-600'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    showIndex ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 4. FONT SIZE CONTROLS */}
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

            {/* 5. NOTATION (Only if chords enabled) */}
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
                Imprimir Repertório
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
