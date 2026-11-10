import { ExternalLink } from 'lucide-react';
import { liturgiaPtUrl } from '../../lib/daily-readings';

/**
 * Abre a liturgia do dia no liturgia.pt (Secretariado Nacional de Liturgia), onde está o versículo oficial
 * do Aleluia. A app não o obtém automaticamente: a pesquisa na web do Gemini não está incluída no plano
 * gratuito da conta Google (decisão do utilizador a 04-11-2026: copiar o versículo à mão).
 */
export function OfficialVerseLink({ dateISO }: { dateISO: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  return (
    <a
      href={liturgiaPtUrl(dateISO)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-green-200 dark:border-green-800/60 bg-green-50 dark:bg-green-950/40 text-[#2d5016] dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50"
    >
      Ver o versículo oficial no liturgia.pt <ExternalLink className="w-3.5 h-3.5" />
    </a>
  );
}
