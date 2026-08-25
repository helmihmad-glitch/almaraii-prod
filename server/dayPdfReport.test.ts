import { describe, expect, it } from "vitest";
import { getMonthlyRowsThroughExportDay } from "../client/src/lib/dayPdfReport";

describe("getMonthlyRowsThroughExportDay", () => {
  it("conserve uniquement les lignes du mois jusqu’à la journée exportée incluse", () => {
    const rows = [
      { productionDate: "2026-07-31", article: "CM1" },
      { productionDate: "2026-08-01", article: "CG3" },
      { productionDate: "2026-08-24", article: "CM1" },
      { productionDate: "2026-08-24", article: "DG3" },
      { productionDate: "2026-08-25", article: "CG25" },
      { productionDate: "2026-09-01", article: "CM1" },
    ];

    expect(getMonthlyRowsThroughExportDay(rows, "2026-08-24")).toEqual([
      { productionDate: "2026-08-01", article: "CG3" },
      { productionDate: "2026-08-24", article: "CM1" },
      { productionDate: "2026-08-24", article: "DG3" },
    ]);
  });
});
