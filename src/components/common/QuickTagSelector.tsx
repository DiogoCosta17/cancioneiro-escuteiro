import React, { useMemo } from 'react';

export const THEMATIC_TAGS = [
  'Escutistas',
  'Marianas',
  '1ª Secção',
  '2ª Secção',
  '3ª Secção',
  '4ª Secção',
  'Oração',
  'Reflexão',
  'Outro'
];

export const EUCHARIST_TAGS = [
  'Entrada',
  'Ato-Penitencial',
  'Aleluia',
  'Aclamação',
  'Ofertório',
  'Santo',
  'Cordeiro',
  'Comunhão',
  'Pós-Comunhão',
  'Final'
];

// Etiquetas usadas pela proposta de missa (src/lib/mass-planner.ts) para saber o tempo próprio de cada cântico
export const LITURGICAL_SEASON_TAGS = ['Advento', 'Natal', 'Quaresma', 'Páscoa'];

interface QuickTagSelectorProps {
  tagsStr: string;
  onChange: (newTagsStr: string) => void;
  label?: string;
  className?: string;
  placeholder?: string;
}

export function QuickTagSelector({
  tagsStr,
  onChange,
  label = 'Etiquetas (separadas por vírgula)',
  className = '',
  placeholder = 'ex: Entrada, Escutistas, Marianas, 2ª Secção...'
}: QuickTagSelectorProps) {
  const currentTags = useMemo(() => {
    return tagsStr.split(',').map(t => t.trim()).filter(Boolean);
  }, [tagsStr]);

  const isTagSelected = (tag: string) => {
    return currentTags.some(t => t.toLowerCase() === tag.toLowerCase());
  };

  const toggleTag = (tag: string) => {
    const exists = isTagSelected(tag);
    let next: string[];
    if (exists) {
      next = currentTags.filter(t => t.toLowerCase() !== tag.toLowerCase());
    } else {
      next = [...currentTags, tag];
    }
    onChange(next.join(', '));
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <input
        type="text"
        value={tagsStr}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border-gray-300 dark:border-zinc-700 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-2 border bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
      />

      <div className="mt-2 space-y-1.5">
        {/* Sugestões Rápidas de Temáticas */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <span className="font-semibold text-gray-600 dark:text-gray-400">Temáticas:</span>
          {THEMATIC_TAGS.map(tag => {
            const active = isTagSelected(tag);
            return (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white border border-emerald-700 shadow-xs'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                }`}
                title={active ? 'Clique para remover esta etiqueta' : 'Clique para adicionar esta etiqueta'}
              >
                {active ? `✓ ${tag}` : `+ ${tag}`}
              </button>
            );
          })}
        </div>

        {/* Sugestões Rápidas de Tempos Litúrgicos */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <span className="font-semibold text-gray-600 dark:text-gray-400">Tempo litúrgico:</span>
          {LITURGICAL_SEASON_TAGS.map(tag => {
            const active = isTagSelected(tag);
            return (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-purple-600 text-white border border-purple-700 shadow-xs'
                    : 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/60'
                }`}
                title={active ? 'Clique para remover esta etiqueta' : 'Clique para adicionar esta etiqueta'}
              >
                {active ? `✓ ${tag}` : `+ ${tag}`}
              </button>
            );
          })}
        </div>

        {/* Sugestões Rápidas de Momentos da Eucaristia */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <span className="font-semibold text-gray-600 dark:text-gray-400">Eucaristia:</span>
          {EUCHARIST_TAGS.map(tag => {
            const active = isTagSelected(tag);
            return (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-600 text-white border border-amber-700 shadow-xs'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                }`}
                title={active ? 'Clique para remover esta etiqueta' : 'Clique para adicionar esta etiqueta'}
              >
                {active ? `✓ ${tag}` : `+ ${tag}`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
