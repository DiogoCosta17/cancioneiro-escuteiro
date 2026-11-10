import { normalizeSearchText } from './search-utils';

export interface LiturgicalMoment {
  id: string;
  number: number;
  /** Nome canónico (é o valor guardado em `event_songs.moment_name`). */
  name: string;
  /** Etiquetas de cânticos aceites para este momento. */
  tags: string[];
}

// Momentos litúrgicos canónicos e os respetivos nomes de etiquetas aceites
export const LITURGICAL_MOMENTS: LiturgicalMoment[] = [
  { id: 'entrada', number: 1, name: 'Entrada', tags: ['entrada'] },
  { id: 'ato-penitencial', number: 2, name: 'Ato Penitencial', tags: ['ato-penitencial', 'ato penitencial', 'penitencial'] },
  { id: 'aleluia', number: 3, name: 'Aleluia', tags: ['aleluia'] },
  { id: 'ofertorio', number: 4, name: 'Ofertório', tags: ['ofertório', 'ofertorio'] },
  { id: 'santo', number: 5, name: 'Santo', tags: ['santo'] },
  { id: 'cordeiro', number: 6, name: 'Cordeiro', tags: ['cordeiro'] },
  { id: 'comunhao', number: 7, name: 'Comunhão', tags: ['comunhão', 'comunhao'] },
  { id: 'pos-comunhao', number: 8, name: 'Pós-Comunhão', tags: ['pós-comunhão', 'pos-comunhao', 'pós comunhão', 'pos comunhao'] },
  { id: 'final', number: 9, name: 'Final', tags: ['final'] },
];

export const LITURGICAL_MOMENT_NAMES = LITURGICAL_MOMENTS.map(m => m.name);

/** Momento correspondente a um `moment_name` guardado (aceita o nome ou qualquer etiqueta, sem acentos). */
export function findMomentByName(name: string | null | undefined): LiturgicalMoment | null {
  const normalized = normalizeSearchText(name);
  if (!normalized) return null;
  return (
    LITURGICAL_MOMENTS.find(
      m => normalizeSearchText(m.name) === normalized || m.tags.some(t => normalizeSearchText(t) === normalized)
    ) || null
  );
}

/** O momento guardado é o Aleluia (onde se mostra o versículo da aclamação ao Evangelho). */
export function isAleluiaMoment(name: string | null | undefined): boolean {
  return findMomentByName(name)?.id === 'aleluia';
}
