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

  it("reconnaît le temps total libellé Temps de production (heures)", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Import");
    worksheet.addRow(["Date", "Produit", "Temps de production (heures)", "Arrêts plan. (h)", "Arrêts non pl. (h)", "Production (T)", "Rebuts (T)", "Cadence std"]);
    worksheet.addRow(["24/08/2026", "CM1", 9, 1, 0, 75, 0, 15]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({ totalProductionHours: 9, article: "CM1" }));
  });

  it("accepte le mapping Date, article, prod(T), rebuts(t) et h.relles en déduisant le temps total", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Import");
    worksheet.addRow(["Date", "article", "h.relles", "arrêts plan.(h)", "arrêts non pl.(h)", "prod(T)", "rebuts(t)", "cadence std"]);
    worksheet.addRow(["24/08/2026", "CG3", 8.5, 1, 0.5, 100, 1, 15]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      productionDate: "2026-08-24",
      article: "CG3",
      totalProductionHours: 10,
      productionTons: 100,
      wasteTons: 1,
    }));
  });

  it("conserve les lignes valides et isole les lignes incohérentes dans le diagnostic", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Import");
    worksheet.addRow(["Date", "article", "Temps total prod. (h)", "arrêts plan.(h)", "arrêts non pl.(h)", "prod(T)", "rebuts(t)", "cadence std"]);
    worksheet.addRow(["24/08/2026", "CM1", 10, 1, 0, 80, 0, 15]);
    worksheet.addRow(["25/08/2026", "CM1", 4, 3, 2, 30, 0, 15]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({ productionDate: "2026-08-24" }));
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toContain("ligne 3");
  });

  it("importe les feuilles mensuelles au format du Dashboard Production avec dates françaises et arrêts vides", async () => {
    const workbook = new ExcelJS.Workbook();
    for (const [sheetName, day, article] of [["Avril 2026", "1-avr.", "CG3"], ["Aout2026", "3-août", "CM1"]] as const) {
      const worksheet = workbook.addWorksheet(sheetName);
      worksheet.addRow([`TABLEAU DE BORD DE PERFORMANCE (${sheetName})`]);
      worksheet.addRow([]);
      worksheet.addRow(["REGISTRE DE PRODUCTION JOURNALIER"]);
      worksheet.addRow(["DATE", "ARTICLE", "TEMPS OUV. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL.(h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD", "H. RÉELLES"]);
      worksheet.addRow([day, article, 4, "", 0.5, 40, "", 15, 3.5]);
    }

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ productionDate: "2026-04-01", article: "CG3", plannedStopsHours: 0, wasteTons: 0 }),
      expect.objectContaining({ productionDate: "2026-08-03", article: "CM1", plannedStopsHours: 0, wasteTons: 0 }),
    ]));
  });

  it("ignore sans erreur les cellules fusionnées vides autour de la ligne d’en-têtes", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Juillet 2026");
    worksheet.mergeCells("A1:B1");
    worksheet.getCell("A1").value = "Tableau de bord";
    worksheet.addRow([]);
    worksheet.addRow(["DATE", "ARTICLE", "TEMPS OUV. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL.(h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD", "H. RÉELLES"]);
    worksheet.addRow(["1-juil.", "CM1", 10, 0, 1, 70, 0, 10, 9]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({ productionDate: "2026-07-01" }));
  });

  it("préserve plusieurs lignes source portant la même date comme des entrées distinctes", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Aout2026");
    worksheet.addRow(["DATE", "ARTICLE", "TEMPS OUV. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL.(h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD", "H. RÉELLES"]);
    worksheet.addRow(["5-août", "DG3", 6, 0, 0.5, 50, 0, 15, 5.5]);
    worksheet.addRow(["5-août", "CG3", 7, 0, 1, 60, 0, 15, 6]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    const augustFifth = parsed.rows.filter((row) => row.productionDate === "2026-08-05");

    expect(parsed.errors).toEqual([]);
    expect(augustFifth).toHaveLength(2);
    expect(augustFifth.map((row) => row.article)).toEqual(["DG3", "CG3"]);
  });
});
