import { describe, expect, it } from "vitest";
import { calculateMonthlyProductionStats } from "../client/src/lib/registryOrdering";

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
});
