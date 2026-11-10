import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

export function LoadingSpinner({
  message = 'A carregar...',
  fullScreen = true,
  className = '',
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center p-8 transition-opacity duration-200 ${
        fullScreen ? 'min-h-[50vh] sm:min-h-[60vh] w-full' : 'py-12'
      } ${className}`}
    >
      <div className="relative flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-gray-200 dark:border-zinc-700 border-t-[#2d5016] dark:border-t-green-500 rounded-full animate-spin" />
      </div>
      {message && (
        <p className="mt-4 text-sm font-medium text-gray-500 dark:text-zinc-400 animate-pulse">
          {message}
        </p>
      )}
      <span className="sr-only">{message}</span>
    </div>
  );
}

export default LoadingSpinner;
