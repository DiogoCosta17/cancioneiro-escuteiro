import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { buildMassSuggestionPrompt, parseMassSuggestion, suggestMassSongs } from '../../lib/liturgy-ai';
import { buildMassPlan } from '../../lib/mass-planner';
import { getLiturgicalDay } from '../../lib/liturgical-calendar';
import { saveCachedReadings, type DailyReadings } from '../../lib/daily-readings';
import { readMassPlanState } from '../../components/admin/EventEditor';
import { MassPlanner } from '../../components/eucharist/MassPlanner';
import { SongListProvider } from '../../hooks/useSongList';
import type { Song } from '../../lib/types';

const invoke = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: true }) }));

function song(id: string, title: string, tags: string[], content = '[C]Letra de exemplo'): Song {
  return { id, title, content, tags, original_key: 'C', created_at: '2026-01-01', updated_at: '2026-01-01' };
}

const readings: DailyReadings = {
  date: '2026-11-08',
  title: '32º Domingo do Tempo Comum',
  readings: [
    { kind: 'first', label: '1.ª Leitura', reference: 'Livro da Sabedoria 6,12-16', text: 'A Sabedoria é luminosa.' },
    { kind: 'psalm', label: 'Salmo Responsorial', reference: 'Livro dos Salmos 63(62),2', text: 'Senhor, sois o meu Deus.', refrain: 'A minha alma tem sede de Vós, meu Deus.' },
    { kind: 'gospel', label: 'Evangelho', reference: 'Evangelho segundo São Mateus 25,1-13', text: 'As dez virgens e as lâmpadas.' },
  ],
};

const day = getLiturgicalDay(new Date(2026, 10, 8));
const songs = [
  song('luz', 'Acendei as Lâmpadas', ['Entrada'], '[G]Acendei as [D]lâmpadas, vem o esposo'),
  song('povo', 'Povo de Deus', ['Entrada', 'Final']),
  song('natal', 'Noite Feliz', ['Entrada', 'Natal']),
  song('pao', 'Pão do Céu', ['Comunhão']),
];
const slots = buildMassPlan(songs, day);

beforeEach(() => {
  invoke.mockReset();
});

describe('Prompt da sugestão de cânticos', () => {
  it('inclui as leituras (com o refrão do salmo), a celebração e só os cânticos que podem ser propostos', () => {
    const prompt = buildMassSuggestionPrompt(readings, day, slots);
    expect(prompt).toContain('Domingo XXXII do Tempo Comum');
    expect(prompt).toContain('Evangelho segundo São Mateus 25,1-13');
    expect(prompt).toContain('Refrão: A minha alma tem sede de Vós, meu Deus.');
    expect(prompt).toContain('id: luz | "Acendei as Lâmpadas"');
    expect(prompt).toContain('Acendei as lâmpadas, vem o esposo');
    expect(prompt).not.toContain('[G]');
    // Cântico de Natal em novembro não é oferecido à IA
    expect(prompt).not.toContain('id: natal');
    // O versículo do Aleluia não é pedido à IA (copia-se do liturgia.pt)
    expect(prompt).not.toContain('versiculo');
  });
});

describe('Validação da resposta da IA (cânticos)', () => {
  it('aceita JSON dentro de um bloco ```json e mapeia as escolhas válidas', () => {
    const text = [
      '```json',
      JSON.stringify({ tema: 'Vigilância', momentos: { entrada: { id: 'luz', porque: 'Fala das lâmpadas acesas.' }, comunhao: { id: 'pao', porque: 'Pão da vida.' } } }),
      '```',
    ].join('\n');
    const s = parseMassSuggestion(text, slots);
    expect(s.theme).toBe('Vigilância');
    expect(s.picks.entrada).toEqual({ songId: 'luz', reason: 'Fala das lâmpadas acesas.' });
    expect(s.picks.comunhao.songId).toBe('pao');
  });

  it('descarta ids inventados, de outro momento, de outro tempo litúrgico e repetidos', () => {
    const text = JSON.stringify({
      momentos: {
        entrada: { id: 'natal', porque: 'x' }, // outro tempo
        santo: { id: 'pao', porque: 'x' }, // não é cântico do Santo
        final: { id: 'inventado', porque: 'x' },
        comunhao: { id: 'pao', porque: 'ok' },
        'pos-comunhao': { id: 'pao', porque: 'repetido' },
      },
    });
    expect(Object.keys(parseMassSuggestion(text, slots).picks)).toEqual(['comunhao']);
  });

  it('resposta sem JSON dá um erro claro', () => {
    expect(() => parseMassSuggestion('Não sei ajudar.', slots)).toThrow('formato esperado');
  });

  it('suggestMassSongs usa a função de pedido recebida', async () => {
    const ask = vi.fn().mockResolvedValue(JSON.stringify({ momentos: { entrada: { id: 'luz', porque: 'Lâmpadas.' } } }));
    expect((await suggestMassSongs(readings, day, slots, ask)).picks.entrada.songId).toBe('luz');
  });
});

describe('Proposta enviada ao editor com versículo', () => {
  it('readMassPlanState lê o versículo (até 600 caracteres)', () => {
    const draft = readMassPlanState({ massPlan: { title: 'Missa', date: '2026-11-08', songs: [], gospelAcclamation: 'Vigiai.' } });
    expect(draft?.gospelAcclamation).toBe('Vigiai.');
    const long = readMassPlanState({ massPlan: { title: 'Missa', date: '2026-11-08', songs: [], gospelAcclamation: 'x'.repeat(700) } });
    expect(long?.gospelAcclamation).toHaveLength(600);
  });
});

describe('MassPlanner — Sugerir com IA', () => {
  function EditorProbe() {
    const draft = readMassPlanState(useLocation().state);
    return <p>Rascunho: {draft?.songs.map(s => s.song_id).join(',')} | {draft?.gospelAcclamation}</p>;
  }

  it('aplica as escolhas da IA (um só pedido, sem pesquisa) e o versículo escrito à mão vai para o evento', async () => {
    saveCachedReadings(readings); // leituras já guardadas: não vai à rede
    invoke.mockResolvedValue({
      data: { text: JSON.stringify({ tema: 'Estar vigilantes', momentos: { entrada: { id: 'luz', porque: 'As lâmpadas acesas do Evangelho.' } } }) },
      error: null,
    });

    render(
      <SongListProvider>
        <MemoryRouter initialEntries={['/eucaristia']}>
          <Routes>
            <Route path="/eucaristia" element={<MassPlanner slots={slots} day={day} dateISO="2026-11-08" />} />
            <Route path="/admin/events/new" element={<EditorProbe />} />
          </Routes>
        </MemoryRouter>
      </SongListProvider>
    );

    // Sem IA, a ordem alfabética põe "Acendei as Lâmpadas"; troca-se para provar que a IA muda a escolha
    fireEvent.change(screen.getByLabelText('Cântico para Entrada'), { target: { value: 'povo' } });
    fireEvent.click(screen.getByRole('button', { name: /Sugerir com IA/ }));

    expect(await screen.findByText('As lâmpadas acesas do Evangelho.')).toBeInTheDocument();
    expect((screen.getByLabelText('Cântico para Entrada') as HTMLSelectElement).value).toBe('luz');
    expect(screen.getByText(/Estar vigilantes/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('gemini-vision', { body: { prompt: expect.stringContaining('Mateus 25') } });

    // Versículo: a IA não o preenche; há o link para o oficial da data da missa
    const verse = screen.getByLabelText(/Versículo do Aleluia/);
    expect(verse).toHaveValue('');
    expect(screen.getByRole('link', { name: /Ver o versículo oficial no liturgia.pt/ })).toHaveAttribute(
      'href',
      'https://www.liturgia.pt/liturgiadiaria/dia.php?data=2026-11-8'
    );
    fireEvent.change(verse, { target: { value: 'Vigiai e estai preparados.' } });

    fireEvent.click(screen.getByRole('button', { name: /Criar evento com esta proposta/ }));
    await waitFor(() => expect(screen.getByText(/Rascunho:/)).toHaveTextContent('luz'));
    expect(screen.getByText(/Rascunho:/)).toHaveTextContent('Vigiai e estai preparados.');
  });

  it('erro da IA aparece sem estragar a proposta', async () => {
    saveCachedReadings(readings);
    invoke.mockResolvedValue({ data: { error: 'Quota excedida' }, error: null });
    render(
      <SongListProvider>
        <MemoryRouter>
          <MassPlanner slots={slots} day={day} dateISO="2026-11-08" />
        </MemoryRouter>
      </SongListProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Sugerir com IA/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Quota excedida');
    expect((screen.getByLabelText('Cântico para Entrada') as HTMLSelectElement).value).toBe('luz');
  });
});
