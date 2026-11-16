import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  TUNER_STRINGS,
  playGuitarChord,
  playSingleString,
  detectPitchAutocorrelation,
  analyzeGuitarPitch,
} from '../../lib/audio-synth';
import { AutoScrollBar } from '../../components/songs/AutoScrollBar';
import { TunerModal } from '../../components/songs/TunerModal';

describe('Afinador e som (audio-synth)', () => {
  it('tem as 6 cordas de referência da guitarra', () => {
    expect(TUNER_STRINGS).toHaveLength(6);
    expect(TUNER_STRINGS[0].note).toBe('E2');
    expect(TUNER_STRINGS[5].note).toBe('E4');
  });

  it('não falha quando o browser não tem AudioContext', () => {
    expect(() => playGuitarChord([-1, 3, 2, 0, 1, 0], 1)).not.toThrow();
    expect(() => playSingleString(0)).not.toThrow();
  });

  it('deteta a frequência fundamental e a corda mais próxima (afinada, abaixo, acima)', () => {
    const sampleRate = 44100;
    const buffer = new Float32Array(4096);
    const targetFreq = 110.0; // 5.ª corda Lá (A2)
    for (let i = 0; i < buffer.length; i++) {
      // Fundamental + 2.º harmónico, como numa guitarra real
      buffer[i] =
        0.5 * Math.sin((2 * Math.PI * targetFreq * i) / sampleRate) +
        0.2 * Math.sin((2 * Math.PI * (targetFreq * 2) * i) / sampleRate);
    }

    const detected = detectPitchAutocorrelation(buffer, sampleRate);
    expect(detected).not.toBeNull();
    expect(Math.abs((detected ?? 0) - 110.0)).toBeLessThan(0.5);

    const analysis = analyzeGuitarPitch(detected ?? 110.0);
    expect(analysis.targetString.note).toBe('A2');
    expect(analysis.status).toBe('in-tune');
    expect(Math.abs(analysis.cents)).toBeLessThanOrEqual(5);

    expect(analyzeGuitarPitch(80.0)).toMatchObject({ targetString: { note: 'E2' }, status: 'flat' });
    expect(analyzeGuitarPitch(334.0)).toMatchObject({ targetString: { note: 'E4' }, status: 'sharp' });
  });
});

describe('TunerModal', () => {
  it('abre em modo automático e mostra as 6 cordas', () => {
    render(<TunerModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Afinador Escuteiro')).toBeInTheDocument();
    expect(screen.getByText(/Ativar Afinador por Microfone/i)).toBeInTheDocument();
    expect(screen.getByText('AUTO ON')).toBeInTheDocument();
    expect(screen.getByText('6ª Mi')).toBeInTheDocument();
    expect(screen.getByText('1ª Mi')).toBeInTheDocument();
  });
});

describe('AutoScrollBar', () => {
  it('alterna a velocidade do scroll automático', () => {
    render(<AutoScrollBar />);
    const speedBtn = screen.getByLabelText(/Velocidade do Auto-Scroll/i);
    expect(speedBtn).toHaveTextContent('2x');
    fireEvent.click(speedBtn);
    expect(speedBtn).toHaveTextContent('3x');
  });
});
