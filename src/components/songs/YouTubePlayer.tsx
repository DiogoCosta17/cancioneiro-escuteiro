import React from 'react';
import { ExternalLink, Play } from 'lucide-react';

interface YouTubePlayerProps {
  url?: string | null;
}

export function getYouTubeVideoId(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Direct 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Support /shorts/, youtu.be, /watch?v=, /embed/, /v/, etc.
  const regExp = /(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|u\/\w\/))([\w-]{11})/;
  const match = trimmed.match(regExp);
  if (match && match[1]) {
    return match[1];
  }

  // Broader fallback
  const broaderExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([\w-]{11})/;
  const broaderMatch = trimmed.match(broaderExp);
  if (broaderMatch && broaderMatch[2]) {
    return broaderMatch[2];
  }

  return null;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ url }) => {
  if (!url || typeof url !== 'string') {
    return null;
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  const videoId = getYouTubeVideoId(trimmed);

  if (!videoId) {
    const isSafeUrl = /^https?:\/\//i.test(trimmed);
    if (!isSafeUrl) {
      return null;
    }

    return (
      <a 
        href={trimmed} 
        target="_blank" 
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg text-sm font-medium transition-colors"
      >
        <Play className="w-4 h-4 text-red-600 fill-current" />
        <span>Ouvir Música (Link Externo)</span>
        <ExternalLink className="w-3.5 h-3.5 opacity-60" />
      </a>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl bg-black shadow-md border border-gray-200 dark:border-zinc-800">
      <div className="relative pb-[56.25%] h-0">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
          title="Vídeo da Música"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute top-0 left-0 w-full h-full border-0"
        />
      </div>
    </div>
  );
};
