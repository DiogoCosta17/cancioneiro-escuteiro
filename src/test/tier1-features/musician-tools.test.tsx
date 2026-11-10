import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { useStageNavigation } from '../../hooks/useStageNavigation';
import { MemoryRouter } from 'react-router-dom';
import { SongListProvider } from '../../hooks/useSongList';
import { SongView } from '../../components/songs/SongView';
import { loadSongPrefs, saveSongPrefs, clearSongPrefs, SONG_PREFS_STORAGE_KEY } from '../../lib/song-prefs';
import { getKeyOptions, semitonesForTargetKey, normalizeKey } from '../../lib/key-picker';
import { detectSwipe, getStageKeyDirection, isEditableTarget } from '../../lib/stage-gestures';
import { parseTempoDirective, computeTapTempo, pushTap, clampBpm, isTempoDirectiveLine } from '../../lib/metronome';
import { semitoneDifference } from '../../lib/chords';
import type { Song } from '../../lib/types';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, adminProfile: null, isAdmin: false, loading: false, logout: vi.fn() }),
}));

describe('Ferramentas do músico (Modo Palco)', () => {
  describe('Preferências por música (song-prefs)', () => {
    it('guarda, lê e apaga tom/capo por música', () => {
      saveSongPrefs('s1', { semitones: 3, capo: 2 });
      saveSongPrefs('s2', { semitones: 5, capo: 0 });
      expect(loadSongPrefs('s1')).toEqual({ semitones: 3, capo: 2 });
      expect(loadSongPrefs('s2')).toEqual({ semitones: 5, capo: 0 });
      clearSongPrefs('s1');
      expect(loadSongPrefs('s1')).toBeNull();
      expect(loadSongPrefs('s2')).not.toBeNull();
    });

    it('não guarda (e apaga) quando volta ao original, incluindo o capo da própria música', () => {
      saveSongPrefs('s1', { semitones: 2, capo: 3 }, 3);
      expect(loadSongPrefs('s1')).toEqual({ semitones: 2, capo: 3 });
      saveSongPrefs('s1', { semitones: 0, capo: 3 }, 3);
      expect(loadSongPrefs('s1')).toBeNull();
      expect(localStorage.getItem(SONG_PREFS_STORAGE_KEY)).toBeNull();
    });

    it('normaliza meios-tons e tolera dados corrompidos', () => {
      saveSongPrefs('s1', { semitones: -1, capo: 0 });
      expect(loadSongPrefs('s1')).toEqual({ semitones: 11, capo: 0 });
      localStorage.setItem(SONG_PREFS_STORAGE_KEY, '{lixo');
      expect(loadSongPrefs('s1')).toBeNull();
      localStorage.setItem(SONG_PREFS_STORAGE_KEY, JSON.stringify({ s1: { semitones: 'x', capo: 99 } }));
      expect(loadSongPrefs('s1')).toBeNull();
    });

    it('não rebenta se o localStorage falhar', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      expect(() => saveSongPrefs('s1', { semitones: 4, capo: 0 })).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('Seletor de tom (key-picker)', () => {
    it('lista 12 tons maiores com grafia habitual nas duas notações', () => {
      const alpha = getKeyOptions('C', 'alfabetica').map((o) => o.label);
      expect(alpha).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
      const sil = getKeyOptions('C', 'silabica').map((o) => o.label);
      expect(sil.slice(0, 3)).toEqual(['Dó', 'Réb', 'Ré']);
      expect(getKeyOptions('C', 'alfabetica')[0].isOriginal).toBe(true);
    });

    it('respeita tons menores (Am, Lá-)', () => {
      const opts = getKeyOptions('Am', 'alfabetica');
      expect(opts).toHaveLength(12);
      expect(opts.every((o) => o.key.endsWith('m'))).toBe(true);
      expect(opts[2].label).toBe('Bm');
      expect(normalizeKey('Lá-')).toBe('Am');
      expect(getKeyOptions('Lá-', 'silabica')[0].label).toBe('Lám');
    });

    it('cada opção corresponde ao seu deslocamento em meios-tons', () => {
      for (const original of ['G', 'Em', 'Bb', 'F#m']) {
        getKeyOptions(original, 'alfabetica').forEach((o) => {
          expect(semitoneDifference(original, o.key)).toBe(o.offset);
        });
      }
    });

    it('calcula a transposição para o tom pedido descontando o capo', () => {
      expect(semitonesForTargetKey('C', 'D')).toBe(2);
      expect(semitonesForTargetKey('G', 'F')).toBe(10);
      // Capo +2 face ao original: para ver desenhos em D é preciso transpor 4 meios-tons
      expect(semitonesForTargetKey('C', 'D', 2)).toBe(4);
      expect(semitonesForTargetKey('Am', 'Am', 0)).toBe(0);
    });
  });

  describe('Gestos e teclas do modo palco', () => {
    it('só aceita deslizes claramente horizontais', () => {
      expect(detectSwipe(-80, 10)).toBe('next');
      expect(detectSwipe(90, -20)).toBe('prev');
      expect(detectSwipe(-50, 0)).toBeNull(); // curto demais
      expect(detectSwipe(-80, 60)).toBeNull(); // demasiado diagonal
      expect(detectSwipe(5, 300)).toBeNull(); // scroll vertical
      expect(detectSwipe(-120, 0, 2000)).toBeNull(); // demasiado lento
    });

    it('mapeia setas e PageUp/PageDown (pedais Bluetooth)', () => {
      expect(getStageKeyDirection('ArrowRight')).toBe('next');
      expect(getStageKeyDirection('PageDown')).toBe('next');
      expect(getStageKeyDirection('ArrowLeft')).toBe('prev');
      expect(getStageKeyDirection('PageUp')).toBe('prev');
      expect(getStageKeyDirection('ArrowDown')).toBeNull();
      expect(getStageKeyDirection(' ')).toBeNull();
    });

    it('deteta campos editáveis', () => {
      const input = document.createElement('input');
      const div = document.createElement('div');
      const select = document.createElement('select');
      expect(isEditableTarget(input)).toBe(true);
      expect(isEditableTarget(select)).toBe(true);
      expect(isEditableTarget(div)).toBe(false);
      expect(isEditableTarget(null)).toBe(false);
    });
  });

  describe('useStageNavigation', () => {
    it('navega com teclas, ignora campos editáveis/modais e deslizes verticais', () => {
      const onNavigate = vi.fn();
      const { unmount } = renderHook(() =>
        useStageNavigation({ enabled: true, prevUrl: '/song/a?list=mylist', nextUrl: '/song/c?list=mylist', onNavigate })
      );

      fireEvent.keyDown(window, { key: 'PageDown' });
      expect(onNavigate).toHaveBeenLastCalledWith('/song/c?list=mylist');
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(onNavigate).toHaveBeenLastCalledWith('/song/a?list=mylist');

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      fireEvent.keyDown(input, { key: 'ArrowRight' });
      expect(onNavigate).toHaveBeenCalledTimes(2);
      input.remove();

      const modal = document.createElement('div');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(onNavigate).toHaveBeenCalledTimes(2);
      modal.remove();

      fireEvent.touchStart(document.body, { touches: [{ clientX: 300, clientY: 100 }] });
      fireEvent.touchEnd(document.body, { changedTouches: [{ clientX: 290, clientY: 400 }] });
      expect(onNavigate).toHaveBeenCalledTimes(2);

      fireEvent.touchStart(document.body, { touches: [{ clientX: 300, clientY: 100 }] });
      fireEvent.touchEnd(document.body, { changedTouches: [{ clientX: 150, clientY: 110 }] });
      expect(onNavigate).toHaveBeenLastCalledWith('/song/c?list=mylist');
      expect(onNavigate).toHaveBeenCalledTimes(3);
      unmount();
    });

    it('não faz nada quando desativado', () => {
      const onNavigate = vi.fn();
      renderHook(() => useStageNavigation({ enabled: false, prevUrl: '/a', nextUrl: '/b', onNavigate }));
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Metrónomo (lógica)', () => {
    it('lê a diretiva {tempo: N}', () => {
      expect(parseTempoDirective('{title: X}\n{tempo: 96}\n[C]Olá')).toBe(96);
      expect(parseTempoDirective('{ Tempo : 120 bpm }')).toBe(120);
      expect(parseTempoDirective('{tempo: 300}')).toBe(220);
      expect(parseTempoDirective('{tempo: abc}')).toBeNull();
      expect(parseTempoDirective('[C]Sem tempo')).toBeNull();
      expect(isTempoDirectiveLine('  {tempo: 90}  ')).toBe(true);
      expect(isTempoDirectiveLine('{Refrão}')).toBe(false);
    });

    it('calcula o tap tempo e reinicia após pausa longa', () => {
      expect(computeTapTempo([0])).toBeNull();
      expect(computeTapTempo([0, 500, 1000, 1500])).toBe(120);
      // Pausa > 2s: só contam os toques após a pausa
      expect(computeTapTempo([0, 500, 5000, 6000])).toBe(60);
      let taps: number[] = [];
      taps = pushTap(taps, 0);
      taps = pushTap(taps, 1000);
      taps = pushTap(taps, 10000);
      expect(taps).toEqual([10000]);
      expect(clampBpm(10)).toBe(40);
      expect(clampBpm(NaN)).toBe(80);
    });
  });

  describe('Wake Lock partilhado', () => {
    let requestMock: ReturnType<typeof vi.fn>;
    let resolvers: Array<(s: { released: boolean; release: () => Promise<void> }) => void>;
    let releaseMock: ReturnType<typeof vi.fn<() => Promise<void>>>;

    beforeEach(() => {
      vi.resetModules();
      resolvers = [];
      releaseMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      requestMock = vi.fn(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      );
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request: requestMock },
      });
    });

    afterEach(() => {
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    });

    it('liberta o bloqueio se o pedido terminar enquanto a permissão está pendente', async () => {
      const { requestScreenWakeLock } = await import('../../lib/wake-lock');
      const release = requestScreenWakeLock();
      expect(requestMock).toHaveBeenCalledTimes(1);
      release();
      resolvers[0]({ released: false, release: releaseMock });
      await Promise.resolve();
      await Promise.resolve();
      expect(releaseMock).toHaveBeenCalledTimes(1);
    });

    it('partilha um único bloqueio entre vários pedidos e volta a pedir ao regressar ao separador', async () => {
      const { requestScreenWakeLock } = await import('../../lib/wake-lock');
      const releaseA = requestScreenWakeLock();
      const releaseB = requestScreenWakeLock();
      expect(requestMock).toHaveBeenCalledTimes(1);
      const sentinel = { released: false, release: releaseMock };
      resolvers[0](sentinel);
      await Promise.resolve();
      await Promise.resolve();

      // O navegador liberta o bloqueio ao esconder o separador
      sentinel.released = true;
      document.dispatchEvent(new Event('visibilitychange'));
      expect(requestMock).toHaveBeenCalledTimes(2);

      releaseA();
      expect(releaseMock).not.toHaveBeenCalled();
      const second = { released: false, release: releaseMock };
      resolvers[1](second);
      await Promise.resolve();
      await Promise.resolve();
      releaseB();
      expect(releaseMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('SongView: memória de tom e seletor de tom', () => {
    const song: Song = {
      id: 'song-prefs-1',
      title: 'Alerta',
      content: '{tempo: 100}\n{Refrão}\n[C]Alerta [G]sempre',
      tags: [],
      original_key: 'C',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const renderSong = () =>
      render(
        <MemoryRouter>
          <SongListProvider>
            <SongView song={song} />
          </SongListProvider>
        </MemoryRouter>
      );

    it('restaura o tom guardado, salta para um tom e repõe o original', () => {
      saveSongPrefs(song.id, { semitones: 2, capo: 0 });
      const { unmount } = renderSong();
      const picker = screen.getByLabelText('Escolher tom') as HTMLSelectElement;
      expect(picker.value).toBe('D');
      expect(screen.getByText('Guardado')).toBeInTheDocument();
      // A diretiva {tempo} não aparece como secção
      expect(screen.queryByText('tempo: 100')).toBeNull();

      fireEvent.change(picker, { target: { value: 'F' } });
      expect(loadSongPrefs(song.id)).toEqual({ semitones: 5, capo: 0 });

      fireEvent.click(screen.getByTitle('Repor tom original'));
      expect(loadSongPrefs(song.id)).toBeNull();
      expect((screen.getByLabelText('Escolher tom') as HTMLSelectElement).value).toBe('C');
      unmount();
    });

    it('mostra o metrónomo com o BPM da diretiva {tempo}', () => {
      renderSong();
      fireEvent.click(screen.getByTitle('Abrir metrónomo'));
      expect(screen.getByLabelText('Andamento em BPM')).toHaveValue('100');
    });
  });
});
