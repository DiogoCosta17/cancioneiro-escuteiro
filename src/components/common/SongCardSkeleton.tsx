import React from 'react';

interface SongCardSkeletonProps {
  count?: number;
  label?: string;
}

export const SongCardSkeleton: React.FC<SongCardSkeletonProps> = ({
  count = 6,
  label = 'A carregar músicas...',
}) => {
  return (
    <div role="status" aria-live="polite" aria-label={label}>
      <p className="sr-only">{label}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-5 animate-pulse"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="h-5 bg-gray-200 dark:bg-zinc-800 rounded-md w-3/4" />
                <div className="h-3.5 bg-gray-100 dark:bg-zinc-800/70 rounded-md w-1/2" />
              </div>
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 shrink-0" />
            </div>

            <div className="mt-5 flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded bg-gray-200 dark:bg-zinc-800 shrink-0" />
              <div className="h-3.5 bg-gray-100 dark:bg-zinc-800/80 rounded-md w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
