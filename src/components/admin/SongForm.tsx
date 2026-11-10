import React, { useState, useMemo, useDeferredValue } from 'react';
import { Link } from 'react-router-dom';
import { Song, SongFormData, MAJOR_KEYS, MINOR_KEYS } from '../../lib/types';
import { parseChordPro, getSectionBadgeClasses } from '../../lib/chordpro-parser';
import { convertToChordPro, isChordLine } from '../../lib/chordpro-converter';
import { standardizeContentNotation } from '../../lib/chords';
import { importSongFromUrl } from '../../lib/url-song-importer';
import { ChordLine } from '../songs/ChordLine';
import { QuickTagSelector } from '../common/QuickTagSelector';
import { getYouTubeVideoId } from '../songs/YouTubePlayer';
import { Wand2, Sparkles, ArrowDown, Camera, CheckCircle2, AlertCircle, Globe, Loader2 } from 'lucide-react';
import { TraditionalChordsModal } from './TraditionalChordsModal';
import { DuplicateSongWarning } from './DuplicateSongWarning';
import { findDuplicateSongs } from '../../lib/duplicate-songs';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';

// Representação estável do formulário para detetar alterações por guardar
const serializeSongForm = (fields: {
  title: string;
  artist: string;
  originalKey: string;
  capo?: number;
  tagsStr: string;
  youtubeUrl: string;
  content: string;
}) =>
  JSON.stringify([
    fields.title.trim(),
    fields.artist.trim(),
    fields.originalKey,
    fields.capo && fields.capo > 0 ? fields.capo : 0,
    fields.tagsStr.split(',').map(t => t.trim()).filter(Boolean),
    fields.youtubeUrl.trim(),
    fields.content,
  ]);

interface SongFormProps {
  initialData?: SongFormData;
  onSubmit: (data: SongFormData) => Promise<void>;
  onCancel: () => void;
  isEditing?: boolean;
  /** Músicas já existentes, para avisar de possíveis duplicados ao criar. */
  existingSongs?: Song[];
}

export function SongForm({ initialData, onSubmit, onCancel, isEditing = false, existingSongs = [] }: SongFormProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [artist, setArtist] = useState(initialData?.artist || '');
  const [originalKey, setOriginalKey] = useState(initialData?.original_key || 'C');
  const [capo, setCapo] = useState<number | undefined>(initialData?.capo ? Number(initialData.capo) : undefined);
  const [tagsStr, setTagsStr] = useState(initialData?.tags?.join(', ') || '');
  const [youtubeUrl, setYoutubeUrl] = useState(initialData?.youtube_url || '');
  const [content, setContent] = useState(initialData?.content || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Importação direta por Link (URL)
  const [importUrl, setImportUrl] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [importStage, setImportStage] = useState('');

  // Estado do modal de conversão de cifras tradicionais
  const [showConverter, setShowConverter] = useState(false);

  // Aviso de alterações não guardadas: compara com o estado inicial (fixado na montagem)
  const [initialSnapshot] = useState(() =>
    serializeSongForm({
      title: initialData?.title || '',
      artist: initialData?.artist || '',
      originalKey: initialData?.original_key || 'C',
      capo: initialData?.capo ? Number(initialData.capo) : undefined,
      tagsStr: initialData?.tags?.join(', ') || '',
      youtubeUrl: initialData?.youtube_url || '',
      content: initialData?.content || '',
    })
  );
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  const isDirty =
    !savedSuccessfully &&
    serializeSongForm({ title, artist, originalKey, capo, tagsStr, youtubeUrl, content }) !== initialSnapshot;
  const { confirmLeave } = useUnsavedChangesWarning(isDirty);

  const handleCancel = () => {
    if (confirmLeave()) onCancel();
  };

  // Aviso de música duplicada (apenas ao criar; não bloqueia a gravação)
  const deferredTitle = useDeferredValue(title);
  const deferredArtist = useDeferredValue(artist);
  const duplicateMatches = useMemo(
    () => (isEditing ? [] : findDuplicateSongs({ title: deferredTitle, artist: deferredArtist }, existingSongs)),
    [isEditing, deferredTitle, deferredArtist, existingSongs]
  );

  const handleImportUrlInForm = async () => {
    if (!importUrl.trim() || isImportingUrl) return;
    setIsImportingUrl(true);
    setError('');
    setImportStage('A importar do site...');
    try {
      const result = await importSongFromUrl(importUrl.trim(), (stage) =>
        setImportStage(stage)
      );
      if (result.title) setTitle(result.title);
      if (result.artist) setArtist(result.artist);
      if (result.key) setOriginalKey(result.key);
      if (result.capo) setCapo(Number(result.capo));
      if (result.youtubeUrl && !youtubeUrl.trim()) setYoutubeUrl(result.youtubeUrl);
      if (result.content) setContent(result.content);
      setImportUrl('');
    } catch (err: any) {
      setError(err.message || 'Erro ao importar música a partir do link.');
    } finally {
      setIsImportingUrl(false);
      setImportStage('');
    }
  };

  const parsedLines = parseChordPro(content);

  // Deteta se o texto no textarea principal tem acordes em linhas separadas por cima da letra (com ou sem colchetes)
  const looksLikeTraditionalCifra = useMemo(() => {
    if (!content.trim()) return false;
    const lines = content.split('\n');
    return lines.some((line, idx) => {
      if (!isChordLine(line)) return false;
      const nextLine = lines[idx + 1];
      return nextLine !== undefined && nextLine.trim() !== '' && !isChordLine(nextLine);
    });
  }, [content]);

  // Validação em tempo real do link do YouTube
  const youtubeVideoId = getYouTubeVideoId(youtubeUrl);
  const isYoutubeSearch = youtubeUrl.includes('/results') || youtubeUrl.includes('search_query');

  const handleConvertInPlace = () => {
    if (!content.trim()) return;
    const converted = convertToChordPro(content);
    setContent(converted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Título e conteúdo são obrigatórios.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit({
        title,
        artist,
        original_key: originalKey,
        capo: capo && capo > 0 ? capo : undefined,
        tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
        youtube_url: youtubeUrl.trim() || undefined,
        content,
      });
      setSavedSuccessfully(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar a música.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="bg-red-50 text-red-600 p-3 rounded-md">{error}</div>}
      
      {/* Opção Rápida de Converter por Foto / Imagem ou Link */}
      {!isEditing && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 flex items-center justify-center shrink-0">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-gray-100">Tens uma foto ou print da música?</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">A IA lê os acordes da imagem automaticamente.</p>
              </div>
            </div>
            <Link
              to="/admin/converter"
              onClick={(e) => {
                if (!confirmLeave()) e.preventDefault();
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors shrink-0 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 mr-1.5" />
              Converter Foto
            </Link>
          </div>

          <div className="p-3.5 bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl flex flex-col gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                Importar por Link (CifraClub, Ultimate Guitar, Cifras, Cancioneiros...)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleImportUrlInForm();
                  }
                }}
                placeholder="Cola aqui o link da música..."
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-sky-300 dark:border-sky-800 bg-white dark:bg-zinc-900 text-xs text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-sky-500 outline-none"
              />
              <button
                type="button"
                onClick={handleImportUrlInForm}
                disabled={!importUrl.trim() || isImportingUrl}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
              >
                {isImportingUrl ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{importStage || 'A importar...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Importar Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Título *</label>
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            required 
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-zinc-700 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-2 border"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Artista / Autor (Opcional)</label>
          <input 
            type="text" 
            value={artist} 
            onChange={(e) => setArtist(e.target.value)} 
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-zinc-700 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-2 border"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tom Original</label>
          <select 
            value={originalKey} 
            onChange={(e) => setOriginalKey(e.target.value)} 
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-zinc-700 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-2 border bg-white dark:bg-zinc-900"
          >
            <optgroup label="Tons Maiores">
              {MAJOR_KEYS.map(k => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </optgroup>
            <optgroup label="Tons Menores">
              {MINOR_KEYS.map(k => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Capo / Braçadeira</label>
          <select 
            value={capo || 0} 
            onChange={(e) => setCapo(Number(e.target.value) || undefined)} 
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-zinc-700 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-2 border bg-white dark:bg-zinc-900"
          >
            <option value={0}>Sem Capo</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((fret) => (
              <option key={fret} value={fret}>
                {fret}ª Casa (Capo {fret})
              </option>
            ))}
          </select>
        </div>

        {/* Seletor Rápido de Etiquetas */}
        <div className="sm:col-span-2 lg:col-span-4">
          <QuickTagSelector 
            tagsStr={tagsStr} 
            onChange={setTagsStr} 
            label="Etiquetas (separadas por vírgula)"
            placeholder="ex: Entrada, Escutistas, Marianas, 2ª Secção..."
          />
        </div>

        {/* Link do YouTube com validação interativa */}
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Link do Vídeo no YouTube (Opcional)</label>
          <input 
            type="url" 
            value={youtubeUrl} 
            onChange={(e) => setYoutubeUrl(e.target.value)} 
            placeholder="https://www.youtube.com/watch?v=..." 
            className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm p-2 border transition-colors ${
              isYoutubeSearch
                ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500'
                : youtubeVideoId
                ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500'
                : 'border-gray-300 dark:border-zinc-700 focus:border-green-500 focus:ring-green-500'
            }`}
          />
          
          {isYoutubeSearch ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Atenção: este link é uma página de pesquisa do YouTube, não um vídeo direto. Abre o vídeo específico no YouTube e copia o URL do navegador.
            </p>
          ) : youtubeVideoId ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Vídeo detetado com sucesso! Vai ser reproduzido diretamente no cancioneiro.
            </p>
          ) : youtubeUrl.trim() ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Formato de link não reconhecido como vídeo do YouTube. Exemplo correto: <code>https://www.youtube.com/watch?v=ABC123xyz</code>
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">Permite aos escuteiros ouvirem a música diretamente no site.</p>
          )}
        </div>
      </div>

      {!isEditing && <DuplicateSongWarning matches={duplicateMatches} />}

      {/* LETRA E PRÉ-VISUALIZAÇÃO */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Conteúdo ChordPro *
            </label>
            <button
              type="button"
              onClick={() => setShowConverter(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-800/80 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Importar pauta com acordes por cima da letra"
            >
              <Wand2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>✨ Converter Acordes / Pauta</span>
            </button>
          </div>

          {/* Deteção inteligente no próprio textarea */}
          {looksLikeTraditionalCifra && (
            <div className="mb-2 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg flex items-center justify-between text-xs text-amber-900 dark:text-amber-300">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                Parece que colaste acordes por cima da letra.
              </span>
              <button
                type="button"
                onClick={handleConvertInPlace}
                className="font-bold text-amber-900 dark:text-amber-200 underline hover:text-amber-700 dark:hover:text-amber-100 cursor-pointer ml-2"
              >
                Converter agora para ChordPro!
              </button>
            </div>
          )}

          <textarea 
            value={content} 
            onChange={(e) => setContent(e.target.value)} 
            required 
            rows={20} 
            className="w-full font-mono rounded-md border-gray-300 dark:border-zinc-700 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-3 border flex-1 leading-relaxed" 
            placeholder="[G]Sou o Sol do [D]futuro..."
          />

          <div className="mt-2 text-xs text-gray-500 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Inserir Secção:</span>
            <button
              type="button"
              onClick={() => setContent(prev => prev + '\n\n{Refrão}\n')}
              className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 rounded font-semibold border border-amber-300 dark:border-amber-700 cursor-pointer text-[11px]"
            >
              + {'{Refrão}'}
            </button>
            <button
              type="button"
              onClick={() => setContent(prev => prev + '\n\n{Estrofe 1}\n')}
              className="px-2 py-0.5 bg-green-100 hover:bg-green-200 dark:bg-green-950/80 text-green-900 dark:text-green-200 rounded font-semibold border border-green-300 dark:border-green-700 cursor-pointer text-[11px]"
            >
              + {'{Estrofe 1}'}
            </button>
            <button
              type="button"
              onClick={() => setContent(prev => prev + '\n\n{Intro}\n')}
              className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 rounded font-semibold border border-gray-300 dark:border-zinc-700 cursor-pointer text-[11px]"
            >
              + {'{Intro}'}
            </button>
            <button
              type="button"
              onClick={() => setContent(prev => standardizeContentNotation(prev, 'alfabetica'))}
              className="px-2 py-0.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/80 text-sky-900 dark:text-sky-200 rounded font-semibold border border-sky-300 dark:border-sky-700 cursor-pointer text-[11px]"
              title="Padronizar todos os acordes para notação alfabética (C, Dm, G)"
            >
              Norma C,D,E
            </button>
            <button
              type="button"
              onClick={() => setContent(prev => standardizeContentNotation(prev, 'silabica'))}
              className="px-2 py-0.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/80 text-sky-900 dark:text-sky-200 rounded font-semibold border border-sky-300 dark:border-sky-700 cursor-pointer text-[11px]"
              title="Padronizar todos os acordes para notação silábica (Dó, Rém, Sol)"
            >
              Norma Dó,Ré,Mi
            </button>
            <span className="text-[11px] text-gray-400 ml-auto">
              Acordes em colchetes: <code>[Am]</code>, <code>[G]</code>
            </span>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pré-visualização em Tempo Real</label>
          <div className="w-full flex-1 border border-gray-300 dark:border-zinc-700 rounded-md p-4 bg-white dark:bg-zinc-900 overflow-y-auto max-h-[520px]">
            {parsedLines.length === 0 || (parsedLines.length === 1 && !content.trim()) ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 py-16">
                <ArrowDown className="w-6 h-6 mb-2 opacity-50" />
                <p className="text-sm">A pré-visualização dos acordes e letra vai aparecer aqui.</p>
              </div>
            ) : (
              parsedLines.map((line, idx) => {
                return (
                  <div key={idx} className="mb-1">
                    {line.sectionHeader ? (
                      <div className="mt-4 mb-2">
                        <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${getSectionBadgeClasses(line.sectionHeader)}`}>
                          {line.sectionHeader}
                        </span>
                      </div>
                    ) : line.isBlank ? (
                      <div className="h-3" />
                    ) : (
                      <ChordLine tokens={line.tokens || []} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-zinc-800">
        <button type="button" onClick={handleCancel} className="px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:bg-zinc-900/50 cursor-pointer">
          Cancelar
        </button>
        <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 cursor-pointer">
          {isSubmitting ? 'A guardar...' : isEditing ? 'Guardar Alterações' : 'Criar Música'}
        </button>
      </div>

      {/* Modal Profissional de Conversão de Cifras Tradicionais */}
      <TraditionalChordsModal
        isOpen={showConverter}
        onClose={() => setShowConverter(false)}
        onConvert={(newContent: string) => setContent(newContent)}
      />
    </form>
  );
}
