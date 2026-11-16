import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  cleanReadingText,
  cleanRefrain,
  fetchDailyReadings,
  getCachedReadings,
  saveCachedReadings,
  loadDailyReadings,
  liturgiaPtUrl,
  gospelOf,
  evangelhoQuotidianoUrl,
  ReadingsUnavailableError,
  READINGS_CACHE_KEY,
} from '../../lib/daily-readings';
import Liturgy from '../../pages/Liturgy';

// Respostas no formato da API publication.evangelizo.ws (domingo 08/11/2026 e quarta-feira 04/11/2026)
const API: Record<string, unknown> = {
  '2026-11-08': {
    data: {
      date: '2026-11-08',
      liturgic_title: '32º Domingo do Tempo Comum',
      readings: [
        { type: 'reading', title: 'Livro da Sabedoria', reference_displayed: '6,12-16.', chorus: null, text: '[[Sg 6,12]]A Sabedoria é luminosa e o seu brilho é inalterável;\n[[Sg 6,13]]deixa-se ver facilmente.' },
        {
          type: 'psalm',
          title: 'Livro dos Salmos',
          reference_displayed: '63(62),2.3-4.5-6.7-8.',
          chorus: 'R/ A minha alma tem sede de Vós, meu Deus. ',
          text: '[[Ps 63,2]]Senhor, sois o meu Deus: \r\nA minha alma tem sede de Vós.\n\n[[Ps 63,3]]Quero contemplar-Vos.',
        },
        { type: 'reading', title: '1.ª Carta aos Tessalonicenses', reference_displayed: '4,13-18.', chorus: null, text: '[[1_Th 4,13]]Não queremos, irmãos, deixar-vos na ignorância.' },
        { type: 'gospel', title: 'Evangelho segundo São Mateus', reference_displayed: '25,1-13.', chorus: null, text: '[[Mt 25,1]]Naquele tempo, disse Jesus: «O Reino dos Céus "dez virgens"».' },
      ],
    },
  },
  '2026-11-04': {
    data: {
      date: '2026-11-04',
      liturgic_title: 'Quarta-feira da 31ª semana do Tempo Comum',
      readings: [
        { type: 'reading', title: 'Carta aos Filipenses', reference_displayed: '2,12-18.', text: '[[Fl 2,12]]Caríssimos: Obedientes como sempre tendes sido.' },
        { type: 'psalm', title: 'Livro dos Salmos', reference_displayed: '27(26),1.', chorus: 'R/ O Senhor é a minha luz e a minha salvação.', text: '[[Ps 27,1]]O Senhor é minha luz e salvação.' },
        { type: 'gospel', title: 'Evangelho segundo São Lucas', reference_displayed: '14,25-33.', text: '[[Lc 14,25]]Naquele tempo, seguia Jesus uma grande multidão.' },
      ],
    },
  },
  '2027-03-28': { error: { type: 'InvalidParameterException', message: 'This date is too far in the future', label: 'ERROR_GENERIC_INVALID_PARAMETER' } },
};

function fakeFetch(url: string) {
  const date = /\/days\/(\d{4}-\d{2}-\d{2})$/.exec(url)?.[1] || '';
  const body = API[date] ?? { data: { date, liturgic_title: '', readings: [] } };
  const isError = Boolean((body as { error?: unknown }).error);
  return Promise.resolve({ ok: !isError, status: isError ? 400 : 200, json: () => Promise.resolve(body) });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Limpeza do texto da API', () => {
  it('retira marcadores de versículo e normaliza mudanças de linha', () => {
    expect(cleanReadingText('[[Ps 63,2]]Senhor, \r\nA minha alma.\n\n\n[[Ps 63,3]]Quero.')).toBe('Senhor,\nA minha alma.\n\nQuero.');
    expect(cleanReadingText(null)).toBe('');
  });

  it('refrão sem o "R/"', () => {
    expect(cleanRefrain('R/ A minha alma tem sede de Vós, meu Deus. ')).toBe('A minha alma tem sede de Vós, meu Deus.');
    expect(cleanRefrain('')).toBeNull();
    expect(cleanRefrain(null)).toBeNull();
  });
});

describe('fetchDailyReadings', () => {
  it('domingo: um só pedido, título, 4 leituras, refrão do salmo e referências limpas', async () => {
    const spy = vi.fn(fakeFetch);
    const r = await fetchDailyReadings('2026-11-08', spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('https://publication.evangelizo.ws/PT/days/2026-11-08');
    expect(r.title).toBe('32º Domingo do Tempo Comum');
    expect(r.readings.map(x => x.label)).toEqual(['1.ª Leitura', 'Salmo Responsorial', '2.ª Leitura', 'Evangelho']);
    expect(r.readings[0].reference).toBe('Livro da Sabedoria 6,12-16');
    expect(r.readings[1].refrain).toBe('A minha alma tem sede de Vós, meu Deus.');
    expect(r.readings[1].text).toBe('Senhor, sois o meu Deus:\nA minha alma tem sede de Vós.\n\nQuero contemplar-Vos.');
    expect(r.readings[0].refrain).toBeUndefined();
    expect(r.readings.some(x => x.text.includes('[['))).toBe(false);
  });

  it('dia de semana: sem 2.ª leitura', async () => {
    const r = await fetchDailyReadings('2026-11-04', fakeFetch);
    expect(r.readings.map(x => x.kind)).toEqual(['first', 'psalm', 'gospel']);
  });

  it('data ainda não publicada (demasiado no futuro) dá um erro próprio', async () => {
    await expect(fetchDailyReadings('2027-03-28', fakeFetch)).rejects.toBeInstanceOf(ReadingsUnavailableError);
  });

  it('rejeita datas inválidas, dias sem leituras e erros HTTP', async () => {
    await expect(fetchDailyReadings('08/11/2026', fakeFetch)).rejects.toThrow('Data inválida');
    await expect(fetchDailyReadings('2026-11-20', fakeFetch)).rejects.toThrow('Não há leituras');
    const failing = () => Promise.resolve({ ok: false, status: 503, json: () => Promise.reject(new Error('not json')) });
    await expect(fetchDailyReadings('2026-11-08', failing)).rejects.toThrow('503');
  });
});

describe('Fontes e ligações', () => {
  it('endereços do dia no liturgia.pt (sem zeros à esquerda) e no Evangelho Quotidiano', () => {
    expect(liturgiaPtUrl('2026-11-08')).toBe('https://www.liturgia.pt/liturgiadiaria/dia.php?data=2026-11-8');
    expect(liturgiaPtUrl('2027-01-01')).toBe('https://www.liturgia.pt/liturgiadiaria/dia.php?data=2027-1-1');
    expect(evangelhoQuotidianoUrl('2026-11-08')).toBe('https://evangelhoquotidiano.org/PT/gospel/2026-11-08');
  });

  it('gospelOf devolve o Evangelho do dia', async () => {
    const r = await fetchDailyReadings('2026-11-08', fakeFetch);
    expect(gospelOf(r)?.reference).toBe('Evangelho segundo São Mateus 25,1-13');
    expect(gospelOf({ ...r, readings: [] })).toBeNull();
  });
});

describe('Cópia local das leituras', () => {
  it('guarda e lê por data, e mantém só as 30 mais recentes', async () => {
    const r = await fetchDailyReadings('2026-11-08', fakeFetch);
    saveCachedReadings(r);
    expect(getCachedReadings('2026-11-08')?.readings[1].refrain).toBe('A minha alma tem sede de Vós, meu Deus.');
    for (let i = 1; i <= 31; i++) saveCachedReadings({ ...r, date: `2027-01-${String(i).padStart(2, '0')}` });
    const stored = JSON.parse(localStorage.getItem(READINGS_CACHE_KEY) || '{}');
    expect(Object.keys(stored)).toHaveLength(30);
  });

  it('cópia corrompida não rebenta', () => {
    localStorage.setItem(READINGS_CACHE_KEY, '{nope');
    expect(getCachedReadings('2026-11-08')).toBeNull();
  });

  it('loadDailyReadings usa a cópia local sem ir à rede', async () => {
    saveCachedReadings(await fetchDailyReadings('2026-11-08', fakeFetch));
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await loadDailyReadings('2026-11-08');
    expect(r.title).toBe('32º Domingo do Tempo Comum');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Página Liturgia Diária', () => {
  it('mostra as leituras com o refrão do salmo, o crédito da tradução e navega para o dia seguinte', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(((url: string) => fakeFetch(url)) as unknown as typeof fetch);
    render(
      <MemoryRouter initialEntries={['/liturgia?data=2026-11-08']}>
        <Routes>
          <Route path="/liturgia" element={<Liturgy />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Evangelho segundo São Mateus 25,1-13')).toBeInTheDocument();
    expect(screen.getByText('Domingo XXXII do Tempo Comum')).toBeInTheDocument();
    expect(screen.getByText('A minha alma tem sede de Vós, meu Deus.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(content => content.startsWith('O refrão (R/) deste salmo não veio'))).not.toBeInTheDocument();
    expect(screen.getByText(/Tradução litúrgica da Bíblia/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cânticos para este dia/ })).toHaveAttribute('href', '/eucaristia?data=2026-11-08');
    expect(screen.getByRole('link', { name: 'Oficial (liturgia.pt)' })).toHaveAttribute('href', 'https://www.liturgia.pt/liturgiadiaria/dia.php?data=2026-11-8');

    fireEvent.click(screen.getByRole('button', { name: 'Dia seguinte' }));
    await waitFor(() => expect(screen.getByDisplayValue('2026-11-09')).toBeInTheDocument());
  });

  it('sem rede e sem cópia mostra um aviso em vez de rebentar', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/liturgia?data=2026-11-08']}>
        <Liturgy />
      </MemoryRouter>
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar as leituras');
    expect(alert).toHaveTextContent('É preciso ligação à internet');
  });

  it('dia ainda não publicado: explica e liga ao liturgia.pt', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(((url: string) => fakeFetch(url)) as unknown as typeof fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/liturgia?data=2027-03-28']}>
        <Liturgy />
      </MemoryRouter>
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ainda não estão publicadas');
    expect(screen.getByRole('link', { name: /Ver as leituras deste dia no liturgia.pt/ })).toHaveAttribute(
      'href',
      'https://www.liturgia.pt/liturgiadiaria/dia.php?data=2027-3-28'
    );
  });
});
