import { describe, expect, it } from "vitest";
import { calculateRecord, recordInput } from "./routers";

describe("production record calculations", () => {
  it("calculates the Excel-style metrics from raw production inputs", () => {
    const result = calculateRecord({
      productionDate: "2026-07-01",
      article: "CM1",
      totalProductionHours: 12,
      plannedStopsHours: 0,
      unplannedStopsHours: 0.5,
      productionTons: 70,
      wasteTons: 0,
      standardRate: 10,
    });

    expect(result.realHours).toBe("11.50");
    expect(Number(result.availability)).toBeCloseTo(0.958333, 5);
    expect(Number(result.performance)).toBeCloseTo(0.608696, 5);
    expect(Number(result.quality)).toBe(1);
    expect(Number(result.trs)).toBeCloseTo(0.583333, 5);
  });

  it("rejects impossible waste and stop totals", () => {
    const result = recordInput.safeParse({
      productionDate: "2026-07-01", article: "CM1", totalProductionHours: 2,
      plannedStopsHours: 1.5, unplannedStopsHours: 1, productionTons: 10,
      wasteTons: 11, standardRate: 10,
    });
    expect(result.success).toBe(false);
  });
});
