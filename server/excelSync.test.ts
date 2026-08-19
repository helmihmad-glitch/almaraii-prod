import { describe, expect, it } from "vitest";
import { buildSeedRows } from "./excelSync";

describe("import initial du fichier Excel", () => {
  it("n’importe que des lignes datées dans leur mois et élimine les doublons exacts", () => {
    const rows = buildSeedRows();
    const signatures = rows.map((row) => `${row.productionDate}::${row.article}::${row.totalProductionHours}::${row.productionTons}`);

    expect(new Set(signatures).size).toBe(rows.length);
    expect(rows.every((row) => /^2026-(04|05|06|07|08)-\d{2}$/.test(row.productionDate))).toBe(true);
  });
});

