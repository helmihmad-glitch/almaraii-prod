import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildSiloWorkbook, excelDate, parseSiloWorkbook } from "./siloExcel";

/** Construit un classeur à la mise en page du fichier Silo_PF d’origine. */
async function makeSourceWorkbook() {
  const workbook = new ExcelJS.Workbook();

  const production = workbook.addWorksheet("Production ");
  production.getRow(3).getCell(3).value = "📊  SYNTHÈSE — Traçabilité des Lots par Silo";
  ["Date", "Article", "N° Lot", "Qté totale (T)", "SPF1", "SPF2", "SPF3", "SPF4", "SPF5"].forEach((label, index) => {
    production.getRow(5).getCell(3 + index).value = label;
  });
  production.getRow(6).getCell(3).value = new Date("2026-09-05T00:00:00Z"); // ancrée UTC : comme un vrai numéro de série Excel (voir excelDate).
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
  shipment.getRow(7).getCell(3).value = new Date("2026-09-07T00:00:00Z"); // ancrée UTC : comme un vrai numéro de série Excel (voir excelDate).
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

// Bug signalé : une expédition du 21/09/2026 s'affichait comme le 20/09/2026
// une fois le fichier ouvert dans Excel. Cause : new Date(`${iso}T00:00:00`)
// (minuit HEURE LOCALE du serveur) tombe la veille en UTC dès que le serveur
// tourne dans un fuseau en avance sur UTC — or ExcelJS sérialise le numéro de
// série Excel à partir de l'horodatage UTC. excelDate() ancre à minuit UTC
// pour ne plus jamais dépendre du fuseau du serveur qui génère le fichier.
describe("excelDate", () => {
  it("ancre à minuit UTC, jamais heure locale du serveur qui génère le fichier", () => {
    expect(excelDate("2026-09-21").toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("le classeur exporté affiche la bonne date une fois relu, même si le serveur tourne dans un fuseau en avance sur UTC", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("t");
    const cell = worksheet.getCell("A1");
    cell.value = excelDate("2026-09-21");
    cell.numFmt = "dd/mm/yyyy";
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as unknown as ArrayBuffer);
    const reloadedCell = reloaded.getWorksheet("t")!.getCell("A1");
    // La cellule relue doit rester ancrée au 21, quel que soit le fuseau
    // (comparaison sur les champs UTC, jamais locaux — voir readDate).
    expect((reloadedCell.value as Date).getUTCDate()).toBe(21);
    expect((reloadedCell.value as Date).getUTCMonth()).toBe(8); // septembre, 0-indexé.
  });
});

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

  it("fusionne Date, Article, Qté G(T), Silo et Expédition sur les lignes d'une même expédition répartie sur plusieurs lots (même splitGroupId)", async () => {
    // Une expédition de 18 T de DG3 depuis SPF11, répartie sur trois lots
    // (voir allocateFifoShipment) : les trois lignes partagent le splitGroupId
    // de la première (voir createSiloShipmentGroup). Suivie d'une expédition
    // distincte sans rapport (splitGroupId nul : saisie seule).
    const exported = await buildSiloWorkbook(
      [],
      [
        { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "2600675-0917", quantity: "5.00", silo: "SPF11", shipmentType: "Vrac", splitGroupId: 101 },
        { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "2600676-0917", quantity: "10.00", silo: "SPF11", shipmentType: "Vrac", splitGroupId: 101 },
        { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "2600677-0917", quantity: "3.00", silo: "SPF11", shipmentType: "Vrac", splitGroupId: 101 },
        { shipmentDate: "2026-09-20", article: "CG3", lotNumber: "2600666-0914", quantity: "3.00", silo: "SPF3", shipmentType: "Sac", splitGroupId: null },
      ],
      ["DG3", "CG3"],
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Expidition Vrac-Sac")!;

    // Colonnes : C=Date, D=Article, E=N° Lot, F=Qté (T), G=Qté G(T), H=Silo, I=Expédition.
    // Date, Article, Qté G(T), Silo et Expédition fusionnés sur les 3 lignes du groupe DG3/SPF11...
    expect(sheet.getRow(7).getCell(3).value).toEqual(new Date("2026-09-20T00:00:00Z")); // excelDate ancre à minuit UTC, pas heure locale (voir la note sur excelDate).
    expect(sheet.getRow(8).getCell(3).isMerged).toBe(true);
    expect(sheet.getRow(9).getCell(3).isMerged).toBe(true);
    expect(sheet.getRow(7).getCell(4).value).toBe("DG3");
    expect(sheet.getRow(8).getCell(4).isMerged).toBe(true);
    expect(sheet.getRow(9).getCell(4).isMerged).toBe(true);
    expect(sheet.getRow(7).getCell(7).value).toBe(18); // Qté G(T) = 5 + 10 + 3, la quantité totale expédiée.
    expect(sheet.getRow(8).getCell(7).isMerged).toBe(true);
    expect(sheet.getRow(9).getCell(7).isMerged).toBe(true);
    expect(sheet.getRow(7).getCell(8).value).toBe("SPF11");
    expect(sheet.getRow(8).getCell(8).isMerged).toBe(true);
    expect(sheet.getRow(9).getCell(8).isMerged).toBe(true);
    expect(sheet.getRow(7).getCell(9).value).toBe("Vrac");
    expect(sheet.getRow(8).getCell(9).isMerged).toBe(true);
    expect(sheet.getRow(9).getCell(9).isMerged).toBe(true);
    // ... alors que N° Lot et Qté (T) restent bien sur chaque ligne, non fusionnés.
    expect([7, 8, 9].map((row) => sheet.getRow(row).getCell(5).value)).toEqual(["2600675-0917", "2600676-0917", "2600677-0917"]);
    expect([7, 8, 9].map((row) => sheet.getRow(row).getCell(6).value)).toEqual([5, 10, 3]);
    // La quatrième ligne (silo et article différents) reste seule, non fusionnée, et sa Qté G(T) vaut sa propre quantité.
    expect(sheet.getRow(10).getCell(4).value).toBe("CG3");
    expect(sheet.getRow(10).getCell(4).isMerged).toBe(false);
    expect(sheet.getRow(10).getCell(7).value).toBe(3);

    // La fusion ne fait pas perdre l'article ni le silo à la relecture : les 4 lignes restent bien 4 expéditions distinctes.
    const reparsed = await parseSiloWorkbook(exported);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.shipments).toEqual([
      { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "2600675-0917", quantity: 5, silo: "SPF11", shipmentType: "Vrac" },
      { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "2600676-0917", quantity: 10, silo: "SPF11", shipmentType: "Vrac" },
      { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "2600677-0917", quantity: 3, silo: "SPF11", shipmentType: "Vrac" },
      { shipmentDate: "2026-09-20", article: "CG3", lotNumber: "2600666-0914", quantity: 3, silo: "SPF3", shipmentType: "Sac" },
    ]);
  });

  // Bug signalé : trois expéditions saisies séparément (même lot, même date,
  // même article, même silo, même type — trois camions du même jour) ne
  // doivent jamais apparaître comme une seule expédition répartie sur
  // plusieurs lots. Seul splitGroupId (posé par createSiloShipmentGroup)
  // distingue une vraie répartition FIFO d'une coïncidence de valeurs.
  it("ne fusionne jamais des expéditions saisies séparément, même si elles partagent tout (date, article, silo, type, n° de lot)", async () => {
    const exported = await buildSiloWorkbook(
      [],
      [
        { shipmentDate: "2026-09-18", article: "CG25", lotNumber: "2600680-0918", quantity: "17.24", silo: "SPF2", shipmentType: "Vrac", splitGroupId: null },
        { shipmentDate: "2026-09-18", article: "CG25", lotNumber: "2600680-0918", quantity: "13.46", silo: "SPF2", shipmentType: "Vrac", splitGroupId: null },
        { shipmentDate: "2026-09-18", article: "CG25", lotNumber: "2600680-0918", quantity: "8.02", silo: "SPF2", shipmentType: "Vrac", splitGroupId: null },
      ],
      ["CG25"],
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Expidition Vrac-Sac")!;

    expect([7, 8, 9].some((row) => sheet.getRow(row).getCell(4).isMerged)).toBe(false);
    expect([7, 8, 9].some((row) => sheet.getRow(row).getCell(7).isMerged)).toBe(false);
    expect([7, 8, 9].some((row) => sheet.getRow(row).getCell(8).isMerged)).toBe(false);
    // Chaque ligne garde sa propre Qté G(T), égale à sa propre quantité — jamais la somme des trois.
    expect([7, 8, 9].map((row) => sheet.getRow(row).getCell(7).value)).toEqual([17.24, 13.46, 8.02]);
  });
});
