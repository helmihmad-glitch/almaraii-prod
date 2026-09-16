// Export Excel du registre journalier filtré (page Rapports) : même filtrage
// (recherche + période) que l'ancien export CSV, mais un classeur Excel mis en
// forme comme les autres rapports (titre, en-tête coloré, bordures, total).
import ExcelJS from "exceljs";
import { columnLetter, styleHeaderRow, writeTitle } from "./siloExcel";

export type FilteredRegistryRow = {
  productionDate: string; // AAAA-MM-JJ
  article: string;
  productionTons: number;
  wasteTons: number;
  availability: number; // 0..1
  trs: number; // 0..1
  comment: string | null;
};

export type RegistryExportFilters = { query?: string; dateFrom?: string; dateTo?: string };

const FIRST_COL = 2; // B
const LAST_COL = FIRST_COL + 6; // H : Date, Article, Production, Rebuts, Disponibilité, TRS, Commentaire.
const TITLE_ROW = 2;
const FILTER_ROW = 3;
const HEADER_ROW = 5;
const FIRST_DATA_ROW = 6;
const COLUMN_WIDTHS = [13, 16, 15, 13, 16, 11, 42];
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFDADFD5" } },
  left: { style: "thin", color: { argb: "FFDADFD5" } },
  bottom: { style: "thin", color: { argb: "FFDADFD5" } },
  right: { style: "thin", color: { argb: "FFDADFD5" } },
};

function describeFilters(filters: RegistryExportFilters): string {
  const parts: string[] = [];
  if (filters.query) parts.push(`recherche « ${filters.query} »`);
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).toLocaleDateString("fr-FR") : "…";
    const to = filters.dateTo ? new Date(`${filters.dateTo}T00:00:00`).toLocaleDateString("fr-FR") : "…";
    parts.push(`du ${from} au ${to}`);
  }
  return parts.length ? `Filtres : ${parts.join(" · ")}` : "Aucun filtre appliqué (registre complet)";
}

/** Classeur Excel du registre filtré, avec titre, ligne de filtres/export et un total (T) en bas de tableau. */
export async function buildFilteredRegistryWorkbook(rows: FilteredRegistryRow[], filters: RegistryExportFilters): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Almaraïi Production Pulse";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Registre journalier", { views: [{ state: "frozen", ySplit: HEADER_ROW }] });
  COLUMN_WIDTHS.forEach((width, index) => { worksheet.getColumn(FIRST_COL + index).width = width; });

  writeTitle(worksheet, TITLE_ROW, FIRST_COL, LAST_COL, "REGISTRE JOURNALIER — EXTRAIT FILTRÉ");

  const filterRow = worksheet.getRow(FILTER_ROW);
  const filterCell = filterRow.getCell(FIRST_COL);
  filterCell.value = `${describeFilters(filters)} — exporté le ${new Date().toLocaleDateString("fr-FR")} (${rows.length} ligne${rows.length > 1 ? "s" : ""})`;
  worksheet.mergeCells(FILTER_ROW, FIRST_COL, FILTER_ROW, LAST_COL);
  filterCell.font = { italic: true, color: { argb: "FF4D7B40" } };
  filterCell.alignment = { horizontal: "left" };

  const headerRow = worksheet.getRow(HEADER_ROW);
  ["Date", "Article", "Production (T)", "Rebuts (T)", "Disponibilité (%)", "TRS (%)", "Commentaire"].forEach((label, index) => {
    headerRow.getCell(FIRST_COL + index).value = label;
  });
  styleHeaderRow(headerRow, FIRST_COL, LAST_COL);

  rows.forEach((row, index) => {
    const excelRow = worksheet.getRow(FIRST_DATA_ROW + index);
    const dateCell = excelRow.getCell(FIRST_COL);
    dateCell.value = new Date(`${row.productionDate}T00:00:00`);
    dateCell.numFmt = "dd/mm/yyyy";
    excelRow.getCell(FIRST_COL + 1).value = row.article;
    const productionCell = excelRow.getCell(FIRST_COL + 2);
    productionCell.value = row.productionTons;
    productionCell.numFmt = "0.00";
    const wasteCell = excelRow.getCell(FIRST_COL + 3);
    wasteCell.value = row.wasteTons;
    wasteCell.numFmt = "0.00";
    const availabilityCell = excelRow.getCell(FIRST_COL + 4);
    availabilityCell.value = row.availability;
    availabilityCell.numFmt = "0%";
    const trsCell = excelRow.getCell(FIRST_COL + 5);
    trsCell.value = row.trs;
    trsCell.numFmt = "0%";
    const commentCell = excelRow.getCell(FIRST_COL + 6);
    commentCell.value = row.comment || "";
    commentCell.alignment = { wrapText: true, vertical: "middle" };
    for (let col = FIRST_COL; col <= LAST_COL; col += 1) excelRow.getCell(col).border = THIN_BORDER;
  });

  const totalRowNumber = FIRST_DATA_ROW + rows.length;
  const totalRow = worksheet.getRow(totalRowNumber);
  const totalLabelCell = totalRow.getCell(FIRST_COL);
  totalLabelCell.value = "Total";
  const totalBorder: Partial<ExcelJS.Borders> = { top: { style: "thin", color: { argb: "FF4D7B40" } } };
  if (rows.length > 0) {
    const lastDataRow = totalRowNumber - 1;
    const productionRange = `${columnLetter(FIRST_COL + 2)}${FIRST_DATA_ROW}:${columnLetter(FIRST_COL + 2)}${lastDataRow}`;
    const wasteRange = `${columnLetter(FIRST_COL + 3)}${FIRST_DATA_ROW}:${columnLetter(FIRST_COL + 3)}${lastDataRow}`;
    const productionCell = totalRow.getCell(FIRST_COL + 2);
    productionCell.value = { formula: `SUM(${productionRange})`, result: rows.reduce((sum, row) => sum + row.productionTons, 0) } as ExcelJS.CellFormulaValue;
    productionCell.numFmt = "0.00";
    const wasteCell = totalRow.getCell(FIRST_COL + 3);
    wasteCell.value = { formula: `SUM(${wasteRange})`, result: rows.reduce((sum, row) => sum + row.wasteTons, 0) } as ExcelJS.CellFormulaValue;
    wasteCell.numFmt = "0.00";
  }
  for (let col = FIRST_COL; col <= LAST_COL; col += 1) {
    const cell = totalRow.getCell(col);
    cell.font = { bold: true };
    cell.border = totalBorder;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
