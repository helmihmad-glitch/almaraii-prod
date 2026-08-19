import { describe, expect, it } from "vitest";
import { orderProductionRows } from "./registryOrdering";

describe("orderProductionRows", () => {
  it("classe une nouvelle saisie selon sa date, puis son article", () => {
    const rows = orderProductionRows([
      { date: "2026-08-20", article: "DG3" },
      { date: "2026-08-02", article: "CM1" },
      { date: "2026-08-20", article: "CG25" },
    ]);

    expect(rows.map((row) => `${row.date}-${row.article}`)).toEqual([
      "2026-08-02-CM1",
      "2026-08-20-CG25",
      "2026-08-20-DG3",
    ]);
    expect(rows.slice().reverse()[0]).toEqual({ date: "2026-08-20", article: "DG3" });
  });
});
