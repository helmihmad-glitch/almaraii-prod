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
