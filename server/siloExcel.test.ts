import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildSiloWorkbook, parseSiloWorkbook } from "./siloExcel";

/** Construit un classeur à la mise en page du fichier Silo_PF d’origine. */
async function makeSourceWorkbook() {
  const workbook = new ExcelJS.Workbook();

  const production = workbook.addWorksheet("Production ");
  production.getRow(3).getCell(3).value = "📊  SYNTHÈSE — Traçabilité des Lots par Silo";
  ["Date", "Article", "N° Lot", "Qté totale (T)", "SPF1", "SPF2", "SPF3", "SPF4", "SPF5"].forEach((label, index) => {
    production.getRow(5).getCell(3 + index).value = label;
  });
  production.getRow(6).getCell(3).value = new Date("2026-09-05T00:00:00");
  production.getRow(6).getCell(4).value = "CG3";
  production.getRow(6).getCell(5).value = "2600645-0409";
  production.getRow(6).getCell(6).value = 35;
  production.getRow(6).getCell(9).value = 25; // SPF3
  production.getRow(6).getCell(11).value = 10; // SPF5
  // Ligne sans date : poursuit la journée précédente.
  production.getRow(7).getCell(4).value = "CM1";
  production.getRow(7).getCell(7).value = 16.92; // SPF1
  // Correction négative, comme dans le classeur d’origine.
  production.getRow(8).getCell(4).value = "CG3";
  production.getRow(8).getCell(9).value = -5;
  // Lignes à ignorer : case à zéro, puis total.
  production.getRow(9).getCell(4).value = "DG3";
  production.getRow(9).getCell(10).value = 0;
  production.getRow(10).getCell(4).value = "TOTAL";
  production.getRow(10).getCell(6).value = { formula: "SUM(F6:F9)", result: 51.92 };

  const shipment = workbook.addWorksheet("Expidition Vrac-Sac");
  const labels = ["Date", "Article", "N° Lot", "Qté (T)", "Silo", "Expédition"];
  labels.forEach((label, index) => {
    shipment.getRow(5).getCell(3 + index).value = label;
    shipment.getRow(6).getCell(3 + index).value = label;
  });
  // Second bloc « Livraison VRAC » à droite : ignoré par les calculs du classeur.
  ["Date", "Article", "N° Lot", "Qté (T)", "Silo"].forEach((label, index) => {
    shipment.getRow(5).getCell(9 + index).value = label;
  });
  shipment.getRow(7).getCell(3).value = new Date("2026-09-07T00:00:00");
  shipment.getRow(7).getCell(4).value = "CG3";
  shipment.getRow(7).getCell(5).value = "2600645-0409";
  shipment.getRow(7).getCell(6).value = 4.52;
  shipment.getRow(7).getCell(7).value = "SPF3";
  shipment.getRow(7).getCell(8).value = "Vrac";
  shipment.getRow(7).getCell(10).value = "CM1"; // bloc de droite, ne doit pas être importé
  shipment.getRow(7).getCell(12).value = 99;
  shipment.getRow(7).getCell(13).value = "SPF1";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("classeur Silo_PF", () => {
  it("lit les entrées réparties par silo, dates reportées et corrections négatives comprises", async () => {
    const parsed = await parseSiloWorkbook(await makeSourceWorkbook());

    expect(parsed.errors).toEqual([]);
    expect(parsed.entries).toEqual([
      { entryDate: "2026-09-05", article: "CG3", lotNumber: "2600645-0409", totalQuantity: 35, allocations: [{ silo: "SPF3", quantity: 25 }, { silo: "SPF5", quantity: 10 }] },
      { entryDate: "2026-09-05", article: "CM1", lotNumber: undefined, totalQuantity: undefined, allocations: [{ silo: "SPF1", quantity: 16.92 }] },
      { entryDate: "2026-09-05", article: "CG3", lotNumber: undefined, totalQuantity: undefined, allocations: [{ silo: "SPF3", quantity: -5 }] },
    ]);
  });

  it("n’importe que le bloc d’expéditions qui alimente l’état des silos", async () => {
    const parsed = await parseSiloWorkbook(await makeSourceWorkbook());

    expect(parsed.shipments).toEqual([
      { shipmentDate: "2026-09-07", article: "CG3", lotNumber: "2600645-0409", quantity: 4.52, silo: "SPF3", shipmentType: "Vrac" },
    ]);
  });

  it("reconstruit un classeur relisable à l’identique", async () => {
    const parsed = await parseSiloWorkbook(await makeSourceWorkbook());
    const exported = await buildSiloWorkbook(
      parsed.entries.map((entry) => ({
        entryDate: entry.entryDate ?? null,
        article: entry.article,
        lotNumber: entry.lotNumber ?? null,
        totalQuantity: entry.totalQuantity === undefined ? null : entry.totalQuantity.toFixed(2),
        allocations: entry.allocations.map((allocation) => ({ silo: allocation.silo, quantity: allocation.quantity.toFixed(2) })),
      })),
      parsed.shipments.map((shipment) => ({
        shipmentDate: shipment.shipmentDate ?? null,
        article: shipment.article,
        lotNumber: shipment.lotNumber ?? null,
        quantity: shipment.quantity.toFixed(2),
        silo: shipment.silo,
        shipmentType: shipment.shipmentType,
      })),
      ["CM1", "CG3"],
    );

    const reparsed = await parseSiloWorkbook(exported);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.entries).toEqual(parsed.entries);
    expect(reparsed.shipments).toEqual(parsed.shipments);
  });

  it("exporte les quatre feuilles avec les formules et leurs résultats calculés", async () => {
    const parsed = await parseSiloWorkbook(await makeSourceWorkbook());
    const exported = await buildSiloWorkbook(
      parsed.entries.map((entry) => ({
        entryDate: entry.entryDate ?? null,
        article: entry.article,
        lotNumber: entry.lotNumber ?? null,
        totalQuantity: entry.totalQuantity === undefined ? null : entry.totalQuantity.toFixed(2),
        allocations: entry.allocations.map((allocation) => ({ silo: allocation.silo, quantity: allocation.quantity.toFixed(2) })),
      })),
      parsed.shipments.map((shipment) => ({
        shipmentDate: shipment.shipmentDate ?? null,
        article: shipment.article,
        lotNumber: shipment.lotNumber ?? null,
        quantity: shipment.quantity.toFixed(2),
        silo: shipment.silo,
        shipmentType: shipment.shipmentType,
      })),
      ["CM1", "CG3"],
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Production ", "Expidition Vrac-Sac", "Etat final silo", "Silo_Article"]);

    // SPF3 / CG3 : 25 produits - 5 de correction - 4,52 expédiés = 15,48
    const stateCell = workbook.getWorksheet("Etat final silo")!.getRow(11).getCell(5) as ExcelJS.Cell;
    const stateValue = stateCell.value as ExcelJS.CellFormulaValue;
    expect(stateValue.result).toBe(15.48);
    expect(stateValue.formula).toContain("SUMIF('Production '!$D$6:$D$998");
    expect(stateValue.formula).toContain("SUMIFS('Expidition Vrac-Sac'!$F$7:$F$999");

    // Silo_Article : SPF1 occupé par CM1, SPF3 par CG3.
    const occupancy = workbook.getWorksheet("Silo_Article")!;
    expect((occupancy.getRow(6).getCell(3).value as ExcelJS.CellFormulaValue).result).toBe("CM1");
    expect((occupancy.getRow(6).getCell(4).value as ExcelJS.CellFormulaValue).result).toBe(16.92);
    expect((occupancy.getRow(8).getCell(4).value as ExcelJS.CellFormulaValue).result).toBe(15.48);
    expect((occupancy.getRow(6).getCell(7).value as ExcelJS.CellFormulaValue).result).toBe(16.92);
  });
});
