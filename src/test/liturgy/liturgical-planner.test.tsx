import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import {
  easterSunday,
  firstSundayOfAdvent,
  baptismOfTheLord,
  getLiturgicalDay,
  liturgicalCycle,
  toRoman,
} from '../../lib/liturgical-calendar';
import {
  buildMassPlan,
  initialSelection,
  rankMomentCandidates,
  LENT_ALELUIA_NOTE,
  LENT_ALELUIA_BLOCKED,
} from '../../lib/mass-planner';
import { LITURGICAL_MOMENTS, findMomentByName } from '../../lib/liturgical-moments';
import { readMassPlanState } from '../../components/admin/EventEditor';
import { MassPlanner } from '../../components/eucharist/MassPlanner';
import { SongListProvider } from '../../hooks/useSongList';
import type { Song } from '../../lib/types';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: true }) }));

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const moment = (id: string) => LITURGICAL_MOMENTS.find(m => m.id === id)!;

function song(id: string, title: string, tags: string[]): Song {
  return { id, title, content: '[C]Lá', tags, original_key: 'C', created_at: '2026-01-01', updated_at: '2026-01-01' };
}

describe('Calendário litúrgico', () => {
  it('calcula a Páscoa de vários anos', () => {
    expect(easterSunday(2024)).toEqual(d(2024, 3, 31));
    expect(easterSunday(2025)).toEqual(d(2025, 4, 20));
    expect(easterSunday(2026)).toEqual(d(2026, 4, 5));
    expect(easterSunday(2027)).toEqual(d(2027, 3, 28));
    expect(easterSunday(2038)).toEqual(d(2038, 4, 25));
  });

  it('I Domingo do Advento entre 27/11 e 3/12', () => {
    expect(firstSundayOfAdvent(2026)).toEqual(d(2026, 11, 29));
    expect(firstSundayOfAdvent(2027)).toEqual(d(2027, 11, 28));
    expect(firstSundayOfAdvent(2022)).toEqual(d(2022, 11, 27)); // Natal ao domingo
    expect(firstSundayOfAdvent(2023)).toEqual(d(2023, 12, 3));
  });

  it('Batismo do Senhor passa para segunda-feira quando a Epifania calha a 7 ou 8', () => {
    expect(baptismOfTheLord(2026)).toEqual(d(2026, 1, 11));
    expect(baptismOfTheLord(2023)).toEqual(d(2023, 1, 9));
  });

  it('ciclo dominical A/B/C muda no I Domingo do Advento', () => {
    expect(liturgicalCycle(d(2025, 11, 30))).toBe('A');
    expect(liturgicalCycle(d(2026, 11, 8))).toBe('A');
    expect(liturgicalCycle(d(2026, 11, 29))).toBe('B');
    expect(liturgicalCycle(d(2025, 11, 23))).toBe('C');
  });

  it('numerais romanos', () => {
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(19)).toBe('XIX');
    expect(toRoman(34)).toBe('XXXIV');
  });

  it.each([
    [d(2026, 11, 8), 'comum', 'verde', 'Domingo XXXII do Tempo Comum'],
    [d(2026, 11, 22), 'comum', 'branco', 'Nosso Senhor Jesus Cristo, Rei do Universo'],
    [d(2026, 11, 29), 'advento', 'roxo', 'I Domingo do Advento'],
    [d(2026, 12, 13), 'advento', 'rosa', 'III Domingo do Advento'],
    [d(2026, 12, 8), 'advento', 'branco', 'Imaculada Conceição da Virgem Santa Maria'],
    [d(2024, 12, 9), 'advento', 'branco', 'Imaculada Conceição da Virgem Santa Maria'],
    [d(2026, 12, 25), 'natal', 'branco', 'Natal do Senhor'],
    [d(2026, 12, 27), 'natal', 'branco', 'Sagrada Família de Jesus, Maria e José'],
    [d(2022, 12, 30), 'natal', 'branco', 'Sagrada Família de Jesus, Maria e José'],
    [d(2027, 1, 1), 'natal', 'branco', 'Santa Maria, Mãe de Deus'],
    [d(2026, 1, 4), 'natal', 'branco', 'Epifania do Senhor'],
    [d(2026, 1, 18), 'comum', 'verde', 'Domingo II do Tempo Comum'],
    [d(2023, 1, 15), 'comum', 'verde', 'Domingo II do Tempo Comum'],
    [d(2026, 2, 15), 'comum', 'verde', 'Domingo VI do Tempo Comum'],
    [d(2026, 2, 18), 'quaresma', 'roxo', 'Quarta-feira de Cinzas'],
    [d(2026, 2, 22), 'quaresma', 'roxo', 'I Domingo da Quaresma'],
    [d(2026, 3, 15), 'quaresma', 'rosa', 'IV Domingo da Quaresma'],
    [d(2026, 3, 29), 'quaresma', 'vermelho', 'Domingo de Ramos na Paixão do Senhor'],
    [d(2026, 4, 3), 'quaresma', 'vermelho', 'Sexta-feira Santa (Paixão do Senhor)'],
    [d(2026, 4, 5), 'pascoa', 'branco', 'Domingo de Páscoa da Ressurreição do Senhor'],
    [d(2026, 4, 12), 'pascoa', 'branco', 'II Domingo da Páscoa'],
    [d(2026, 5, 17), 'pascoa', 'branco', 'Ascensão do Senhor'],
    [d(2026, 5, 24), 'pascoa', 'vermelho', 'Domingo de Pentecostes'],
    [d(2026, 5, 31), 'comum', 'branco', 'Santíssima Trindade'],
    [d(2026, 6, 4), 'comum', 'branco', 'Santíssimo Corpo e Sangue de Cristo (Corpo de Deus)'],
    [d(2026, 6, 7), 'comum', 'verde', 'Domingo X do Tempo Comum'],
    [d(2026, 8, 15), 'comum', 'branco', 'Assunção de Nossa Senhora'],
    [d(2025, 2, 2), 'comum', 'branco', 'Apresentação do Senhor'],
    [d(2025, 6, 29), 'comum', 'vermelho', 'São Pedro e São Paulo, Apóstolos'],
    [d(2029, 6, 24), 'comum', 'branco', 'Nascimento de São João Batista'],
    [d(2028, 8, 6), 'comum', 'branco', 'Transfiguração do Senhor'],
    [d(2025, 9, 14), 'comum', 'vermelho', 'Exaltação da Santa Cruz'],
    [d(2025, 11, 9), 'comum', 'branco', 'Dedicação da Basílica de Latrão'],
    [d(2038, 6, 24), 'comum', 'branco', 'Santíssimo Corpo e Sangue de Cristo (Corpo de Deus)'],
  ])('%s → %s / %s / %s', (date, season, color, celebration) => {
    const day = getLiturgicalDay(date);
    expect(day.season).toBe(season);
    expect(day.color).toBe(color);
    expect(day.celebration).toBe(celebration);
  });

  it('dias de semana sem celebração e Semana Santa com nome próprio', () => {
    expect(getLiturgicalDay(d(2026, 11, 4)).celebration).toBeNull();
    expect(getLiturgicalDay(d(2026, 3, 31)).seasonName).toBe('Semana Santa');
    expect(getLiturgicalDay(d(2026, 12, 8)).marian).toBe(true);
  });

  it('ignora as horas da data recebida', () => {
    expect(getLiturgicalDay(new Date(2026, 10, 29, 23, 59)).celebration).toBe('I Domingo do Advento');
  });
});

describe('Momentos litúrgicos', () => {
  it('encontra o momento pelo nome guardado ou por etiqueta, sem acentos', () => {
    expect(findMomentByName('Pós-Comunhão')?.id).toBe('pos-comunhao');
    expect(findMomentByName('pos comunhao')?.id).toBe('pos-comunhao');
    expect(findMomentByName('Ato Penitencial')?.id).toBe('ato-penitencial');
    expect(findMomentByName('Glória')).toBeNull();
    expect(findMomentByName(null)).toBeNull();
  });
});

describe('Sugestões por momento', () => {
  const advent = getLiturgicalDay(d(2026, 11, 29));
  const songs = [
    song('a', 'Vem Senhor', ['Entrada', 'Advento']),
    song('b', 'Alegres Vamos', ['Entrada']),
    song('c', 'Noite Feliz', ['Entrada', 'Natal']),
    song('d', 'Povo de Deus', ['Entrada']),
    song('e', 'Só Ofertório', ['Ofertório']),
  ];

  it('dá prioridade aos cânticos do tempo e põe os de outro tempo no fim', () => {
    const ranked = rankMomentCandidates(songs, moment('entrada'), advent);
    expect(ranked.map(c => c.song.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(ranked[0].seasonFit).toBe('match');
    expect(ranked[3].seasonFit).toBe('other');
    expect(ranked[3].otherSeasons).toEqual(['Natal']);
  });

  it('só contam as etiquetas: cânticos sem a etiqueta do momento não entram; dados inválidos são ignorados', () => {
    const ranked = rankMomentCandidates([null as unknown as Song, ...songs], moment('entrada'), advent);
    expect(ranked.map(c => c.song.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(ranked.some(c => c.song.id === 'e')).toBe(false);
    // Sem histórico, os cânticos sem tempo definido ficam por ordem alfabética
    expect(ranked.filter(c => c.seasonFit === 'neutral').map(c => c.song.title)).toEqual(['Alegres Vamos', 'Povo de Deus']);
  });

  it('valoriza cânticos marianos nas solenidades de Nossa Senhora', () => {
    const list = [song('x', 'Avé', ['Entrada']), song('y', 'Salve Rainha', ['Entrada', 'Marianas'])];
    const ranked = rankMomentCandidates(list, moment('entrada'), getLiturgicalDay(d(2026, 8, 15)));
    expect(ranked[0].song.id).toBe('y');
    expect(ranked[0].marianMatch).toBe(true);
  });

  it('na Quaresma o Aleluia é trocado pela aclamação ao Evangelho', () => {
    const lent = getLiturgicalDay(d(2026, 3, 1));
    const list = [song('al', 'Aleluia Pascal', ['Aleluia']), song('ac', 'Glória a Vós', ['Aclamação', 'Quaresma'])];
    const plan = buildMassPlan(list, lent);
    const slot = plan.find(s => s.moment.id === 'aleluia')!;
    expect(slot.note).toBe(LENT_ALELUIA_NOTE);
    // A aclamação vem primeiro; o Aleluia continua visível, mas assinalado e nunca proposto
    expect(slot.candidates.map(c => c.song.id)).toEqual(['ac', 'al']);
    expect(slot.candidates[1].blockedReason).toBe(LENT_ALELUIA_BLOCKED);
    expect(initialSelection(plan)[plan.indexOf(slot)]).toBe('ac');
    const onlyAleluia = buildMassPlan([list[0]], lent);
    expect(initialSelection(onlyAleluia)[plan.indexOf(slot)]).toBeNull();
    const ordinary = buildMassPlan(list, getLiturgicalDay(d(2026, 11, 8)));
    expect(ordinary.find(s => s.moment.id === 'aleluia')!.note).toBeNull();
  });

  it('proposta inicial: sem repetir cânticos e sem cânticos de outro tempo', () => {
    const list = [
      song('a', 'Vem Senhor', ['Entrada', 'Final', 'Advento']),
      song('c', 'Noite Feliz', ['Final', 'Natal']),
      song('o', 'Ofertório', ['Ofertório']),
    ];
    const plan = buildMassPlan(list, advent);
    const selection = initialSelection(plan);
    const byMoment = Object.fromEntries(plan.map((s, i) => [s.moment.id, selection[i]]));
    expect(byMoment.entrada).toBe('a');
    expect(byMoment.final).toBeNull();
    expect(byMoment.ofertorio).toBe('o');
    expect(byMoment.santo).toBeNull();
  });
});

describe('Proposta enviada ao editor de eventos', () => {
  it('valida o state da navegação', () => {
    expect(readMassPlanState(null)).toBeNull();
    expect(readMassPlanState({ massPlan: { title: 'Missa', date: 'amanhã', songs: [] } })).toBeNull();
    const draft = readMassPlanState({
      massPlan: {
        title: 'Missa — I Domingo do Advento',
        date: '2026-11-29',
        songs: [{ song_id: 'a', moment_name: 'Entrada', song: { id: 'a', title: 'Vem' } }, { nope: true }, null],
      },
    });
    expect(draft).toEqual({
      title: 'Missa — I Domingo do Advento',
      date: '2026-11-29',
      songs: [{ song_id: 'a', moment_name: 'Entrada', order_index: 0, song: { id: 'a', title: 'Vem' } }],
    });
  });
});

describe('MassPlanner', () => {
  function EditorProbe() {
    const draft = readMassPlanState(useLocation().state);
    return (
      <div>
        <p>Editor: {draft?.title}</p>
        <p>Data: {draft?.date}</p>
        <p>Cânticos: {draft?.songs.map(s => `${s.moment_name}=${s.song_id}`).join(',')}</p>
      </div>
    );
  }

  it('mostra a proposta, permite trocar e cria o evento com os cânticos escolhidos', () => {
    const day = getLiturgicalDay(d(2026, 11, 29));
    const list = [
      song('a', 'Vem Senhor', ['Entrada', 'Advento']),
      song('b', 'Alegres Vamos', ['Entrada']),
      song('o', 'Bendito', ['Ofertório']),
    ];
    const slots = buildMassPlan(list, day);
    render(
      <SongListProvider>
        <MemoryRouter initialEntries={['/eucaristia']}>
          <Routes>
            <Route path="/eucaristia" element={<MassPlanner slots={slots} day={day} dateISO="2026-11-29" />} />
            <Route path="/admin/events/new" element={<EditorProbe />} />
          </Routes>
        </MemoryRouter>
      </SongListProvider>
    );

    const entrada = screen.getByLabelText('Cântico para Entrada') as HTMLSelectElement;
    expect(entrada.value).toBe('a');
    expect(screen.getByText('Próprio do Advento')).toBeInTheDocument();

    fireEvent.change(entrada, { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento com esta proposta/ }));

    expect(screen.getByText('Editor: Missa — I Domingo do Advento')).toBeInTheDocument();
    expect(screen.getByText('Data: 2026-11-29')).toBeInTheDocument();
    expect(screen.getByText('Cânticos: Entrada=b,Ofertório=o')).toBeInTheDocument();
  });

  it('adiciona os cânticos escolhidos à lista pessoal', () => {
    const day = getLiturgicalDay(d(2026, 11, 8));
    const slots = buildMassPlan([song('a', 'Entrada X', ['Entrada']), song('f', 'Final Y', ['Final'])], day);
    render(
      <SongListProvider>
        <MemoryRouter>
          <MassPlanner slots={slots} day={day} dateISO="2026-11-08" />
        </MemoryRouter>
      </SongListProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Adicionar à minha lista/ }));
    expect(screen.getByRole('status')).toHaveTextContent('2 cânticos adicionados');
  });
});
