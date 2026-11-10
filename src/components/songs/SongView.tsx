import React, { useEffect, useMemo, useState } from 'react';
import { Song } from '../../lib/types';
import { parseChordPro, transposeParsedLines, getSectionBadgeClasses } from '../../lib/chordpro-parser';
import { useTranspose } from '../../hooks/useTranspose';
import { ChordNotation, getKeyName, extractUniqueChords, keyPrefersFlats, transposeChord } from '../../lib/chords';
import { getCapoSuggestion } from '../../lib/capo-advisor';
import { ChordLine } from './ChordLine';
import { ChordTooltipProvider } from './ChordTooltipContext';
import { TransposeControls } from './TransposeControls';
import { ChordDiagram } from './ChordDiagram';
import { InstrumentToggle } from './InstrumentToggle';
import { YouTubePlayer, getYouTubeVideoId } from './YouTubePlayer';
import { AutoScrollBar } from './AutoScrollBar';
import { TunerModal } from './TunerModal';
import { Metronome } from './Metronome';
import { EventSongPanel, type EventSongContext } from './EventSongPanel';
import { loadSongPrefs, saveSongPrefs } from '../../lib/song-prefs';
import { semitonesForTargetKey, mod12 } from '../../lib/key-picker';
import { parseTempoDirective, isTempoDirectiveLine } from '../../lib/metronome';
import { Link } from 'react-router-dom';
import { Tag, Plus, Check, Printer, Edit } from 'lucide-react';
import { useSongList } from '../../hooks/useSongList';
import { useAuth } from '../../hooks/useAuth';

interface SongViewProps {
  song: Song;
  forceNotation?: ChordNotation;
  /** Modo palco ativo (alinhamento da Minha Lista ou de um evento): ecrã mantido ligado */
  stageMode?: boolean;
  /** Aberta a partir de um evento: tom/capo e notas definidos para esse evento */
  eventContext?: EventSongContext | null;
}

export const SongView: React.FC<SongViewProps> = ({ song, forceNotation, stageMode = false, eventContext = null }) => {
  const { isAdmin } = useAuth();
  // Tom do evento (quando definido) tem prioridade sobre o tom guardado neste dispositivo
  // (o componente é recriado por música via `key`)
  const eventKey = eventContext?.keySettings ?? null;
  const [savedPrefs] = useState(() => eventKey ?? loadSongPrefs(song.id));
  const { semitones, transposeUp, transposeDown, resetTranspose, setTranspose } = useTranspose(savedPrefs?.semitones ?? 0);
  const { isInList, toggleSong } = useSongList();
  const isSelected = isInList(song.id);

  const baseCapo = song?.capo && song.capo > 0 ? song.capo : 0;
  const [notation, setNotation] = useState<ChordNotation>('silabica');
  // null = automático (segue a armação de clave do tom); true/false = escolha manual do utilizador
  const [flatsOverride, setFlatsOverride] = useState<boolean | null>(null);
  const [isTunerOpen, setIsTunerOpen] = useState<boolean>(false);
  const [selectedCapo, setSelectedCapo] = useState<number>(savedPrefs?.capo ?? baseCapo);

  const activeNotation = forceNotation || notation;

  // Verifica se há vídeo válido antes de reservar a coluna lateral
  const youtubeUrl = song?.youtube_url;
  const hasValidVideo = useMemo(() => {
    if (!youtubeUrl || typeof youtubeUrl !== 'string') return false;
    const trimmed = youtubeUrl.trim();
    if (!trimmed) return false;
    return Boolean(getYouTubeVideoId(trimmed) || /^https?:\/\//i.test(trimmed));
  }, [youtubeUrl]);

  const songContent = song?.content || '';

  // Deslocamento total aplicado às posições de acordes:
  // Subir o Capo em +N casas baixa os desenhos de acordes em -N meios-tons para manter a mesma altura real
  const effectiveSemitones = semitones - (selectedCapo - baseCapo);

  // Sem escolha manual: sem transposição mantém os acidentes tal como escritos (Sib continua Sib);
  // transposto, usa bemóis ou sustenidos conforme o tom de destino (ex: Fá -> Sib, não Lá#)
  const autoFlats = useMemo(() => {
    if (effectiveSemitones === 0 || !song?.original_key) return undefined;
    return keyPrefersFlats(transposeChord(song.original_key, effectiveSemitones, false));
  }, [effectiveSemitones, song?.original_key]);
  const preferFlats = flatsOverride ?? autoFlats;
  const flatsActive = preferFlats ?? (song?.original_key ? keyPrefersFlats(song.original_key) ?? false : false);
  const toggleFlats = () => setFlatsOverride(!flatsActive);

  // Andamento da diretiva ChordPro {tempo: N} (BPM inicial do metrónomo)
  const songTempo = useMemo(() => parseTempoDirective(songContent), [songContent]);

  // Linhas parseadas e transpostas (a diretiva {tempo: N} não é mostrada como secção)
  const parsedLines = useMemo(() => {
    const visibleContent = songTempo
      ? songContent.split('\n').filter((line) => !isTempoDirectiveLine(line)).join('\n')
      : songContent;
    const lines = parseChordPro(visibleContent);
    return transposeParsedLines(lines, effectiveSemitones, preferFlats, activeNotation);
  }, [songContent, songTempo, effectiveSemitones, preferFlats, activeNotation]);

  // Lista de acordes únicos utilizados nas posições atuais (com Capo e Tom aplicados)
  const uniqueChords = useMemo(() => {
    return extractUniqueChords(songContent, effectiveSemitones, preferFlats);
  }, [songContent, effectiveSemitones, preferFlats]);

  // Acordes e tom reais (sem Capo) para calcular sempre a sugestão de Capo de forma consistente
  const unCapoedSemitones = semitones + baseCapo;
  const soundingKeyAlpha = useMemo(() => {
    if (!song?.original_key) return '';
    return getKeyName(song.original_key, unCapoedSemitones, preferFlats, 'alfabetica');
  }, [song?.original_key, unCapoedSemitones, preferFlats]);

  const unCapoedChords = useMemo(() => {
    return extractUniqueChords(songContent, unCapoedSemitones, preferFlats);
  }, [songContent, unCapoedSemitones, preferFlats]);

  const currentKeyDisplay = song?.original_key 
    ? getKeyName(song.original_key, effectiveSemitones, preferFlats, activeNotation === 'silabica' ? 'silabica' : 'alfabetica')
    : '';

  const capoSuggestion = useMemo(() => {
    return getCapoSuggestion(unCapoedChords, soundingKeyAlpha || song?.original_key);
  }, [unCapoedChords, soundingKeyAlpha, song?.original_key]);

  const handleResetTranspose = () => {
    // Volta ao original; o efeito abaixo apaga a preferência guardada
    setSelectedCapo(baseCapo);
    resetTranspose();
  };

  // Saltar para um tom: mantém o capo escolhido e ajusta a transposição para que o tom apresentado seja o pedido
  const handleSelectKey = (targetKey: string) => {
    if (!song?.original_key) return;
    setTranspose(semitonesForTargetKey(song.original_key, targetKey, selectedCapo - baseCapo));
  };

  const effectiveCapo = selectedCapo;
  const hasCustomState = semitones !== 0 || selectedCapo !== baseCapo;

  // Memória por música: guarda tom/capo neste dispositivo (ou apaga se voltar ao original).
  // Com tom definido pelo evento não se grava: o tom do evento não deve passar a ser o pessoal.
  const usesEventKey = Boolean(eventKey);
  useEffect(() => {
    if (usesEventKey) return;
    saveSongPrefs(song.id, { semitones, capo: selectedCapo }, baseCapo);
  }, [song.id, semitones, selectedCapo, baseCapo, usesEventKey]);

  const applyEventKey = (settings: { semitones: number; capo: number }) => {
    setSelectedCapo(settings.capo);
    setTranspose(settings.semitones);
  };

  return (
    <ChordTooltipProvider notation={activeNotation}>
      <div className="w-full">
      {/* CABEÇALHO LIMPO (Sem caixa fechada, integrado na página) */}
      <div className="pb-8 border-b border-gray-200/80 dark:border-zinc-800/80 mb-8 space-y-6">
        {/* Bloco 1: Etiquetas, Título e Artista (Largura Total sem compressão horizontal) */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3 print:hidden">
            {song.tags && song.tags.length > 0 ? (
              song.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-green-100/90 dark:bg-green-950/60 text-green-900 dark:text-green-300 text-xs font-semibold rounded-full uppercase tracking-wider border border-green-200 dark:border-green-800"
                >
                  <Tag className="w-3 h-3" />
                  {tag}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 text-xs font-semibold rounded-full uppercase tracking-wider border border-gray-200 dark:border-zinc-700">
                <Tag className="w-3 h-3" />
                Cancioneiro
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-5xl font-black text-gray-900 dark:text-gray-100 tracking-tight leading-tight">
              {song.title}
            </h1>
            {isAdmin && (
              <Link
                to={`/admin/edit/${song.id}`}
                className="print:hidden p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Editar esta música no painel de administração"
              >
                <Edit className="w-5 h-5 sm:w-6 sm:h-6" />
              </Link>
            )}
          </div>

          {song.artist && (
            <p className="text-lg sm:text-xl text-gray-600 dark:text-zinc-400 mt-2 font-medium">
              {song.artist}
            </p>
          )}
        </div>

        {/* Bloco 2: Ações da Música + Barra de Tom e Acordes */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pt-1 print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => toggleSong(song.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all border text-sm cursor-pointer ${
                isSelected
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                  : 'bg-white dark:bg-zinc-800/80 text-gray-700 dark:text-zinc-200 border-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700'
              }`}
            >
              {isSelected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{isSelected ? 'Na Minha Lista' : 'Adicionar à Lista'}</span>
            </button>

            <Link
              to={`/song/${song.id}/print`}
              state={{ semitones: effectiveSemitones, notation: activeNotation, preferFlats: flatsActive, capo: effectiveCapo }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all border text-sm bg-white dark:bg-zinc-800/80 text-gray-700 dark:text-zinc-200 border-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 shadow-sm cursor-pointer"
              title="Abrir página de impressão e exportação em PDF"
            >
              <Printer className="w-4 h-4 text-amber-500" />
              <span>Imprimir / PDF</span>
            </Link>

            <Metronome initialBpm={songTempo} />
          </div>

          {/* CONTROLOS DE TOM E ACORDES (Estilo Vitamina C / Referência do Utilizador) */}
          <div className="w-full xl:w-auto overflow-x-auto pb-1 sm:pb-0">
            <TransposeControls
              semitones={semitones}
              hasCustomState={hasCustomState}
              notation={activeNotation}
              preferFlats={flatsActive}
              currentKey={currentKeyDisplay}
              soundingKey={soundingKeyAlpha}
              capo={effectiveCapo}
              onSelectCapo={setSelectedCapo}
              capoSuggestion={capoSuggestion}
              onOpenTuner={() => setIsTunerOpen(true)}
              onTransposeUp={transposeUp}
              onTransposeDown={transposeDown}
              onReset={handleResetTranspose}
              onToggleFlats={toggleFlats}
              onSelectNotation={setNotation}
              originalKey={song.original_key}
              keyOffset={mod12(effectiveSemitones)}
              onSelectKey={song.original_key ? handleSelectKey : undefined}
              hasSavedPrefs={hasCustomState && !usesEventKey}
            />
          </div>
        </div>
      </div>

      {eventContext && (
        <EventSongPanel
          song={song}
          context={eventContext}
          current={{ semitones, capo: selectedCapo }}
          notation={activeNotation === 'silabica' ? 'silabica' : 'alfabetica'}
          onApply={applyEventKey}
        />
      )}

      {eventContext?.gospelAcclamation && (
        <div className="mb-8 p-5 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20">
          <h2 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1">Versículo</h2>
          <p className="text-base sm:text-lg text-gray-900 dark:text-gray-100 italic whitespace-pre-line">{eventContext.gospelAcclamation}</p>
        </div>
      )}

      {/* CORPO DA PÁGINA (Com blend natural e suporte a vídeo do YouTube) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
        {/* COLUNA PRINCIPAL: LETRA & DIAGRAMAS */}
        <div className={hasValidVideo ? "lg:col-span-8" : "lg:col-span-12 max-w-4xl"}>
          {/* Título LETRA com sublinhado elegante estilo Vitamina C */}
          <div className="mb-6 pb-2 border-b-2 border-[#0073a8]/20 dark:border-sky-400/30 inline-block print:hidden">
            <span className="text-xs font-black uppercase tracking-widest text-[#0073a8] dark:text-sky-400">
              LETRA & ACORDES
            </span>
          </div>

          {/* Letra com Acordes */}
          <div className="font-sans text-base sm:text-lg leading-relaxed text-gray-800 dark:text-gray-200 space-y-1">
            {parsedLines.map((line, lineIndex) => {
              if (line.sectionHeader) {
                return (
                  <div key={lineIndex} className="pt-6 pb-2 first:pt-0">
                    <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${getSectionBadgeClasses(line.sectionHeader)}`}>
                      {line.sectionHeader}
                    </span>
                  </div>
                );
              }

              if (line.tokens && line.tokens.length > 0) {
                return (
                  <div key={lineIndex} className="min-h-[1.75rem]">
                    <ChordLine 
                      tokens={line.tokens} 
                      showChords={activeNotation !== 'ocultar'} 
                      notation={activeNotation}
                      interactive={true}
                    />
                  </div>
                );
              }

              // Espaço entre estrofes
              return <div key={lineIndex} className="h-5"></div>;
            })}
          </div>

          {/* DIAGRAMAS DE ACORDES UTILIZADOS (Estilo Imagem 1) */}
          {uniqueChords.length > 0 && activeNotation !== 'ocultar' && (
            <div className="mt-14 pt-8 border-t border-dashed border-gray-300 dark:border-zinc-700 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <span>Diagramas de Acordes Utilizados:</span>
                </h3>
                <InstrumentToggle />
              </div>

              <div className="flex flex-wrap gap-4 items-start">
                {uniqueChords.map((chord) => (
                  <ChordDiagram 
                    key={chord} 
                    chord={chord} 
                    notation={activeNotation} 
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COLUNA LATERAL: VÍDEO DO YOUTUBE & INFORMAÇÕES */}
        {hasValidVideo && (
          <div className="lg:col-span-4 space-y-6 print:hidden">
            <div className="sticky top-6">
              {/* Secção Vídeo */}
              <div className="mb-6">
                <div className="mb-3 pb-2 border-b-2 border-red-500/20 inline-block">
                  <span className="text-xs font-black uppercase tracking-widest text-red-600">
                    ÁUDIO / VÍDEO
                  </span>
                </div>
                <YouTubePlayer url={song.youtube_url} />
              </div>

              {/* Informações adicionais do cântico */}
              <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm space-y-3 text-sm">
                <h4 className="font-bold text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-wider">
                  Informações
                </h4>
                <div>
                  <span className="text-gray-500 dark:text-zinc-400 block text-xs">Cântico</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{song.title}</span>
                </div>
                {song.artist && (
                  <div>
                    <span className="text-gray-500 dark:text-zinc-400 block text-xs">Autor / Origem</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{song.artist}</span>
                  </div>
                )}
                {song.tags && song.tags.length > 0 && (
                  <div>
                    <span className="text-gray-500 dark:text-zinc-400 block text-xs">Etiquetas / Temas</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {song.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 bg-green-50 dark:bg-green-950/60 text-[#2d5016] dark:text-green-300 text-xs font-semibold rounded-md border border-green-200 dark:border-green-800">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-gray-500 dark:text-zinc-400 block text-xs">Tom Original</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{song.original_key}</span>
                </div>
                {effectiveCapo && effectiveCapo > 0 ? (
                  <div>
                    <span className="text-gray-500 dark:text-zinc-400 block text-xs">Capo / Braçadeira</span>
                    <span className="font-bold text-amber-700 dark:text-amber-400">{effectiveCapo}ª Casa</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controlo flutuante de Auto-Scroll e Wake Lock */}
      <AutoScrollBar keepAwakeExternally={stageMode} />

      {/* Modal Diapasão / Afinador Escuteiro */}
      <TunerModal isOpen={isTunerOpen} onClose={() => setIsTunerOpen(false)} />
    </div>
  </ChordTooltipProvider>
  );
};
