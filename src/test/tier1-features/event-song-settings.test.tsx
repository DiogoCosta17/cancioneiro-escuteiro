import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Event, EventSong, Song } from '../../lib/types';
import {
  describeEventSongKey,
  readEventKeySettings,
  settingsFromShape,
  summarizeEventSong,
  toEventKeyColumns,
  isMissingSettingsColumnError,
} from '../../lib/event-song-settings';
import { validateBackup, toEventSongRow, buildRestorePlan } from '../../lib/backup-restore';
import { loadSongPrefs } from '../../lib/song-prefs';

// ---------- mocks partilhados ----------
const state: { event: Event; eventSongs: EventSong[]; isAdmin: boolean } = {
  event: null as unknown as Event,
  eventSongs: [],
  isAdmin: false,
};
const db = { hasColumns: true, inserted: [] as Record<string, unknown>[][] };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        const fails = table === 'event_songs' && !db.hasColumns && 'notes' in rows[0];
        if (!fails && table === 'event_songs') db.inserted.push(rows);
        const result = fails
          ? { data: null, error: { message: "Could not find the 'notes' column of 'event_songs' in the schema cache" } }
          : { data: table === 'events' ? { id: 'novo-evento' } : rows.map((_, i) => ({ id: `es${i}` })), error: null };
        // oxlint-disable-next-line unicorn/no-thenable -- o mock imita o query builder do Supabase, que é thenable
        return { select: () => ({ single: () => Promise.resolve(result), then: (r: (v: unknown) => void) => r(result) }) };
      },
    }),
  },
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, adminProfile: null, isAdmin: state.isAdmin, loading: false, logout: vi.fn() }),
}));
vi.mock('../../hooks/useEvents', () => ({
  useEvent: () => ({ event: state.event, eventSongs: state.eventSongs, loading: false, error: null }),
  useOfflineEventSave: () => ({ status: 'idle', record: null, progress: null, error: null, warning: null, save: vi.fn() }),
}));
vi.mock('../../hooks/useSongs', () => ({ useSongs: () => ({ songs: [] }) }));
vi.mock('../../hooks/useActivityLogs', () => ({ useActivityLogs: () => ({ logAction: vi.fn() }) }));

import { EventView } from '../../pages/EventView';
import EventPrint from '../../pages/EventPrint';
import { EventEditor } from '../../components/admin/EventEditor';
import { SongView } from '../../components/songs/SongView';
import { SongListProvider } from '../../hooks/useSongList';

const SONG: Song = {
  id: 's1',
  title: 'Povo de Deus',
  content: '[G]Povo de [D]Deus',
  tags: [],
  original_key: 'G',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const NOTE = 'As mulheres fazem a 2.ª voz no refrão.';

function setEvent(es: Partial<EventSong>) {
  state.event = { id: 'e1', title: 'Missa XXXII', date: '2026-11-08', location: null, created_at: '2026-01-01' };
  state.eventSongs = [{ id: 'es0', event_id: 'e1', song_id: SONG.id, moment_name: 'Entrada', order_index: 0, song: SONG, ...es }];
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/evento/:id" element={<EventView />} />
        <Route path="/evento/:id/print" element={<EventPrint />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  state.isAdmin = false;
  db.hasColumns = true;
  db.inserted = [];
  window.print = vi.fn();
  localStorage.clear();
});

describe('Tom e capo por evento — regras', () => {
  it('sem valores, ou com valores iguais ao original, não há escolha própria', () => {
    expect(readEventKeySettings({}, SONG)).toBeNull();
    expect(readEventKeySettings({ transpose_semitones: 0, capo: 0 }, SONG)).toBeNull();
    expect(readEventKeySettings({ transpose_semitones: 0, capo: 3 }, { capo: 3 })).toBeNull();
    expect(readEventKeySettings({ transpose_semitones: 2, capo: null }, SONG)).toEqual({ semitones: 2, capo: 0 });
    // Valores fora do intervalo são ignorados
    expect(readEventKeySettings({ transpose_semitones: 40, capo: -1 }, SONG)).toBeNull();
  });

  it('acordes de Sol com capo 2: soa em Lá e mostra Sol · capo 2', () => {
    const settings = settingsFromShape(0, 2, SONG);
    expect(settings).toEqual({ semitones: 2, capo: 2 });
    const cols = toEventKeyColumns(settings, SONG);
    expect(cols).toEqual({ transpose_semitones: 2, capo: 2 });
    const d = describeEventSongKey(cols, SONG);
    expect(d).toMatchObject({ keyLabel: 'G', capo: 2, custom: true, effectiveSemitones: 0 });
    expect(summarizeEventSong({ ...cols, notes: NOTE }, SONG)).toBe(`Sol · capo 2 — nota: ${NOTE}`);
  });

  it('voltar ao original grava null nas duas colunas', () => {
    expect(toEventKeyColumns({ semitones: 0, capo: 0 }, SONG)).toEqual({ transpose_semitones: null, capo: null });
    expect(toEventKeyColumns(null, SONG)).toEqual({ transpose_semitones: null, capo: null });
  });

  it('reconhece o erro de coluna em falta (migração 021 por aplicar)', () => {
    expect(isMissingSettingsColumnError({ message: "Could not find the 'capo' column of 'event_songs'" })).toBe(true);
    expect(isMissingSettingsColumnError({ message: 'permission denied' })).toBe(false);
  });
});

describe('Tom, capo e notas — página do evento e impressão', () => {
  it('página do evento: o tom e a nota só aparecem dentro da música, não na lista', () => {
    setEvent({ transpose_semitones: 2, capo: 0, notes: NOTE });
    renderAt('/evento/e1');
    expect(screen.getByText(SONG.title)).toBeInTheDocument();
    expect(screen.queryByText(/^Tom:/)).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('impressão: acordes transpostos para o tom do evento e nota impressa', () => {
    setEvent({ transpose_semitones: 2, capo: 0, notes: NOTE });
    renderAt('/evento/e1/print');
    expect(screen.getByText('Tom: Lá')).toBeInTheDocument();
    expect(screen.getAllByText('Lá').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sol')).toBeNull();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('impressão: capo do evento substitui o da música', () => {
    setEvent({ transpose_semitones: 2, capo: 2 });
    renderAt('/evento/e1/print');
    expect(screen.getByText('Tom: Sol')).toBeInTheDocument();
    expect(screen.getByText('Capo: 2ª Casa')).toBeInTheDocument();
  });
});

describe('Tom, capo e notas — página da música aberta a partir do evento', () => {
  const renderSong = (context: Parameters<typeof SongView>[0]['eventContext']) =>
    render(
      <MemoryRouter>
        <SongListProvider>
          <SongView song={SONG} eventContext={context} />
        </SongListProvider>
      </MemoryRouter>
    );

  it('abre no tom do evento, mostra a nota e não grava o tom no dispositivo', () => {
    renderSong({ eventTitle: 'Missa XXXII', keySettings: { semitones: 2, capo: 0 }, notes: NOTE });
    expect((screen.getByLabelText('Escolher tom') as HTMLSelectElement).value).toBe('A');
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(loadSongPrefs(SONG.id)).toBeNull();
    // Visitantes não podem gravar
    expect(screen.queryByRole('button', { name: /neste evento/ })).toBeNull();
  });

  it('mostra o versículo do Aleluia antes da letra', () => {
    renderSong({ eventTitle: 'Missa XXXII', keySettings: null, notes: null, gospelAcclamation: 'Vigiai e estai preparados.' });
    const verse = screen.getByText('Vigiai e estai preparados.');
    const lyricsTitle = screen.getByText('LETRA & ACORDES');
    expect(verse.compareDocumentPosition(lyricsTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('dirigente: muda o tom e grava-o no evento', async () => {
    const onSaveKey = vi.fn().mockResolvedValue(null);
    renderSong({ eventTitle: 'Missa XXXII', keySettings: null, notes: null, onSaveKey });
    fireEvent.change(screen.getByLabelText('Escolher tom'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Lá · sem capo neste evento/ }));
    await waitFor(() => expect(onSaveKey).toHaveBeenCalledWith({ semitones: 2, capo: 0 }));
  });

  it('dirigente: no tom do evento, não há botão para o tirar (faz-se no editor)', () => {
    renderSong({ eventTitle: 'Missa XXXII', keySettings: { semitones: 2, capo: 0 }, notes: null, onSaveKey: vi.fn() });
    expect(screen.queryByRole('button', { name: /Tirar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /neste evento/ })).toBeNull();
  });
});

describe('Tom, capo e notas — editor de eventos', () => {
  function renderEditor() {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/admin/events/new',
          state: { massPlan: { title: 'Missa XXXII', date: '2026-11-08', songs: [{ song_id: SONG.id, moment_name: 'Entrada', song: SONG }] } },
        }]}
      >
        <Routes>
          <Route path="/admin/events/new" element={<EventEditor />} />
          <Route path="/admin" element={<p>Painel</p>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('escolhe tom, capo e nota e grava-os com o cântico', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Tom, capo e notas' }));
    fireEvent.change(screen.getByLabelText('Capo'), { target: { value: '2' } });
    // Capo 2 mantém o tom cantado (Sol) → acordes de Fá
    expect((screen.getByLabelText('Tom (acordes)') as HTMLSelectElement).value).toBe('10');
    fireEvent.change(screen.getByLabelText('Tom (acordes)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^Notas/), { target: { value: NOTE } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Evento/ }));
    await waitFor(() => expect(screen.getByText('Painel')).toBeInTheDocument());
    expect(db.inserted[0][0]).toMatchObject({ song_id: SONG.id, transpose_semitones: 2, capo: 2, notes: NOTE });
  });

  it('sem escolhas, não envia as colunas novas (funciona antes da migração 021)', async () => {
    db.hasColumns = false;
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Guardar Evento/ }));
    await waitFor(() => expect(screen.getByText('Painel')).toBeInTheDocument());
    expect(db.inserted[0][0]).not.toHaveProperty('notes');
  });

  it('sem a migração 021: grava o alinhamento na mesma e avisa', async () => {
    db.hasColumns = false;
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Tom, capo e notas' }));
    fireEvent.change(screen.getByLabelText(/^Notas/), { target: { value: NOTE } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Evento/ }));
    await waitFor(() => expect(screen.getByText('Painel')).toBeInTheDocument());
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0][0]).not.toHaveProperty('notes');
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('migração 021'));
    alert.mockRestore();
  });
});

describe('Tom, capo e notas — cópia de segurança', () => {
  const EV = '11111111-1111-4111-8111-111111111111';
  const ES = '22222222-2222-4222-8222-222222222222';
  const SG = '33333333-3333-4333-8333-333333333333';
  const backupWith = (extra: Record<string, unknown>) => ({
    version: '1.0',
    exported_at: '2026-11-04T10:00:00.000Z',
    songs: [],
    events: [{
      id: EV, title: 'Missa', date: '2026-11-08',
      event_songs: [{ id: ES, event_id: EV, song_id: SG, moment_name: 'Entrada', order_index: 0, ...extra }],
    }],
  });

  it('aceita os campos novos, valida-os e só os envia quando existem', () => {
    const ok = validateBackup(backupWith({ transpose_semitones: 2, capo: 2, notes: NOTE }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(toEventSongRow(ok.backup.events[0].event_songs[0])).toMatchObject({ transpose_semitones: 2, capo: 2, notes: NOTE });

    expect(validateBackup(backupWith({ capo: 12 })).ok).toBe(false);
    expect(validateBackup(backupWith({ notes: 'x'.repeat(501) })).ok).toBe(false);

    const old = validateBackup(backupWith({}));
    expect(old.ok).toBe(true);
    if (old.ok) {
      const row = toEventSongRow(old.backup.events[0].event_songs[0]);
      expect('transpose_semitones' in row || 'capo' in row || 'notes' in row).toBe(false);
    }
  });

  it('o plano de restauro deteta uma nota diferente', () => {
    const parsed = validateBackup(backupWith({ notes: NOTE }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = buildRestorePlan(parsed.backup, {
      songs: [{ id: SG, title: 'X', content: '', tags: [], original_key: 'G' } as never],
      events: [{ id: EV, title: 'Missa', date: '2026-11-08' } as never],
      eventSongs: [{ id: ES, event_id: EV, song_id: SG, moment_name: 'Entrada', order_index: 0, notes: null }],
    });
    expect(plan.events[0].eventSongsUpdate).toBe(1);
  });
});
