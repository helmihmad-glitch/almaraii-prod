import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseImportedWorkbook } from "./excelImport";

async function buildWorkbook(values: unknown[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Registre journalier");
  worksheet.addRow(["DATE", "ARTICLE", "TEMPS TOTAL PROD. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL. (h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD", "COMMENTAIRE"]);
  worksheet.addRow(values);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("parseImportedWorkbook", () => {
  it("lit les colonnes du registre, convertit la date et prépare une ligne importable", async () => {
    const buffer = await buildWorkbook([new Date(2026, 7, 24), "CM1", 12, 1, 0.5, 90, 2, 15, "Import validé"]);

    const parsed = await parseImportedWorkbook(buffer);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([expect.objectContaining({
      productionDate: "2026-08-24",
      article: "CM1",
      totalProductionHours: 12,
      plannedStopsHours: 1,
      unplannedStopsHours: 0.5,
      productionTons: 90,
      wasteTons: 2,
      standardRate: 15,
      comment: "Import validé",
    })]);
  });

  it("signale une ligne dont les arrêts excèdent le temps total", async () => {
    const buffer = await buildWorkbook(["24/08/2026", "CM1", 4, 3, 2, 30, 0, 15, ""]);

    const parsed = await parseImportedWorkbook(buffer);

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0]).toContain("ne respectent pas les règles du registre");
  });
});
