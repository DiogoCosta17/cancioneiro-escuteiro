import { useState } from 'react';

export function useTranspose(initialSemitones: number = 0) {
  const [semitones, setSemitones] = useState<number>(() => ((Math.round(initialSemitones) % 12) + 12) % 12);

  const transposeUp = () => {
    setSemitones(prev => (prev + 1) % 12);
  };

  const transposeDown = () => {
    setSemitones(prev => (prev - 1 + 12) % 12);
  };

  const resetTranspose = () => {
    setSemitones(0);
  };

  // Define diretamente a transposição (normalizada para 0–11), ex: escolha de tom na lista
  const setTranspose = (value: number) => {
    setSemitones(((Math.round(value) % 12) + 12) % 12);
  };

  return {
    semitones,
    transposeUp,
    transposeDown,
    resetTranspose,
    setTranspose,
  };
}
