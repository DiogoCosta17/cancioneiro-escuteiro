import React, { useState, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSongs } from '../../hooks/useSongs';
import { convertImageToChordPro, ConversionResult } from '../../lib/gemini-vision';
import { importSongFromUrl } from '../../lib/url-song-importer';
import { parseChordPro, getSectionBadgeClasses } from '../../lib/chordpro-parser';
import { convertToChordPro, isChordLine } from '../../lib/chordpro-converter';
import { standardizeContentNotation } from '../../lib/chords';
import { ChordLine } from '../songs/ChordLine';
import { MAJOR_KEYS, MINOR_KEYS, SongFormData } from '../../lib/types';
import { QuickTagSelector } from '../common/QuickTagSelector';
import { getYouTubeVideoId } from '../songs/YouTubePlayer';
import { DuplicateSongWarning } from './DuplicateSongWarning';
import { findDuplicateSongs } from '../../lib/duplicate-songs';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';
import {
  Upload,
  Camera,
  Loader2,
  Sparkles,
  ArrowLeft,
  Check,
  AlertTriangle,
  Image as ImageIcon,
  X,
  Edit3,
  Eye,
  Save,
  Columns,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Globe,
  Link2,
} from 'lucide-react';

type Step = 'upload' | 'processing' | 'review' | 'error';

export function ImageConverter() {
  const navigate = useNavigate();
  const { songs, createSong } = useSongs();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [step, setStep] = useState<Step>('upload');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [songUrlInput, setSongUrlInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [processingStage, setProcessingStage] = useState('Passo 1/2: A extrair acordes, letra e tom...');

  // Conversion result (editable)
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [originalKey, setOriginalKey] = useState('C');
  const [capo, setCapo] = useState<number | undefined>(undefined);
  const [tagsStr, setTagsStr] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);

  // Uma música convertida (por foto ou link) ainda não guardada é trabalho que se perde ao sair
  const isDirty = step === 'review' && !savedSuccessfully;
  const { confirmLeave } = useUnsavedChangesWarning(
    isDirty,
    'A música convertida ainda não foi guardada. Queres mesmo sair e perder a conversão?'
  );

  // Aviso de música duplicada antes de guardar (não bloqueante)
  const deferredTitle = useDeferredValue(title);
  const deferredArtist = useDeferredValue(artist);
  const duplicateMatches = useMemo(
    () => (step === 'review' ? findDuplicateSongs({ title: deferredTitle, artist: deferredArtist }, songs) : []),
    [step, deferredTitle, deferredArtist, songs]
  );

  const youtubeVideoId = getYouTubeVideoId(youtubeUrl);
  const isYoutubeSearch = youtubeUrl.includes('/results') || youtubeUrl.includes('search_query');

  const parsedLines = parseChordPro(content);

  const looksLikeTraditionalCifra = useMemo(() => {
    if (!content.trim()) return false;
    const lines = content.split('\n');
    return lines.some((line, idx) => {
      if (!isChordLine(line)) return false;
      const nextLine = lines[idx + 1];
      return nextLine !== undefined && nextLine.trim() !== '' && !isChordLine(nextLine);
    });
  }, [content]);

  const handleConvertInPlace = () => {
    if (!content.trim()) return;
    const converted = convertToChordPro(content);
    setContent(converted);
  };

  const processImage = async (base64: string, mimeType: string) => {
    setStep('processing');
    setErrorMessage('');
    setProcessingStage('Passo 1/2: A extrair acordes, letra e tom...');

    try {
      const result: ConversionResult = await convertImageToChordPro(
        base64,
        mimeType,
        (stage) => setProcessingStage(stage)
      );
      setTitle(result.title);
      setArtist(result.artist);
      setOriginalKey(result.key);
      setCapo(result.capo ? Number(result.capo) : undefined);
      setContent(result.content);
      setStep('review');
    } catch (err: any) {
      console.error('Conversion error:', err);
      setErrorMessage(
        err.message || 'Não foi possível ler a música da imagem. Tenta tirar uma foto mais nítida, com boa iluminação e aproximada da letra.'
      );
      setStep('error');
    }
  };

  const handleImportFromUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!songUrlInput.trim()) return;

    setImagePreview(null);
    setStep('processing');
    setErrorMessage('');
    setProcessingStage('Passo 1/3: A descarregar código-fonte do site...');

    try {
      const result = await importSongFromUrl(songUrlInput.trim(), (stage) =>
        setProcessingStage(stage)
      );
      setTitle(result.title);
      setArtist(result.artist);
      setOriginalKey(result.key);
      setCapo(result.capo ? Number(result.capo) : undefined);
      if (result.youtubeUrl) {
        setYoutubeUrl(result.youtubeUrl);
      }
      setContent(result.content);
      setStep('review');
    } catch (err: any) {
      console.error('URL import error:', err);
      setErrorMessage(
        err.message || 'Não foi possível importar a música a partir deste link.'
      );
      setStep('error');
    }
  };

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Por favor, seleciona uma imagem válida (JPG, PNG, WEBP).');
      setStep('error');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('A imagem é demasiado grande. Limite: 20MB.');
      setStep('error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setImagePreview(base64);
      await processImage(base64, file.type);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      // Só aceitar imagens coladas antes da conversão (evita substituir a revisão em curso ou correr 2 conversões)
      if (step !== 'upload' && step !== 'error') return;
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFileSelect(file);
            return;
          }
        }
      }
    },
    [handleFileSelect, step]
  );

  const handleSaveSong = async () => {
    if (!title.trim() || !content.trim()) {
      setErrorMessage('Título e conteúdo são obrigatórios.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const data: SongFormData = {
        title: title.trim(),
        artist: artist.trim(),
        original_key: originalKey,
        capo: capo && capo > 0 ? capo : undefined,
        tags: tagsStr
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        content: content.trim(),
        youtube_url: youtubeUrl.trim() || undefined,
      };

      const { data: createdSong, error } = await createSong(data);
      if (error) throw error;
      setSavedSuccessfully(true);
      setSuccessMessage('Música criada com sucesso!');
      if (createdSong?.id) {
        navigate(`/song/${createdSong.id}`);
      } else {
        navigate('/admin');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao guardar a música.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setImagePreview(null);
    setSongUrlInput('');
    setTitle('');
    setArtist('');
    setOriginalKey('C');
    setCapo(undefined);
    setTagsStr('');
    setYoutubeUrl('');
    setContent('');
    setErrorMessage('');
    setSuccessMessage('');
    setViewMode('split');
    setSavedSuccessfully(false);
  };

  // Recomeçar a partir da revisão descarta a conversão: pedir confirmação primeiro
  const handleResetFromReview = () => {
    if (confirmLeave()) handleReset();
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8" onPaste={handlePaste}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <button
            onClick={() => {
              if (confirmLeave()) navigate('/admin');
            }}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300 mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Painel
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-500" />
            Conversor Inteligente (Foto ou Link)
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Envia uma foto/print ou cola o link de um site de cifras (CifraClub, Ultimate Guitar, Cifras, Cancioneiros) e a IA extrai tudo automaticamente.
          </p>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2 text-green-800 dark:text-green-300">
          <Check className="w-5 h-5" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* STEP 1: Upload or URL Import */}
      {step === 'upload' && (
        <div className="space-y-6">
          {/* Importar por Link (URL) */}
          <form
            onSubmit={handleImportFromUrl}
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl p-6 shadow-xs"
          >
            <div className="flex items-start gap-3.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center shrink-0 border border-sky-200 dark:border-sky-800/60">
                <Globe className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Importar Música por Link (URL)
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Compatível com CifraClub, Ultimate Guitar, Cifras.com.br, LaCuerda, E-Chords, cancioneiros paroquiais/escutistas e blogs. Analisa o código-fonte mantendo a posição exata dos acordes!
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="url"
                  value={songUrlInput}
                  onChange={(e) => setSongUrlInput(e.target.value)}
                  placeholder="https://www.cifraclub.com.br/... ou https://tabs.ultimate-guitar.com/..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-gray-50/60 dark:bg-zinc-800/60 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!songUrlInput.trim()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                Importar do Site
              </button>
            </div>
          </form>

          {/* Divisor */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-gray-200 dark:border-zinc-800 w-full" />
            <span className="bg-gray-50 dark:bg-zinc-950 px-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
              ou enviar foto / print
            </span>
            <div className="border-t border-gray-200 dark:border-zinc-800 w-full" />
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-2xl p-12 text-center hover:border-green-400 dark:hover:border-green-600 transition-colors bg-white dark:bg-zinc-900"
          >
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Arrasta uma imagem para aqui
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ou clica nos botões abaixo • JPG, PNG, WEBP até 20MB
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                💡 Dica: Também podes fazer <strong>Ctrl+V</strong> para colar um print do ecrã!
              </p>
            </div>

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Escolher Ficheiro
              </button>
              <button
                onClick={() => {
                  const input = fileInputRef.current;
                  if (input) {
                    input.setAttribute('capture', 'environment');
                    input.click();
                    input.removeAttribute('capture');
                  }
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg shadow border border-gray-200 dark:border-zinc-700 transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Tirar Foto
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
          </div>
        </div>
      )}

      {/* STEP 2: Processing */}
      {step === 'processing' && (
        <div className="border-2 border-green-200 dark:border-green-800 rounded-2xl p-12 text-center bg-green-50/50 dark:bg-green-900/20">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-green-600 dark:text-green-400 animate-spin" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {processingStage}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                A IA lê, audita e verifica o alinhamento dos acordes com a imagem original antes de apresentar o resultado.
              </p>
            </div>

            {imagePreview && (
              <div className="mt-4 max-w-xs">
                <img
                  src={imagePreview}
                  alt="Imagem a processar"
                  className="rounded-lg shadow-md border border-gray-200 dark:border-zinc-700 max-h-48 object-contain"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: Review & Edit */}
      {step === 'review' && (
        <div className="space-y-6">
          <DuplicateSongWarning matches={duplicateMatches} />

          {/* Image + Metadata side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Original Image */}
            {imagePreview && (
              <div className="lg:col-span-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Imagem Original
                </label>
                <div className="border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
                  <img
                    src={imagePreview}
                    alt="Imagem original"
                    className="w-full max-h-64 object-contain"
                  />
                </div>
                <button
                  onClick={handleResetFromReview}
                  className="mt-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  Usar outra imagem
                </button>
              </div>
            )}

            {/* Metadata */}
            <div className={`${imagePreview ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Dados da Música (extraídos pela IA — edita se necessário)
              </label>
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Título *
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-green-500 focus:border-green-500"
                      placeholder="Nome da música"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Artista / Autor
                    </label>
                    <input
                      type="text"
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-green-500 focus:border-green-500"
                      placeholder="Nome do artista"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Tom Original
                      </label>
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                        IA Detetou: {originalKey}
                      </span>
                    </div>
                    <select
                      value={originalKey}
                      onChange={(e) => setOriginalKey(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-green-500 focus:border-green-500"
                    >
                      <optgroup label="Tons Maiores">
                        {MAJOR_KEYS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Tons Menores">
                        {MINOR_KEYS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Capo / Braçadeira
                      </label>
                      {capo && capo > 0 ? (
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                          IA Detetou: {capo}ª Casa
                        </span>
                      ) : null}
                    </div>
                    <select
                      value={capo || 0}
                      onChange={(e) => setCapo(Number(e.target.value) || undefined)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-md text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-green-500 focus:border-green-500"
                    >
                      <option value={0}>Sem Capo</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((fret) => (
                        <option key={fret} value={fret}>
                          {fret}ª Casa (Capo {fret})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <QuickTagSelector
                    tagsStr={tagsStr}
                    onChange={setTagsStr}
                  />
                </div>

                {/* Link do YouTube com validação interativa */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Link do Vídeo no YouTube (Opcional)
                  </label>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className={`w-full rounded-lg border text-sm p-2 transition-colors ${
                      isYoutubeSearch
                        ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500'
                        : youtubeVideoId
                        ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500'
                        : 'border-gray-300 dark:border-zinc-700 focus:border-green-500 focus:ring-green-500'
                    } bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 shadow-2xs`}
                  />
                  {isYoutubeSearch ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Atenção: este link é uma página de pesquisa, não um vídeo direto. Abre o vídeo específico no YouTube e copia o URL do navegador.
                    </p>
                  ) : youtubeVideoId ? (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Vídeo detetado com sucesso! Vai ser reproduzido diretamente no cancioneiro.
                    </p>
                  ) : youtubeUrl.trim() ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Formato de link não reconhecido como vídeo do YouTube. Exemplo: <code>https://www.youtube.com/watch?v=ABC123xyz</code>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                      Permite aos escuteiros ouvirem a música diretamente no site.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Editor / Preview Area */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Letra com Acordes (formato ChordPro)
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                  • Edita e revê os acordes em tempo real
                </span>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-xs self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    viewMode === 'split'
                      ? 'bg-white dark:bg-zinc-900 text-green-700 dark:text-green-400 shadow-xs font-bold'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                  title="Ver editor e pré-visualização lado a lado"
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>Lado a Lado</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    viewMode === 'edit'
                      ? 'bg-white dark:bg-zinc-900 text-green-700 dark:text-green-400 shadow-xs font-bold'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                  title="Ver apenas o editor"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Só Editor</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    viewMode === 'preview'
                      ? 'bg-white dark:bg-zinc-900 text-green-700 dark:text-green-400 shadow-xs font-bold'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                  title="Ver apenas a pré-visualização"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Só Pré-visualização</span>
                </button>
              </div>
            </div>

            {/* Painéis */}
            <div className={`flex flex-col gap-6 ${viewMode === 'split' ? 'lg:flex-row items-stretch' : ''}`}>
              {/* Coluna do Editor */}
              {(viewMode === 'split' || viewMode === 'edit') && (
                <div className={`flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-xs ${viewMode === 'edit' ? 'w-full' : ''}`}>
                  <div className="px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/80 border-b border-gray-200 dark:border-zinc-700 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                      Editor ChordPro
                    </span>
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-gray-400 text-[11px] mr-1 hidden sm:inline">Secções:</span>
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
                        onClick={() => setContent(prev => prev + '\n\n{Estrofe 2}\n')}
                        className="px-2 py-0.5 bg-green-100 hover:bg-green-200 dark:bg-green-950/80 text-green-900 dark:text-green-200 rounded font-semibold border border-green-300 dark:border-green-700 cursor-pointer text-[11px]"
                      >
                        + {'{Estrofe 2}'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setContent(prev => prev + '\n\n{Intro}\n')}
                        className="px-2 py-0.5 bg-gray-200 hover:bg-gray-300 dark:bg-zinc-700 text-gray-800 dark:text-gray-200 rounded font-semibold border border-gray-300 dark:border-zinc-600 cursor-pointer text-[11px]"
                      >
                        + {'{Intro}'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setContent(prev => prev + '\n\n{Ponte}\n')}
                        className="px-2 py-0.5 bg-purple-100 hover:bg-purple-200 dark:bg-purple-950/80 text-purple-900 dark:text-purple-200 rounded font-semibold border border-purple-300 dark:border-purple-700 cursor-pointer text-[11px]"
                      >
                        + {'{Ponte}'}
                      </button>
                      <span className="text-gray-300 dark:text-zinc-600 mx-0.5">|</span>
                      <button
                        type="button"
                        onClick={() => setContent(prev => standardizeContentNotation(prev, 'alfabetica'))}
                        className="px-2 py-0.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/80 text-sky-900 dark:text-sky-200 rounded font-semibold border border-sky-300 dark:border-sky-700 cursor-pointer text-[11px]"
                        title="Converter todos os acordes para norma alfabética (C, Dm, G)"
                      >
                        Norma C,D,E
                      </button>
                      <button
                        type="button"
                        onClick={() => setContent(prev => standardizeContentNotation(prev, 'silabica'))}
                        className="px-2 py-0.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/80 text-sky-900 dark:text-sky-200 rounded font-semibold border border-sky-300 dark:border-sky-700 cursor-pointer text-[11px]"
                        title="Converter todos os acordes para norma silábica (Dó, Rém, Sol)"
                      >
                        Norma Dó,Ré,Mi
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 flex-1 flex flex-col">
                    {looksLikeTraditionalCifra && (
                      <div className="mb-2.5 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg flex items-center justify-between text-xs text-amber-900 dark:text-amber-300">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          Detetámos acordes em linhas separadas por cima da letra.
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
                      rows={18}
                      className="w-full flex-1 min-h-[460px] font-mono text-xs sm:text-sm p-3.5 border border-gray-200 dark:border-zinc-700 rounded-lg bg-gray-50/50 dark:bg-zinc-800/40 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-green-500 leading-relaxed outline-none"
                      placeholder="[G]Graça [D]divina..."
                    />
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-400 mt-2 px-1 gap-2">
                      <span>Acordes entre colchetes: <code>[D]</code>, <code>[Bm]</code>, <code>[Sol]</code></span>
                      <span>Refrão: <code>{'{Refrão}'}</code></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Coluna da Pré-visualização */}
              {(viewMode === 'split' || viewMode === 'preview') && (
                <div className={`flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-xs ${viewMode === 'preview' ? 'w-full' : ''}`}>
                  <div className="px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/80 border-b border-gray-200 dark:border-zinc-700 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                      Pré-visualização em Tempo Real
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Atualiza automaticamente ao escrever
                    </span>
                  </div>

                  <div className="p-4 sm:p-5 flex-1 overflow-y-auto max-h-[550px] min-h-[460px] bg-white dark:bg-zinc-900 font-sans text-base sm:text-lg leading-relaxed text-gray-800 dark:text-gray-200 space-y-1">
                    {parsedLines.length === 0 || (parsedLines.length === 1 && !content.trim()) ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-16">
                        <ArrowDown className="w-6 h-6 mb-2 opacity-50" />
                        <p className="text-sm">A pré-visualização dos acordes e letra vai aparecer aqui.</p>
                      </div>
                    ) : (
                      parsedLines.map((line, idx) => {
                        if (line.sectionHeader) {
                          return (
                            <div key={idx} className="pt-3 pb-1">
                              <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${getSectionBadgeClasses(line.sectionHeader)}`}>
                                {line.sectionHeader}
                              </span>
                            </div>
                          );
                        }
                        if (line.tokens && line.tokens.length > 0) {
                          return (
                            <div key={idx} className="mb-1">
                              <ChordLine tokens={line.tokens} />
                            </div>
                          );
                        }
                        return <div key={idx} className="h-3" />;
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-2">
            <button
              onClick={handleResetFromReview}
              className="px-4 py-2 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Começar de Novo
            </button>
            <button
              onClick={handleSaveSong}
              disabled={isSubmitting || !title.trim() || !content.trim()}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSubmitting ? 'A guardar...' : 'Guardar Música'}
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {step === 'error' && (
        <div className="border-2 border-red-200 dark:border-red-800 rounded-2xl p-12 text-center bg-red-50/50 dark:bg-red-900/20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Erro ao processar a música
              </h3>
              <p className="text-sm text-red-600 dark:text-red-400 max-w-md">{errorMessage}</p>
            </div>

            {imagePreview && (
              <div className="mt-2 max-w-xs">
                <img
                  src={imagePreview}
                  alt="Imagem com erro"
                  className="rounded-lg shadow-md border border-gray-200 dark:border-zinc-700 max-h-32 object-contain opacity-60"
                />
              </div>
            )}

            <button
              onClick={handleReset}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Tentar novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
