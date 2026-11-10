import { describe, it, expect, vi } from 'vitest';
import {
  saveEventForOffline,
  getCachedEventDetails,
  getCachedSong,
  getOfflineEventRecord,
  getOfflineEventRecords,
  markEventOffline,
  unmarkEventOffline,
  upsertCachedSongs,
  saveCachedSongs,
  OFFLINE_EVENTS_CHANGED_EVENT,
} from '../../lib/offline-storage';
import { Event, EventSong, Song } from '../../lib/types';

let seq = 0;
function uid(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

function makeSong(id: string, title = `Cântico ${id}`): Song {
  return {
    id,
    title,
    artist: 'CNE',
    content: `{Refrão}\n[G]Sempre a[D]lerta ${id}`,
    tags: [],
    original_key: 'G',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
}

function makeEvent(id: string): Event {
  return { id, title: 'Missa de Promessas', date: '2026-11-01', location: 'Mafra', created_at: '2026-01-01' };
}

function makeEventSong(eventId: string, song: Song | null, idx: number, songId?: string): EventSong {
  return {
    id: uid('es'),
    event_id: eventId,
    song_id: songId || song?.id || uid('gone'),
    moment_name: idx === 0 ? 'Entrada' : 'Comunhão',
    order_index: idx,
    song,
  };
}

describe('Guardar evento para offline (saveEventForOffline)', () => {
  it('guarda o evento e o conteúdo completo de todos os cânticos, e marca-o como offline', async () => {
    const eventId = uid('evt');
    const s1 = makeSong(uid('song'));
    const s2 = makeSong(uid('song'));
    const progress: Array<[number, number]> = [];

    const record = await saveEventForOffline(
      makeEvent(eventId),
      [makeEventSong(eventId, s1, 0), makeEventSong(eventId, s2, 1)],
      { onProgress: (d, t) => progress.push([d, t]) }
    );

    expect(record.eventId).toBe(eventId);
    expect(record.songCount).toBe(2);
    expect(getOfflineEventRecord(eventId)?.savedAt).toBe(record.savedAt);
    expect(progress).toEqual([[0, 2], [1, 2], [2, 2]]);

    const details = await getCachedEventDetails(eventId);
    expect(details?.event.title).toBe('Missa de Promessas');
    expect(details?.eventSongs.map(es => es.song?.content)).toEqual([s1.content, s2.content]);

    expect((await getCachedSong(s1.id))?.content).toBe(s1.content);
    expect((await getCachedSong(s2.id))?.content).toBe(s2.content);
  });

  it('obtém da rede (fetchSong) cânticos sem conteúdo e ignora entradas de músicas apagadas', async () => {
    const eventId = uid('evt');
    const full = makeSong(uid('song'));
    const partial = { ...makeSong(uid('song')), content: undefined } as unknown as Song;
    const fetchSong = vi.fn(async (id: string) => (id === partial.id ? makeSong(id) : null));

    const record = await saveEventForOffline(
      makeEvent(eventId),
      [makeEventSong(eventId, full, 0), makeEventSong(eventId, partial, 1), makeEventSong(eventId, null, 2)],
      { fetchSong }
    );

    expect(fetchSong).toHaveBeenCalledTimes(1);
    expect(fetchSong).toHaveBeenCalledWith(partial.id);
    expect(record.songCount).toBe(2);
    const details = await getCachedEventDetails(eventId);
    expect(details?.eventSongs).toHaveLength(3);
    expect(typeof details?.eventSongs[1].song?.content).toBe('string');
    expect(details?.eventSongs[2].song).toBeNull();
  });

  it('falha com mensagem clara e NÃO marca o evento se um cântico não puder ser obtido', async () => {
    const eventId = uid('evt');
    const partial = { ...makeSong(uid('song'), 'Hino Escutista'), content: undefined } as unknown as Song;
    const fetchSong = vi.fn(async () => {
      throw new Error('offline');
    });

    await expect(
      saveEventForOffline(makeEvent(eventId), [makeEventSong(eventId, partial, 0)], { fetchSong })
    ).rejects.toThrow(/Hino Escutista/);
    expect(getOfflineEventRecord(eventId)).toBeNull();
  });

  it('rejeita evento inválido', async () => {
    await expect(saveEventForOffline(null as unknown as Event, [])).rejects.toThrow(/Evento inválido/);
  });

  it('os cânticos continuam disponíveis mesmo que a cache geral de cânticos seja reescrita', async () => {
    const eventId = uid('evt');
    const s1 = makeSong(uid('song'));
    await saveEventForOffline(makeEvent(eventId), [makeEventSong(eventId, s1, 0)]);

    // Sincronização posterior grava uma lista que não inclui este cântico
    await saveCachedSongs([makeSong(uid('other'))]);
    localStorage.removeItem('cancioneiro_cached_songs');

    expect((await getCachedSong(s1.id))?.content).toBe(s1.content);
  });

  it('upsertCachedSongs não apaga os cânticos já existentes', async () => {
    const a = makeSong(uid('song'));
    const b = makeSong(uid('song'));
    await saveCachedSongs([a]);
    await upsertCachedSongs([b]);
    expect((await getCachedSong(a.id))?.id).toBe(a.id);
    expect((await getCachedSong(b.id))?.id).toBe(b.id);
  });
});

describe('Registos de eventos offline', () => {
  it('ignora dados corrompidos e entradas inválidas', () => {
    localStorage.setItem('cancioneiro_offline_events_v1', '{broken');
    expect(getOfflineEventRecords()).toEqual({});
    localStorage.setItem('cancioneiro_offline_events_v1', '["a"]');
    expect(getOfflineEventRecords()).toEqual({});
    localStorage.setItem(
      'cancioneiro_offline_events_v1',
      JSON.stringify({
        ok: { eventId: 'ok', savedAt: 1, songCount: 2 },
        wrongKey: { eventId: 'other', savedAt: 1, songCount: 2 },
        noDate: { eventId: 'noDate', songCount: 2 },
      })
    );
    expect(Object.keys(getOfflineEventRecords())).toEqual(['ok']);
  });

  it('marca/desmarca e avisa os componentes', () => {
    const listener = vi.fn();
    window.addEventListener(OFFLINE_EVENTS_CHANGED_EVENT, listener);
    markEventOffline({ eventId: 'e1', savedAt: 123, songCount: 4 });
    expect(getOfflineEventRecord('e1')).toEqual({ eventId: 'e1', savedAt: 123, songCount: 4 });
    unmarkEventOffline('e1');
    expect(getOfflineEventRecord('e1')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(OFFLINE_EVENTS_CHANGED_EVENT, listener);
  });
});
