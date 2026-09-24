export type DatedProductionRow = {
  date: string;
  article: string;
};

/** Trie les lignes de la plus ancienne à la plus récente. L’interface inverse ensuite cet ordre pour afficher les dernières en premier. */
export function orderProductionRows<T extends DatedProductionRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.article.localeCompare(b.article));
}

export type MonthlyProductionRow = {
  hours: number;
  plannedStops: number;
  unplannedStops: number;
  production: number;
  waste: number;
  realHours: number;
  standardRate: number;
};

export type HourlyProductionRow = MonthlyProductionRow & DatedProductionRow;

export type DailyHoursSummary = {
  date: string;
  totalHours: number;
  lostHours: number;
  activeHours: number;
  production: number;
  articles: Array<{ article: string; production: number }>;
};

/** Retourne la veille de la date fournie au format ISO local YYYY-MM-DD. */
export function getPreviousCalendarDate(referenceDate = new Date()): string {
  const yesterday = new Date(referenceDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, "0");
  const day = String(yesterday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Un mois type compte 26 jours ouvrés (tous les jours sauf le dimanche) — le repère utilisé par calculateProductionGuideProgress. */
const STANDARD_WORKING_DAYS_PER_MONTH = 26;

/**
 * Repère théorique de rythme de production pour le mois affiché (période au
 * format AAAA-MM) : la part du mois déjà écoulée en ne comptant que les jours
 * ouvrés (dimanche excepté), rapportée à un mois type de 26 jours ouvrés —
 * ex. le 24/09, 3 dimanches déjà passés (les 6, 13 et 20) donnent
 * (24 - 3) / 26. Sert à comparer visuellement « où l'on devrait en être
 * aujourd'hui » à la progression réelle du mois. Un mois déjà entièrement
 * passé compte tous ses jours ; un mois futur n'en compte aucun.
 */
export function calculateProductionGuideProgress(periodValue: string, referenceDate = new Date()): number {
  const [yearText, monthText] = periodValue.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return 0;

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const isCurrentMonth = referenceDate.getFullYear() === year && referenceDate.getMonth() === monthIndex;
  const isPastMonth = year < referenceDate.getFullYear() || (year === referenceDate.getFullYear() && monthIndex < referenceDate.getMonth());
  const elapsedDays = isCurrentMonth ? referenceDate.getDate() : isPastMonth ? daysInMonth : 0;

  let sundaysElapsed = 0;
  for (let day = 1; day <= elapsedDays; day += 1) {
    if (new Date(year, monthIndex, day).getDay() === 0) sundaysElapsed += 1;
  }
  const workingDaysElapsed = Math.max(elapsedDays - sundaysElapsed, 0);
  return workingDaysElapsed / STANDARD_WORKING_DAYS_PER_MONTH;
}

/** Additionne les heures réellement planifiées, les arrêts et les heures actives d’une période. */
export function calculateHoursSummary(rows: MonthlyProductionRow[]) {
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const lostHours = rows.reduce((sum, row) => sum + row.plannedStops + row.unplannedStops, 0);
  return { totalHours, lostHours, activeHours: Math.max(totalHours - lostHours, 0) };
}

/** Regroupe les heures et la production de chaque article par journée de production. */
export function calculateDailyHoursSummaries(rows: HourlyProductionRow[]): DailyHoursSummary[] {
  const summaries = new Map<string, DailyHoursSummary>();
  rows.forEach((row) => {
    const current = summaries.get(row.date) ?? { date: row.date, totalHours: 0, lostHours: 0, activeHours: 0, production: 0, articles: [] };
    const lostHours = row.plannedStops + row.unplannedStops;
    current.totalHours += row.hours;
    current.lostHours += lostHours;
    current.activeHours += Math.max(row.hours - lostHours, 0);
    current.production += row.production;
    const article = current.articles.find((item) => item.article === row.article);
    if (article) article.production += row.production;
    else current.articles.push({ article: row.article, production: row.production });
    summaries.set(row.date, current);
  });
  return Array.from(summaries.values())
    .map((summary) => ({ ...summary, articles: [...summary.articles].sort((a, b) => a.article.localeCompare(b.article)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Récupère l’agrégat de production d’une date précise, notamment pour la carte J-1. */
export function getDailyHoursSummary(rows: HourlyProductionRow[], date: string): DailyHoursSummary | undefined {
  return calculateDailyHoursSummaries(rows).find((summary) => summary.date === date);
}

/** Calcule les indicateurs affichés dans le panneau « Objectif mensuel » à partir des lignes visibles du registre. */
export function calculateMonthlyProductionStats(rows: MonthlyProductionRow[]) {
  const hours = rows.reduce((sum, row) => sum + row.hours, 0);
  const plannedStops = rows.reduce((sum, row) => sum + row.plannedStops, 0);
  const unplannedStops = rows.reduce((sum, row) => sum + row.unplannedStops, 0);
  const production = rows.reduce((sum, row) => sum + row.production, 0);
  const waste = rows.reduce((sum, row) => sum + row.waste, 0);
  const realHours = Math.max(hours - plannedStops - unplannedStops, 0);
  const standardCapacity = rows.reduce((sum, row) => sum + row.realHours * row.standardRate, 0);
  const availability = hours > 0 ? Math.max((hours - unplannedStops) / hours, 0) : 0;
  const performance = standardCapacity > 0 ? production / standardCapacity : 0;
  const quality = production > 0 ? Math.max((production - waste) / production, 0) : 1;
  return { production, waste, availability, performance, quality, trs: availability * performance * quality, realHours };
}
