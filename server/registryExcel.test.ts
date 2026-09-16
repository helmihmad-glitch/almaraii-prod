import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildFilteredRegistryWorkbook, type FilteredRegistryRow } from "./registryExcel";

const sampleRows: FilteredRegistryRow[] = [
  { productionDate: "2026-09-02", article: "CM1", productionTons: 12.5, wasteTons: 0.4, availability: 0.91, trs: 0.62, comment: "RAS" },
  { productionDate: "2026-09-01", article: "CG3", productionTons: 8, wasteTons: 0, availability: 0.85, trs: 0.55, comment: null },
];

async function readWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.getWorksheet("Registre journalier")!;
}

describe("export Excel du registre journalier filtré (Rapports)", () => {
  it("écrit le titre, les en-têtes et les lignes de données avec les bons formats", async () => {
    const buffer = await buildFilteredRegistryWorkbook(sampleRows, { query: "CM1", dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    const sheet = await readWorkbook(buffer);

    expect(sheet.getCell(2, 2).value).toContain("REGISTRE JOURNALIER");
    const filterText = String(sheet.getCell(3, 2).value);
    expect(filterText).toContain("recherche « CM1 »");
    expect(filterText).toContain("01/09/2026");
    expect(filterText).toContain("30/09/2026");
    expect(filterText).toContain("2 lignes");

    const headerLabels = [2, 3, 4, 5, 6, 7, 8].map((col) => sheet.getCell(5, col).value);
    expect(headerLabels).toEqual(["Date", "Article", "Production (T)", "Rebuts (T)", "Disponibilité (%)", "TRS (%)", "Commentaire"]);

    const firstDataRow = sheet.getRow(6);
    expect(firstDataRow.getCell(2).value).toBeInstanceOf(Date);
    expect(firstDataRow.getCell(3).value).toBe("CM1");
    expect(firstDataRow.getCell(4).value).toBe(12.5);
    expect(firstDataRow.getCell(5).value).toBe(0.4);
    expect(firstDataRow.getCell(6).value).toBe(0.91);
    expect(firstDataRow.getCell(8).value).toBe("RAS");

    const secondDataRow = sheet.getRow(7);
    expect(secondDataRow.getCell(3).value).toBe("CG3");
    expect(secondDataRow.getCell(8).value).toBe("");
  });

  it("ajoute une ligne Total qui somme la production et les rebuts", async () => {
    const buffer = await buildFilteredRegistryWorkbook(sampleRows, {});
    const sheet = await readWorkbook(buffer);
    const totalRow = sheet.getRow(8); // 6 + 2 lignes de données.
    expect(totalRow.getCell(2).value).toBe("Total");
    expect(totalRow.getCell(4).result).toBeCloseTo(20.5);
    expect(totalRow.getCell(5).result).toBeCloseTo(0.4);
  });

  it("décrit l’absence de filtre quand aucun n’est appliqué", async () => {
    const buffer = await buildFilteredRegistryWorkbook([], {});
    const sheet = await readWorkbook(buffer);
    expect(String(sheet.getCell(3, 2).value)).toContain("Aucun filtre appliqué");
    const totalRow = sheet.getRow(6);
    expect(totalRow.getCell(2).value).toBe("Total");
    expect(totalRow.getCell(4).value).toBeNull();
  });
});
