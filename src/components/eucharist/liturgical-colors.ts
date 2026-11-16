import type { LiturgicalColor } from '../../lib/liturgical-calendar';

// Cor litúrgica: barra lateral e ponto da legenda
export const COLOR_CLASSES: Record<LiturgicalColor, { bar: string; dot: string }> = {
  roxo: { bar: 'bg-purple-700', dot: 'bg-purple-700' },
  rosa: { bar: 'bg-pink-400', dot: 'bg-pink-400' },
  branco: { bar: 'bg-amber-200', dot: 'bg-white border border-gray-300 dark:border-zinc-500' },
  vermelho: { bar: 'bg-red-600', dot: 'bg-red-600' },
  verde: { bar: 'bg-[#2d5016]', dot: 'bg-[#2d5016] dark:bg-green-600' },
};

