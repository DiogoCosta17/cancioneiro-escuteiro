import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { DuplicateMatch } from '../../lib/duplicate-songs';
import { Song } from '../../lib/types';

interface DuplicateSongWarningProps {
  matches: DuplicateMatch<Song>[];
  className?: string;
}

/**
 * Aviso não bloqueante de que a música que está a ser criada pode já existir no cancioneiro.
 * Os links abrem num novo separador para não perder o formulário em curso.
 */
export function DuplicateSongWarning({ matches, className = '' }: DuplicateSongWarningProps) {
  if (matches.length === 0) return null;
  const hasExact = matches.some(m => m.kind === 'exact');

  return (
    <div
      role="status"
      className={`p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 ${className}`}
    >
      <p className="flex items-center gap-1.5 font-bold">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        {hasExact
          ? 'Esta música parece já existir no cancioneiro.'
          : 'Existem músicas com um título parecido no cancioneiro.'}
      </p>
      <ul className="mt-2 space-y-1.5">
        {matches.map(({ song, kind, reason }) => (
          <li key={song.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{song.title}</span>
            {song.artist && <span className="text-gray-500 dark:text-gray-400">• {song.artist}</span>}
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                kind === 'exact'
                  ? 'bg-amber-200/70 dark:bg-amber-900/60 border-amber-300 dark:border-amber-700'
                  : 'bg-white/70 dark:bg-zinc-900/60 border-amber-200 dark:border-amber-800'
              }`}
            >
              {reason}
            </span>
            <Link
              to={`/song/${song.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold underline hover:text-amber-700 dark:hover:text-amber-100"
            >
              Abrir música existente
              <ExternalLink className="w-3 h-3" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-amber-800/80 dark:text-amber-300/80">
        Se for mesmo uma música diferente, podes continuar e guardar normalmente.
      </p>
    </div>
  );
}
