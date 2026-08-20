import { describe, expect, it } from "vitest";
import { calculateDailyHoursSummaries, calculateHoursSummary, calculateMonthlyProductionStats } from "../client/src/lib/registryOrdering";

const row = (production: number) => ({ hours: 2, plannedStops: 0, unplannedStops: 0, production, waste: 0, realHours: 2, standardRate: 5 });

describe("calculateMonthlyProductionStats", () => {
  it("recalcule la production mensuelle après ajout, modification et suppression", () => {
    const initialRows = [row(10), row(20)];
    expect(calculateMonthlyProductionStats(initialRows).production).toBe(30);

    const afterCreate = [...initialRows, row(5)];
    expect(calculateMonthlyProductionStats(afterCreate).production).toBe(35);

    const afterUpdate = [...initialRows, row(8)];
    expect(calculateMonthlyProductionStats(afterUpdate).production).toBe(38);

    expect(calculateMonthlyProductionStats(initialRows).production).toBe(30);
  });

  it("calcule les heures perdues et actives par jour et pour le mois", () => {
    const rows = [
      { date: "2026-08-30", article: "CM1", hours: 12, plannedStops: 1, unplannedStops: 0.5, production: 70, waste: 0, realHours: 10.5, standardRate: 10 },
      { date: "2026-08-30", article: "CG3", hours: 8, plannedStops: 0.5, unplannedStops: 0, production: 50, waste: 0, realHours: 7.5, standardRate: 10 },
      { date: "2026-08-31", article: "CM1", hours: 10, plannedStops: 0, unplannedStops: 2, production: 60, waste: 0, realHours: 8, standardRate: 10 },
    ];
    expect(calculateHoursSummary(rows)).toEqual({ totalHours: 30, lostHours: 4, activeHours: 26 });

    expect(calculateDailyHoursSummaries(rows)).toEqual([
      { date: "2026-08-30", totalHours: 20, lostHours: 2, activeHours: 18, production: 120, articles: [{ article: "CG3", production: 50 }, { article: "CM1", production: 70 }] },
      { date: "2026-08-31", totalHours: 10, lostHours: 2, activeHours: 8, production: 60, articles: [{ article: "CM1", production: 60 }] },
    ]);
  });
});
