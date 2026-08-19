import { describe, expect, it } from "vitest";
import { orderProductionRows } from "../client/src/lib/registryOrdering";

describe("ordre du registre journalier", () => {
  it("classe une nouvelle saisie par date avant de l’afficher de la plus récente à la plus ancienne", () => {
    const sorted = orderProductionRows([
      { date: "2026-08-20", article: "DG3" },
      { date: "2026-08-02", article: "CM1" },
      { date: "2026-08-20", article: "CG25" },
    ]);

    expect(sorted.map((row) => `${row.date}-${row.article}`)).toEqual([
      "2026-08-02-CM1",
      "2026-08-20-CG25",
      "2026-08-20-DG3",
    ]);
    expect(sorted.slice().reverse()[0]).toEqual({ date: "2026-08-20", article: "DG3" });
  });
});
