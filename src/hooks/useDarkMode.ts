import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    // localStorage pode lançar exceção (dados do site bloqueados / modo privado)
    try {
      const saved = localStorage.getItem('scout_theme');
      if (saved) return saved === 'dark';
    } catch {
      // Ignorar e usar a preferência do sistema
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('scout_theme', isDark ? 'dark' : 'light');
    } catch {
      // Ignorar: o tema simplesmente não fica guardado
    }
  }, [isDark]);

  const toggleDark = (event?: React.MouseEvent) => {
    const isAppearanceTransition =
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isAppearanceTransition) {
      setIsDark((prev) => !prev);
      return;
    }

    const x = event?.clientX ?? window.innerWidth / 2;
    const y = event?.clientY ?? window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = (document as any).startViewTransition(() => {
      flushSync(() => {
        setIsDark((prev) => {
          const next = !prev;
          if (next) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          return next;
        });
      });
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];
      document.documentElement.animate(
        {
          clipPath,
        },
        {
          duration: 450,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
  };

  return { isDark, toggleDark };
}
