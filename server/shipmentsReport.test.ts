import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { buildShipmentsReportWorkbook, type ShipmentReportRow } from "./shipmentsReport";

function adminContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: true } as any;
}

async function readWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.getWorksheet("Expéditions")!;
}

describe("export Excel des expéditions filtrées par type et période (Rapports)", () => {
  it("écrit le titre, la ligne de filtres, les en-têtes et les lignes de données", async () => {
    const rows: ShipmentReportRow[] = [
      { shipmentDate: "2026-09-05", article: "CM1", lotNumber: "2600645-0409", quantity: 8, silo: "SPF1", shipmentType: "Vrac", splitGroupId: null },
    ];
    const buffer = await buildShipmentsReportWorkbook(rows, { shipmentType: "Vrac", dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    const sheet = await readWorkbook(buffer);

    expect(sheet.getCell(2, 2).value).toContain("EXPÉDITIONS");
    const filterText = String(sheet.getCell(3, 2).value);
    expect(filterText).toContain("type « Vrac »");
    expect(filterText).toContain("01/09/2026");
    expect(filterText).toContain("30/09/2026");
    expect(filterText).toContain("1 ligne");

    const headerLabels = [2, 3, 4, 5, 6, 7, 8].map((col) => sheet.getCell(5, col).value);
    expect(headerLabels).toEqual(["Date", "Article", "N° Lot", "Qté (T)", "Silo", "Qté G(T)", "Expédition"]);

    const dataRow = sheet.getRow(6);
    expect(dataRow.getCell(2).value).toBeInstanceOf(Date);
    expect(dataRow.getCell(3).value).toBe("CM1");
    expect(dataRow.getCell(4).value).toBe("2600645-0409");
    expect(dataRow.getCell(5).value).toBe(8);
    expect(dataRow.getCell(6).value).toBe("SPF1");
    expect(dataRow.getCell(7).value).toBe(8); // Qté G(T) = Qté (T) : expédition non répartie.
    expect(dataRow.getCell(8).value).toBe("Vrac");
  });

  it("fusionne Date, Article, Qté G(T), Silo et Expédition pour une expédition répartie sur plusieurs lots (même splitGroupId)", async () => {
    const rows: ShipmentReportRow[] = [
      { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "2600675-0917", quantity: 5, silo: "SPF11", shipmentType: "Vrac", splitGroupId: 101 },
      { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "2600676-0917", quantity: 10, silo: "SPF11", shipmentType: "Vrac", splitGroupId: 101 },
      { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "2600677-0917", quantity: 3, silo: "SPF11", shipmentType: "Vrac", splitGroupId: 101 },
    ];
    const buffer = await buildShipmentsReportWorkbook(rows, {});
    const sheet = await readWorkbook(buffer);

    expect(sheet.getRow(6).getCell(7).value).toBe(18); // Qté G(T) = 5 + 10 + 3.
    expect(sheet.getRow(7).getCell(7).isMerged).toBe(true);
    expect(sheet.getRow(8).getCell(7).isMerged).toBe(true);
    // N° Lot et Qté (T) restent bien propres à chaque ligne.
    expect([6, 7, 8].map((row) => sheet.getRow(row).getCell(4).value)).toEqual(["2600675-0917", "2600676-0917", "2600677-0917"]);
    expect([6, 7, 8].map((row) => sheet.getRow(row).getCell(5).value)).toEqual([5, 10, 3]);
  });

  it("garde un silo par ligne (non fusionné) quand une même expédition groupée touche plusieurs silos (répartition manuelle)", async () => {
    const rows: ShipmentReportRow[] = [
      { shipmentDate: "2026-09-24", article: "CG3", lotNumber: "20006649-0905", quantity: 10, silo: "SPF3", shipmentType: "Sac", splitGroupId: 201 },
      { shipmentDate: "2026-09-24", article: "CG3", lotNumber: "26006648-09004", quantity: 10, silo: "SPF5", shipmentType: "Sac", splitGroupId: 201 },
    ];
    const buffer = await buildShipmentsReportWorkbook(rows, {});
    const sheet = await readWorkbook(buffer);

    // Qté G(T) reste fusionnée (même total pour tout le groupe)...
    expect(sheet.getRow(6).getCell(7).value).toBe(20);
    expect(sheet.getRow(7).getCell(7).isMerged).toBe(true);
    // ... mais Silo, lui, reste une valeur par ligne : fusionner n'afficherait que le premier silo touché.
    expect(sheet.getRow(6).getCell(6).isMerged).toBe(false);
    expect(sheet.getRow(7).getCell(6).isMerged).toBe(false);
    expect([6, 7].map((row) => sheet.getRow(row).getCell(6).value)).toEqual(["SPF3", "SPF5"]);
  });

  it("ne fusionne jamais des expéditions saisies séparément, même si elles partagent tout par ailleurs (splitGroupId nul)", async () => {
    const rows: ShipmentReportRow[] = [
      { shipmentDate: "2026-09-18", article: "CG25", lotNumber: "2600680-0918", quantity: 17.24, silo: "SPF2", shipmentType: "Vrac", splitGroupId: null },
      { shipmentDate: "2026-09-18", article: "CG25", lotNumber: "2600680-0918", quantity: 13.46, silo: "SPF2", shipmentType: "Vrac", splitGroupId: null },
    ];
    const buffer = await buildShipmentsReportWorkbook(rows, {});
    const sheet = await readWorkbook(buffer);

    expect(sheet.getRow(6).getCell(7).isMerged).toBe(false);
    expect(sheet.getRow(7).getCell(7).isMerged).toBe(false);
    expect(sheet.getRow(6).getCell(7).value).toBe(17.24);
    expect(sheet.getRow(7).getCell(7).value).toBe(13.46);
  });

  it("ajoute une ligne Total qui somme la vraie quantité (Qté T), pas la quantité groupée", async () => {
    const rows: ShipmentReportRow[] = [
      { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "A", quantity: 5, silo: "SPF11", shipmentType: "Vrac", splitGroupId: 1 },
      { shipmentDate: "2026-09-20", article: "DG3", lotNumber: "B", quantity: 10, silo: "SPF11", shipmentType: "Vrac", splitGroupId: 1 },
      { shipmentDate: "2026-09-19", article: "CG3", lotNumber: "C", quantity: 3, silo: "SPF3", shipmentType: "Sac", splitGroupId: null },
    ];
    const buffer = await buildShipmentsReportWorkbook(rows, {});
    const sheet = await readWorkbook(buffer);
    const totalRow = sheet.getRow(9); // 6 + 3 lignes de données.
    expect(totalRow.getCell(2).value).toBe("Total");
    expect(totalRow.getCell(5).result).toBeCloseTo(18);
  });

  it("décrit l’absence de filtre quand aucun n’est appliqué", async () => {
    const buffer = await buildShipmentsReportWorkbook([], {});
    const sheet = await readWorkbook(buffer);
    expect(String(sheet.getCell(3, 2).value)).toContain("Aucun filtre appliqué");
    const totalRow = sheet.getRow(6);
    expect(totalRow.getCell(2).value).toBe("Total");
    expect(totalRow.getCell(5).value).toBeNull();
  });
});

describe("silo.exportShipmentsReport (filtre par type et période côté serveur)", () => {
  it("ne garde que les expéditions du type et de la période choisis", async () => {
    const caller = appRouter.createCaller(adminContext());
    await caller.silo.createEntry({ article: "REPORT-TEST-A", entryDate: "2026-09-01", lotNumber: "LOT-A", allocations: [{ silo: "SPF6", quantity: 30 }] });
    await caller.silo.createShipment({ shipmentDate: "2026-09-10", article: "REPORT-TEST-A", silo: "SPF6", lotNumber: "LOT-A", quantity: 5, shipmentType: "Vrac" });
    await caller.silo.createShipment({ shipmentDate: "2026-09-10", article: "REPORT-TEST-A", silo: "SPF6", lotNumber: "LOT-A", quantity: 4, shipmentType: "Sac" });
    await caller.silo.createShipment({ shipmentDate: "2026-08-01", article: "REPORT-TEST-A", silo: "SPF6", lotNumber: "LOT-A", quantity: 3, shipmentType: "Vrac" }); // hors période.

    const { fileBase64 } = await caller.silo.exportShipmentsReport({ shipmentType: "Vrac", dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(fileBase64, "base64") as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Expéditions")!;

    // D'autres tests du même run peuvent avoir créé d'autres expéditions Vrac
    // de septembre 2026 (le filtre ne porte pas sur l'article) : on ne
    // retrouve donc que les lignes de CET article, jamais par position de ligne.
    const ownRows: number[] = [];
    for (let row = 6; sheet.getRow(row).getCell(3).value; row += 1) {
      if (sheet.getRow(row).getCell(3).value === "REPORT-TEST-A") ownRows.push(row);
    }
    expect(ownRows).toHaveLength(1); // le Sac et l'expédition d'août sont bien exclus.
    const [dataRow] = ownRows;
    expect(sheet.getRow(dataRow).getCell(5).value).toBe(5);
    expect(sheet.getRow(dataRow).getCell(8).value).toBe("Vrac");
  });
});
