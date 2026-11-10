import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SongForm } from './SongForm';
import { useSongs } from '../../hooks/useSongs';
import { SongFormData } from '../../lib/types';
import { isCachedSongCopy } from '../../lib/offline-storage';

export function SongEditor() {
  const { songId } = useParams<{ songId?: string }>();
  const [searchParams] = useSearchParams();
  const { songs, getSong, createSong, updateSong } = useSongs();
  const navigate = useNavigate();
  
  const [initialData, setInitialData] = useState<SongFormData | undefined>(undefined);
  const [loading, setLoading] = useState(!!songId);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  // Ao editar, se a música não carregar, não se mostra o formulário: guardá-lo vazio apagaria os dados da música
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
  // A cópia aberta veio da cache (rede lenta/offline) e pode estar desatualizada
  const [isCachedCopy, setIsCachedCopy] = useState(false);

  useEffect(() => {
    async function loadSong() {
      if (songId) {
        setLoading(true);
        setLoadFailed(false);
        setMessage(null);
        try {
          const song = await getSong(songId);
          if (!song) {
            setLoadFailed(true);
          } else {
            // updated_at exato da cópia carregada: usado na gravação para detetar edições entretanto feitas por outros
            setLoadedUpdatedAt(song.updated_at || null);
            setIsCachedCopy(isCachedSongCopy(song));
            setInitialData({
              title: song.title,
              artist: song.artist || '',
              original_key: song.original_key,
              youtube_url: song.youtube_url || '',
              tags: song.tags,
              content: song.content,
              capo: song.capo,
            });
          }
        } catch {
          setLoadFailed(true);
        } finally {
          setLoading(false);
        }
      } else {
        const queryTitle = searchParams.get('title');
        const queryYoutube = searchParams.get('youtube_url');
        if (queryTitle || queryYoutube) {
          setInitialData({
            title: queryTitle || '',
            artist: '',
            original_key: 'C',
            youtube_url: queryYoutube || '',
            tags: [],
            content: ''
          });
        }
      }
    }
    loadSong();
  }, [songId, getSong, searchParams, retry]);

  const handleSubmit = async (data: SongFormData) => {
    setMessage(null);
    try {
      if (songId) {
        const { error } = await updateSong(songId, data, loadedUpdatedAt);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Música atualizada com sucesso!' });
        navigate(`/song/${songId}`);
      } else {
        const { data: createdSong, error } = await createSong(data);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Música criada com sucesso!' });
        if (createdSong?.id) {
          navigate(`/song/${createdSong.id}`);
        } else {
          navigate('/admin');
        }
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Ocorreu um erro ao guardar a música.' });
      throw error;
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">A carregar...</div>;
  }

  if (songId && loadFailed) {
    return (
      <div className="max-w-xl mx-auto p-4 sm:p-6 lg:p-8">
        <div role="alert" className="p-6 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200">
          <h1 className="text-lg font-bold mb-1">Não foi possível carregar esta música</h1>
          <p className="text-sm mb-4">
            Verifica a ligação à internet e tenta outra vez. O editor só abre com a música carregada, para não gravar por cima dos dados com um formulário vazio.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRetry(n => n + 1)}
              className="px-4 py-2 rounded-lg bg-[#2d5016] hover:bg-[#3d6b1f] text-white text-sm font-semibold cursor-pointer"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-zinc-900 text-sm font-semibold text-gray-700 dark:text-gray-200 cursor-pointer"
            >
              Voltar ao painel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{songId ? 'Editar Música' : 'Nova Música'}</h1>
      </div>
      
      {songId && isCachedCopy && (
        <div role="status" className="mb-6 p-4 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm">
          Esta cópia da música veio da memória do dispositivo e pode estar desatualizada. Se alguém a tiver alterado entretanto, a gravação será recusada e terás de recarregar a página.
        </div>
      )}

      {message && (
        <div className={`mb-6 p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-6 border border-gray-200 dark:border-zinc-800">
        {/* SongForm só lê initialData na montagem: remontar quando os dados (ex.: ?title= da sugestão) chegam */}
        <SongForm
          key={initialData ? 'loaded' : 'empty'}
          initialData={initialData}
          onSubmit={handleSubmit} 
          onCancel={() => navigate('/admin')} 
          isEditing={!!songId} 
          existingSongs={songs}
        />
      </div>
    </div>
  );
}
