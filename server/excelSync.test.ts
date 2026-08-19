import { describe, expect, it } from "vitest";
import { buildSeedRows } from "./excelSync";

describe("import initial du fichier Excel", () => {
  it("rattache chaque ligne à la période de sa feuille et élimine les doublons exacts", () => {
    const rows = buildSeedRows();
    const signatures = rows.map((row) => `${row.productionDate}::${row.article}::${row.totalProductionHours}::${row.productionTons}`);

    expect(new Set(signatures).size).toBe(rows.length);
    expect(rows.every((row) => /^2026-(04|05|06|07|08)-\d{2}$/.test(row.productionDate))).toBe(true);
    expect(rows.some((row) => row.productionDate.startsWith("2026-07"))).toBe(true);
    expect(rows.some((row) => row.productionDate.startsWith("2026-08"))).toBe(true);
  });
});
