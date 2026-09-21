// Export Excel des expéditions filtrées par type (Vrac/Sac) et par période
// (page Rapports) : mêmes filtres que la page Ajouter une expédition, dans un
// classeur mis en forme comme les autres rapports (titre, ligne de filtres,
// en-tête coloré, bordures, total) — voir registryExcel.ts pour le même
// principe côté registre de production.
import ExcelJS from "exceljs";
import { columnLetter, excelDate, styleHeaderRow, writeTitle } from "./siloExcel";

export type ShipmentReportRow = {
  shipmentDate: string | null;
  article: string;
  lotNumber: string | null;
  quantity: number;
  silo: string;
  shipmentType: string;
  /** Voir createSiloShipmentGroup côté serveur : relie les lignes créées ensemble par une répartition FIFO automatique. */
  splitGroupId?: number | null;
};

export type ShipmentReportFilters = { shipmentType?: string; dateFrom?: string; dateTo?: string };

const FIRST_COL = 2; // B
const LAST_COL = FIRST_COL + 6; // H : Date, Article, N° Lot, Qté (T), Qté G(T), Silo, Expédition.
const TITLE_ROW = 2;
const FILTER_ROW = 3;
const HEADER_ROW = 5;
const FIRST_DATA_ROW = 6;
const COLUMN_WIDTHS = [13, 11, 17, 11, 11, 9, 12];
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFDADFD5" } },
  left: { style: "thin", color: { argb: "FFDADFD5" } },
  bottom: { style: "thin", color: { argb: "FFDADFD5" } },
  right: { style: "thin", color: { argb: "FFDADFD5" } },
};

function describeFilters(filters: ShipmentReportFilters): string {
  const parts: string[] = [];
  if (filters.shipmentType) parts.push(`type « ${filters.shipmentType} »`);
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).toLocaleDateString("fr-FR") : "…";
    const to = filters.dateTo ? new Date(`${filters.dateTo}T00:00:00`).toLocaleDateString("fr-FR") : "…";
    parts.push(`du ${from} au ${to}`);
  }
  return parts.length ? `Filtres : ${parts.join(" · ")}` : "Aucun filtre appliqué (toutes les expéditions)";
}

/** Même règle qu'à l'écran et dans le classeur Silo_PF (voir buildSiloWorkbook) : un splitGroupId partagé identifie une expédition répartie sur plusieurs lots. */
const shipmentGroupKey = (line: ShipmentReportRow, index: number) => (line.splitGroupId ? `group:${line.splitGroupId}` : `single:${index}`);

/** Classeur Excel des expéditions filtrées par type et période, avec titre, ligne de filtres et un total (T) en bas de tableau. */
export async function buildShipmentsReportWorkbook(rows: ShipmentReportRow[], filters: ShipmentReportFilters): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Almaraïi Production Pulse";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Expéditions", { views: [{ state: "frozen", ySplit: HEADER_ROW }] });
  COLUMN_WIDTHS.forEach((width, index) => { worksheet.getColumn(FIRST_COL + index).width = width; });

  writeTitle(worksheet, TITLE_ROW, FIRST_COL, LAST_COL, "🚚  EXPÉDITIONS — Rapport filtré");

  const filterRow = worksheet.getRow(FILTER_ROW);
  const filterCell = filterRow.getCell(FIRST_COL);
  filterCell.value = `${describeFilters(filters)} — exporté le ${new Date().toLocaleDateString("fr-FR")} (${rows.length} ligne${rows.length > 1 ? "s" : ""})`;
  worksheet.mergeCells(FILTER_ROW, FIRST_COL, FILTER_ROW, LAST_COL);
  filterCell.font = { italic: true, color: { argb: "FF4D7B40" } };
  filterCell.alignment = { horizontal: "left" };

  const headerRow = worksheet.getRow(HEADER_ROW);
  ["Date", "Article", "N° Lot", "Qté (T)", "Qté G(T)", "Silo", "Expédition"].forEach((label, index) => {
    headerRow.getCell(FIRST_COL + index).value = label;
  });
  styleHeaderRow(headerRow, FIRST_COL, LAST_COL);

  rows.forEach((row, index) => {
    const excelRow = worksheet.getRow(FIRST_DATA_ROW + index);
    if (row.lotNumber) excelRow.getCell(FIRST_COL + 2).value = row.lotNumber;
    const quantityCell = excelRow.getCell(FIRST_COL + 3);
    quantityCell.value = row.quantity;
    quantityCell.numFmt = "0.00";
    for (let col = FIRST_COL; col <= LAST_COL; col += 1) excelRow.getCell(col).border = THIN_BORDER;
  });

  // Date, Article, Qté G(T), Silo et Expédition fusionnés sur les lignes d'une
  // même expédition répartie sur plusieurs lots (voir la note sur splitGroupId
  // ci-dessus) ; N° Lot et Qté (T), propres à chaque lot, restent par ligne.
  const groupColumns = [FIRST_COL, FIRST_COL + 1, FIRST_COL + 4, FIRST_COL + 5, FIRST_COL + 6];
  let groupStart = 0;
  while (groupStart < rows.length) {
    let groupEnd = groupStart;
    while (groupEnd + 1 < rows.length && shipmentGroupKey(rows[groupEnd + 1], groupEnd + 1) === shipmentGroupKey(rows[groupStart], groupStart)) groupEnd += 1;
    const startRow = FIRST_DATA_ROW + groupStart;
    const endRow = FIRST_DATA_ROW + groupEnd;
    const group = rows.slice(groupStart, groupEnd + 1);
    if (endRow > startRow) groupColumns.forEach((col) => worksheet.mergeCells(startRow, col, endRow, col));

    const dateCell = worksheet.getCell(startRow, FIRST_COL);
    if (group[0].shipmentDate) {
      dateCell.value = excelDate(group[0].shipmentDate);
      dateCell.numFmt = "dd/mm/yyyy";
    }
    dateCell.alignment = { vertical: "middle", horizontal: "center" };
    const articleCell = worksheet.getCell(startRow, FIRST_COL + 1);
    articleCell.value = group[0].article;
    articleCell.alignment = { vertical: "middle", horizontal: "center" };
    const totalCell = worksheet.getCell(startRow, FIRST_COL + 4);
    totalCell.value = group.reduce((sum, line) => sum + line.quantity, 0);
    totalCell.numFmt = "0.00";
    totalCell.alignment = { vertical: "middle", horizontal: "center" };
    const siloCell = worksheet.getCell(startRow, FIRST_COL + 5);
    siloCell.value = group[0].silo;
    siloCell.alignment = { vertical: "middle", horizontal: "center" };
    const typeCell = worksheet.getCell(startRow, FIRST_COL + 6);
    typeCell.value = group[0].shipmentType;
    typeCell.alignment = { vertical: "middle", horizontal: "center" };
    groupStart = groupEnd + 1;
  }

  const totalRowNumber = FIRST_DATA_ROW + rows.length;
  const totalRow = worksheet.getRow(totalRowNumber);
  const totalLabelCell = totalRow.getCell(FIRST_COL);
  totalLabelCell.value = "Total";
  worksheet.mergeCells(totalRowNumber, FIRST_COL, totalRowNumber, FIRST_COL + 2);
  const totalBorder: Partial<ExcelJS.Borders> = { top: { style: "thin", color: { argb: "FF4D7B40" } } };
  if (rows.length > 0) {
    const lastDataRow = totalRowNumber - 1;
    // La somme porte sur Qté (T), jamais fusionnée : le vrai tonnage de chaque
    // lot y figure toujours, quel que soit le regroupement visuel au-dessus.
    const quantityRange = `${columnLetter(FIRST_COL + 3)}${FIRST_DATA_ROW}:${columnLetter(FIRST_COL + 3)}${lastDataRow}`;
    const quantityCell = totalRow.getCell(FIRST_COL + 3);
    quantityCell.value = { formula: `SUM(${quantityRange})`, result: rows.reduce((sum, row) => sum + row.quantity, 0) } as ExcelJS.CellFormulaValue;
    quantityCell.numFmt = "0.00";
  }
  for (let col = FIRST_COL; col <= LAST_COL; col += 1) {
    const cell = totalRow.getCell(col);
    cell.font = { bold: true };
    cell.border = totalBorder;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
