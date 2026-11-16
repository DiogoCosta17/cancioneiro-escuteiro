import { describe, it, expect } from 'vitest';
import {
  BACKUP_MAX_BYTES,
  applyRestorePlan,
  buildRestorePlan,
  parseBackupText,
  validateBackup,
  type Backup,
  type CurrentState,
  type RestoreAdapter,
  type RestoreTable,
} from '../../lib/backup-restore';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const S3 = '33333333-3333-4333-8333-333333333333';
const E1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const E2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ES1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ES2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ES3 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MISSING = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const song = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `Música ${id.slice(0, 1)}`,
  artist: null,
  content: '[G]Letra',
  tags: ['Entrada'],
  original_key: 'G',
  capo: null,
  youtube_url: null,
  created_by: null,
  created_at: '2026-01-01T10:00:00+00:00',
  updated_at: '2026-01-01T10:00:00+00:00',
  ...overrides,
});

const eventSong = (id: string, eventId: string, songId: string, order: number, moment: string | null = 'Entrada') => ({
  id,
  event_id: eventId,
  song_id: songId,
  moment_name: moment,
  order_index: order,
  created_at: '2026-01-01T10:00:00+00:00',
});

const rawBackup = (overrides: Record<string, unknown> = {}) => ({
  version: '1.0',
  exported_at: '2026-10-01T12:00:00.000Z',
  exported_by: 'Diogo',
  total_songs: 2,
  total_events: 1,
  songs: [song(S1), song(S2)],
  events: [
    {
      id: E1,
      title: 'Missa de Promessas',
      date: '2026-10-25',
      location: 'Igreja Matriz',
      reader_1: null,
      psalmist: null,
      reader_2: null,
      prayers: null,
      created_at: '2026-01-01T10:00:00+00:00',
      event_songs: [eventSong(ES1, E1, S1, 0), eventSong(ES2, E1, S2, 1, 'Comunhão')],
    },
  ],
  ...overrides,
});

const parsed = (raw: unknown = rawBackup()): Backup => {
  const result = validateBackup(raw);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.backup;
};

describe('validateBackup / parseBackupText', () => {
  it('aceita uma cópia exportada pelo painel', () => {
    const result = parseBackupText(JSON.stringify(rawBackup()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.songs).toHaveLength(2);
      expect(result.backup.events[0].event_songs).toHaveLength(2);
    }
  });

  it('rejeita JSON inválido, vazio ou demasiado grande', () => {
    expect(parseBackupText('{nope').ok).toBe(false);
    expect(parseBackupText('   ').ok).toBe(false);
    const big = parseBackupText('{}', BACKUP_MAX_BYTES + 1);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.errors[0]).toMatch(/10 MB/);
  });

  it('rejeita versão diferente e estrutura errada', () => {
    expect(validateBackup(rawBackup({ version: '2.0' })).ok).toBe(false);
    expect(validateBackup(rawBackup({ songs: {} })).ok).toBe(false);
    expect(validateBackup([]).ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
  });

  it('rejeita campos desconhecidos (topo, música e evento)', () => {
    expect(validateBackup(rawBackup({ hacked: true })).ok).toBe(false);
    expect(validateBackup(rawBackup({ songs: [song(S1, { role: 'super_admin' }), song(S2)] })).ok).toBe(false);
  });

  it('aceita a coluna antiga "category" das cópias de produção sem a escrever', () => {
    const result = validateBackup(rawBackup({ songs: [song(S1, { category: 'outra' }), song(S2)] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.songs[0]).not.toHaveProperty('category');
    }
  });

  it('rejeita campos obrigatórios em falta ou com tipos errados', () => {
    const cases = [
      song(S1, { id: 'not-a-uuid' }),
      song(S1, { title: '' }),
      song(S1, { content: 42 }),
      song(S1, { tags: 'Entrada' }),
      song(S1, { capo: 3.5 }),
      song(S1, { original_key: null }),
      song(S1, { created_at: 'ontem' }),
    ];
    for (const bad of cases) {
      const result = validateBackup(rawBackup({ songs: [bad, song(S2)] }));
      expect(result.ok).toBe(false);
    }
  });

  it('valida datas dos eventos e coerência dos cânticos', () => {
    const base = rawBackup();
    const ev = (base.events as any[])[0];
    expect(validateBackup({ ...base, events: [{ ...ev, date: '2026-02-30' }] }).ok).toBe(false);
    expect(validateBackup({ ...base, events: [{ ...ev, date: '25/10/2026' }] }).ok).toBe(false);
    expect(validateBackup({ ...base, events: [{ ...ev, event_songs: [eventSong(ES1, E2, S1, 0)] }] }).ok).toBe(false);
    expect(validateBackup({ ...base, events: [{ ...ev, event_songs: [{ ...eventSong(ES1, E1, S1, 0), order_index: -1 }] }] }).ok).toBe(false);
    const { event_songs: _omit, ...withoutSongs } = ev;
    expect(validateBackup({ ...base, events: [withoutSongs] }).ok).toBe(false);
  });

  it('rejeita ids repetidos e totais que não batem certo', () => {
    expect(validateBackup(rawBackup({ songs: [song(S1), song(S1)] })).ok).toBe(false);
    expect(validateBackup(rawBackup({ total_songs: 5 })).ok).toBe(false);
  });

  it('limita o número de erros reportados', () => {
    const songs = Array.from({ length: 60 }, () => ({ id: 'x' }));
    const result = validateBackup(rawBackup({ songs, total_songs: 60 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeLessThanOrEqual(26);
      expect(result.errors[result.errors.length - 1]).toMatch(/e mais/);
    }
  });
});

describe('buildRestorePlan', () => {
  const current = (): CurrentState => ({
    songs: [
      { id: S1, title: 'Música 1', artist: '', content: '[G]Letra', tags: ['Entrada'], original_key: 'G', capo: 0, youtube_url: null },
      { id: S3, title: 'Só na BD', artist: null, content: 'x', tags: [], original_key: 'C', capo: null, youtube_url: null },
    ],
    events: [{ id: E1, title: 'Missa de Promessas', date: '2026-10-25', location: 'Igreja Matriz' }],
    eventSongs: [
      { id: ES1, event_id: E1, song_id: S1, moment_name: 'Entrada', order_index: 0 },
      { id: ES3, event_id: E1, song_id: S3, moment_name: null, order_index: 2 },
    ],
  });

  it('classifica criar / atualizar / sem alterações', () => {
    const backup = parsed(rawBackup({ songs: [song(S1), song(S2)] }));
    const plan = buildRestorePlan(backup, current());

    expect(plan.songs.find(s => s.id === S1)?.status).toBe('unchanged'); // '' ≡ null, capo 0 ≡ null
    expect(plan.songs.find(s => s.id === S2)?.status).toBe('create');
    expect(plan.summary.songs).toEqual({ create: 1, update: 0, unchanged: 1 });

    const ev = plan.events[0];
    expect(ev.status).toBe('update');
    expect(ev.changedFields).toEqual(['cânticos']);
    expect(ev.eventSongsCreate).toBe(1);
    expect(ev.eventSongsUnchanged).toBe(1);
    expect(ev.keptExtraEventSongs).toBe(1); // ES3 fica (nunca se apaga)
    expect(plan.warnings.some(w => w.includes('serão mantidos'))).toBe(true);
    expect(plan.isNoop).toBe(false);
  });

  it('deteta campos alterados nas músicas e eventos', () => {
    const raw = rawBackup({ songs: [song(S1, { title: 'Novo Título', capo: 2 }), song(S2)] });
    (raw.events as any[])[0].location = 'Capela';
    const plan = buildRestorePlan(parsed(raw), current());
    const s1 = plan.songs.find(s => s.id === S1)!;
    expect(s1.status).toBe('update');
    expect(s1.changedFields).toEqual(['título', 'capo']);
    expect(plan.events[0].changedFields).toContain('local');
  });

  it('ignora cânticos de músicas que não existem em lado nenhum', () => {
    const raw = rawBackup();
    (raw.events as any[])[0].event_songs.push(eventSong(ES3, E1, MISSING, 2));
    const plan = buildRestorePlan(parsed(raw), { songs: [], events: [], eventSongs: [] });
    expect(plan.events[0].status).toBe('create');
    expect(plan.events[0].eventSongsSkipped).toHaveLength(1);
    expect(plan.summary.eventSongs.skipped).toBe(1);
  });

  it('sem nada para fazer quando a BD já é igual à cópia', () => {
    const backup = parsed();
    const state: CurrentState = {
      songs: backup.songs.map(s => ({ ...s })),
      events: backup.events.map(({ event_songs: _eventSongs, ...e }) => e),
      eventSongs: backup.events.flatMap(e => e.event_songs),
    };
    const plan = buildRestorePlan(backup, state);
    expect(plan.isNoop).toBe(true);
    expect(plan.summary.events.unchanged).toBe(1);
  });
});

describe('applyRestorePlan', () => {
  const recordingAdapter = (failIds: string[] = [], failCapoOnce = false) => {
    const calls: { table: RestoreTable; rows: Record<string, unknown>[] }[] = [];
    let capoFailed = false;
    const adapter: RestoreAdapter = {
      async upsert(table, rows) {
        calls.push({ table, rows });
        if (failCapoOnce && !capoFailed && table === 'songs' && rows.some(r => 'capo' in r)) {
          capoFailed = true;
          return { error: { message: "Could not find the 'capo' column of 'songs'" } };
        }
        const bad = rows.find(r => failIds.includes(r.id as string));
        return { error: bad ? { message: `falhou ${bad.id}` } : null };
      },
    };
    return { adapter, calls };
  };

  it('aplica músicas, depois eventos, depois cânticos — e nunca apaga', async () => {
    const backup = parsed();
    const plan = buildRestorePlan(backup, { songs: [], events: [], eventSongs: [] });
    const { adapter, calls } = recordingAdapter();
    const report = await applyRestorePlan(backup, plan, adapter);

    expect(calls.map(c => c.table)).toEqual(['songs', 'events', 'event_songs']);
    expect(report.errorCount).toBe(0);
    expect(report.okCount).toBe(2 + 1 + 2);
    // Campos ignorados não são enviados
    expect(calls[0].rows[0]).not.toHaveProperty('created_by');
    expect(calls[0].rows[0]).not.toHaveProperty('updated_at');
  });

  it('não reenvia itens sem alterações', async () => {
    const backup = parsed();
    const state: CurrentState = {
      songs: backup.songs.map(s => ({ ...s })),
      events: backup.events.map(({ event_songs: _eventSongs, ...e }) => e),
      eventSongs: backup.events.flatMap(e => e.event_songs),
    };
    const { adapter, calls } = recordingAdapter();
    const report = await applyRestorePlan(backup, buildRestorePlan(backup, state), adapter);
    expect(calls).toHaveLength(0);
    expect(report.results).toHaveLength(0);
  });

  it('reporta erros por item e não grava cânticos de músicas que falharam', async () => {
    const backup = parsed();
    const plan = buildRestorePlan(backup, { songs: [], events: [], eventSongs: [] });
    const { adapter } = recordingAdapter([S1]);
    const report = await applyRestorePlan(backup, plan, adapter);

    const failedSong = report.results.find(r => r.table === 'songs' && r.id === S1);
    expect(failedSong?.ok).toBe(false);
    expect(report.results.find(r => r.table === 'songs' && r.id === S2)?.ok).toBe(true);
    const es1 = report.results.find(r => r.id === ES1);
    expect(es1?.ok).toBe(false);
    expect(es1?.error).toMatch(/música não foi restaurada/);
    expect(report.results.find(r => r.id === ES2)?.ok).toBe(true);
    expect(report.errorCount).toBe(2);
  });

  it('repete sem a coluna capo se a base de dados não a tiver', async () => {
    const backup = parsed();
    const plan = buildRestorePlan(backup, { songs: [], events: [], eventSongs: [] });
    const { adapter, calls } = recordingAdapter([], true);
    const report = await applyRestorePlan(backup, plan, adapter);
    expect(report.errorCount).toBe(0);
    const songCalls = calls.filter(c => c.table === 'songs');
    expect(songCalls).toHaveLength(2);
    expect(songCalls[1].rows[0]).not.toHaveProperty('capo');
  });
});
