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

  it("reconnaît des en-têtes placés après un titre et libellés Date de production et Produit", async () => {
    const workbook = new ExcelJS.Workbook();
    const coverSheet = workbook.addWorksheet("Couverture");
    coverSheet.addRow(["Rapport de production"]);
    const worksheet = workbook.addWorksheet("Saisie août");
    for (let index = 0; index < 12; index += 1) worksheet.addRow([`Information ${index + 1}`]);
    worksheet.addRow(["Date de production", "Produit", "Temps total prod. (h)", "Arrêts plan. (h)", "Arrêts non pl. (h)", "Production (T)", "Rebuts (T)", "Cadence std"]);
    worksheet.addRow(["24/08/2026", "DG3", 10, 1, 0, 90, 0, 15]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([expect.objectContaining({ productionDate: "2026-08-24", article: "DG3" })]);
  });
});
