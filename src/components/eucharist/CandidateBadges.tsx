import type { MomentCandidate } from '../../lib/mass-planner';
import type { LiturgicalSeason } from '../../lib/liturgical-calendar';

const SEASON_OF: Record<LiturgicalSeason, string> = {
  advento: 'do Advento',
  natal: 'do Natal',
  quaresma: 'da Quaresma',
  pascoa: 'da Páscoa',
  comum: 'do Tempo Comum',
};

const BASE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold';

/**
 * Etiquetas que explicam se um cântico é próprio do tempo litúrgico.
 * O histórico de utilização só influencia a ordem: não se mostra (o cancioneiro é público).
 */
export function CandidateBadges({ candidate, season }: { candidate: MomentCandidate; season: LiturgicalSeason }) {
  const badges: { label: string; className: string }[] = [];

  if (candidate.seasonFit === 'match') {
    badges.push({ label: `Próprio ${SEASON_OF[season]}`, className: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300' });
  }
  if (candidate.seasonFit === 'other') {
    badges.push({
      label: `Próprio de: ${candidate.otherSeasons.join(', ')}`,
      className: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400',
    });
  }
  if (candidate.blockedReason) {
    badges.push({ label: candidate.blockedReason, className: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400' });
  }
  if (candidate.marianMatch) {
    badges.push({ label: 'Mariano', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300' });
  }
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map(b => (
        <span key={b.label} className={`${BASE} ${b.className}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
}
