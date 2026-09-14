// Lecture et écriture du classeur Silo_PF.
//
// Le fichier exporté reprend la structure d’origine — quatre feuilles, mêmes
// en-têtes, mêmes formules — afin de rester utilisable tel quel dans Excel.
// Les formules sont écrites avec leur résultat calculé par l’application, si
// bien que le fichier affiche les bonnes valeurs même avant recalcul.

import ExcelJS from "exceljs";
import { SHIPMENT_TYPES, SILOS } from "../shared/silo";
import { computeArticleStock, computeSiloMatrix, computeSiloOccupancy, type SiloAllocationInput, type SiloShipmentInput } from "./siloStock";

export type ParsedSiloEntry = { entryDate?: string; article: string; lotNumber?: string; totalQuantity?: number; allocations: { silo: string; quantity: number }[] };
export type ParsedSiloShipment = { shipmentDate?: string; article: string; lotNumber?: string; quantity: number; silo: string; shipmentType: string };
export type ParsedSiloWorkbook = { entries: ParsedSiloEntry[]; shipments: ParsedSiloShipment[]; errors: string[] };

const PRODUCTION_SHEET = "Production ";
const SHIPMENT_SHEET = "Expidition Vrac-Sac";
const STATE_SHEET = "Etat final silo";
const OCCUPANCY_SHEET = "Silo_Article";
/** Lignes de données, alignées sur le classeur d’origine pour que les formules exportées pointent au bon endroit. */
const PRODUCTION_FIRST_ROW = 6;
const PRODUCTION_LAST_ROW = 998;
const SHIPMENT_FIRST_ROW = 7;
const SHIPMENT_LAST_ROW = 999;
const STATE_HEADER_ROW = 8;
const STATE_FIRST_ROW = 9;
const OCCUPANCY_FIRST_ROW = 6;
/** Colonnes du classeur : C=3 Date … G=7 SPF1 … R=18 SPF12. */
const PRODUCTION_DATE_COL = 3;
const PRODUCTION_SILO_FIRST_COL = 7;
const STATE_SILO_COL = 3;
const STATE_ARTICLE_FIRST_COL = 4;

function columnLetter(index: number) {
  let letter = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    current = Math.floor((current - remainder - 1) / 26);
  }
  return letter;
}

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function readText(cell: ExcelJS.Cell | undefined) {
  if (!cell) return "";
  try {
    return cell.text?.trim() ?? "";
  } catch {
    const value = cell.value;
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  }
}

function readNumber(cell: ExcelJS.Cell | undefined): number | undefined {
  if (!cell) return undefined;
  const value = cell.value;
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "result" in value && typeof value.result === "number") return value.result;
  const text = readText(cell).replace(/\s/g, "").replace(",", ".");
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readDate(cell: ExcelJS.Cell | undefined): string | undefined {
  if (!cell) return undefined;
  const value = cell.value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const text = readText(cell);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const french = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (french) return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`;
  return undefined;
}

type HeaderMatch = { rowNumber: number; columns: Map<string, number> };

/** Repère la ligne d’en-tête d’une feuille et l’indice de chaque colonne reconnue. */
function findHeaderRow(worksheet: ExcelJS.Worksheet, isMatch: (headers: Map<string, number>) => boolean): HeaderMatch | undefined {
  for (let rowNumber = 1; rowNumber <= Math.min(40, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = new Map<string, number>();
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = normalizeHeader(readText(cell));
      // Première occurrence seulement : le classeur répète certains en-têtes
      // dans un second bloc à droite, qui n’entre pas dans les calculs.
      if (header && !columns.has(header)) columns.set(header, colNumber);
    });
    if (isMatch(columns)) return { rowNumber, columns };
  }
  return undefined;
}

function findColumn(columns: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const found = columns.get(alias);
    if (found !== undefined) return found;
  }
  return undefined;
}

const DATE_ALIASES = ["DATE"];
const ARTICLE_ALIASES = ["ARTICLE", "ARTICLES", "PRODUIT"];
const LOT_ALIASES = ["NLOT", "NOLOT", "LOT", "NUMEROLOT"];
const QUANTITY_ALIASES = ["QTET", "QTE", "QUANTITET", "QUANTITE", "QTETOTALET", "QTETOTALE"];
const SILO_ALIASES = ["SILO"];
const SHIPMENT_TYPE_ALIASES = ["EXPEDITION", "TYPE", "TYPEEXPEDITION"];
/** Lignes d’en-tête répétées et lignes de totaux du classeur, à ne pas importer. */
const IGNORED_ROW_LABELS = ["ARTICLE", "TOTAL", "TOTAUX", "TOTALGENERAL"];

/**
 * Lit un classeur Silo_PF : entrées de production réparties par silo et
 * expéditions. Seul le bloc d’expéditions de gauche est repris, car c’est le
 * seul qui alimente l’état des silos dans le classeur d’origine.
 */
export async function parseSiloWorkbook(buffer: Buffer): Promise<ParsedSiloWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const entries: ParsedSiloEntry[] = [];
  const shipments: ParsedSiloShipment[] = [];
  const errors: string[] = [];

  const productionSheet = workbook.worksheets.find((worksheet) =>
    findHeaderRow(worksheet, (columns) => findColumn(columns, ARTICLE_ALIASES) !== undefined && Array.from(columns.keys()).filter((header) => /^SPF\d+$/.test(header)).length >= 2));
  const shipmentSheet = workbook.worksheets.find((worksheet) =>
    findHeaderRow(worksheet, (columns) =>
      findColumn(columns, ARTICLE_ALIASES) !== undefined
      && findColumn(columns, SILO_ALIASES) !== undefined
      && findColumn(columns, QUANTITY_ALIASES) !== undefined
      && Array.from(columns.keys()).every((header) => !/^SPF\d+$/.test(header))));

  if (productionSheet) {
    const header = findHeaderRow(productionSheet, (columns) => findColumn(columns, ARTICLE_ALIASES) !== undefined && Array.from(columns.keys()).filter((key) => /^SPF\d+$/.test(key)).length >= 2)!;
    const articleCol = findColumn(header.columns, ARTICLE_ALIASES)!;
    const dateCol = findColumn(header.columns, DATE_ALIASES);
    const lotCol = findColumn(header.columns, LOT_ALIASES);
    const totalCol = findColumn(header.columns, QUANTITY_ALIASES);
    const siloColumns: { silo: string; column: number }[] = [];
    SILOS.forEach((silo) => {
      const column = header.columns.get(normalizeHeader(silo));
      if (column !== undefined) siloColumns.push({ silo, column });
    });

    let lastDate: string | undefined;
    for (let rowNumber = header.rowNumber + 1; rowNumber <= productionSheet.rowCount; rowNumber += 1) {
      const row = productionSheet.getRow(rowNumber);
      const article = readText(row.getCell(articleCol));
      if (!article || IGNORED_ROW_LABELS.includes(normalizeHeader(article))) continue;

      // Une ligne sans date poursuit la journée précédente, comme à la lecture du classeur.
      const rowDate = dateCol ? readDate(row.getCell(dateCol)) : undefined;
      if (rowDate) lastDate = rowDate;

      const allocations: { silo: string; quantity: number }[] = [];
      siloColumns.forEach(({ silo, column }) => {
        const quantity = readNumber(row.getCell(column));
        if (quantity !== undefined && quantity !== 0) allocations.push({ silo, quantity });
      });
      // Une ligne dont toutes les cases de silo sont vides ou à zéro n’apporte
      // rien au stock : elle est ignorée sans être signalée comme rejetée.
      if (allocations.length === 0) continue;

      entries.push({
        entryDate: rowDate ?? lastDate,
        article,
        lotNumber: lotCol ? readText(row.getCell(lotCol)) || undefined : undefined,
        totalQuantity: totalCol ? readNumber(row.getCell(totalCol)) : undefined,
        allocations,
      });
    }
  } else {
    errors.push("Feuille des entrées de production introuvable : une ligne d’en-tête avec « Article » et les colonnes SPF est attendue.");
  }

  if (shipmentSheet) {
    const header = findHeaderRow(shipmentSheet, (columns) =>
      findColumn(columns, ARTICLE_ALIASES) !== undefined
      && findColumn(columns, SILO_ALIASES) !== undefined
      && findColumn(columns, QUANTITY_ALIASES) !== undefined
      && Array.from(columns.keys()).every((key) => !/^SPF\d+$/.test(key)))!;
    const articleCol = findColumn(header.columns, ARTICLE_ALIASES)!;
    const siloCol = findColumn(header.columns, SILO_ALIASES)!;
    const quantityCol = findColumn(header.columns, QUANTITY_ALIASES)!;
    const dateCol = findColumn(header.columns, DATE_ALIASES);
    const lotCol = findColumn(header.columns, LOT_ALIASES);
    const typeCol = findColumn(header.columns, SHIPMENT_TYPE_ALIASES);

    let lastDate: string | undefined;
    for (let rowNumber = header.rowNumber + 1; rowNumber <= shipmentSheet.rowCount; rowNumber += 1) {
      const row = shipmentSheet.getRow(rowNumber);
      const article = readText(row.getCell(articleCol));
      const silo = readText(row.getCell(siloCol)).toUpperCase();
      if (!article || IGNORED_ROW_LABELS.includes(normalizeHeader(article))) continue;
      // Ligne entièrement vide sous le tableau : rien à signaler.
      if (!silo && readNumber(row.getCell(quantityCol)) === undefined) continue;

      const rowDate = dateCol ? readDate(row.getCell(dateCol)) : undefined;
      if (rowDate) lastDate = rowDate;

      const quantity = readNumber(row.getCell(quantityCol));
      if (quantity === undefined) {
        errors.push(`Feuille ${shipmentSheet.name}, ligne ${rowNumber} : quantité expédiée illisible.`);
        continue;
      }
      if (!SILOS.includes(silo as (typeof SILOS)[number])) {
        errors.push(`Feuille ${shipmentSheet.name}, ligne ${rowNumber} : silo « ${silo || "vide"} » inconnu.`);
        continue;
      }

      const rawType = typeCol ? readText(row.getCell(typeCol)) : "";
      const shipmentType = SHIPMENT_TYPES.find((type) => normalizeHeader(type) === normalizeHeader(rawType)) ?? SHIPMENT_TYPES[0];

      shipments.push({
        shipmentDate: rowDate ?? lastDate,
        article,
        lotNumber: lotCol ? readText(row.getCell(lotCol)) || undefined : undefined,
        quantity,
        silo,
        shipmentType,
      });
    }
  } else {
    errors.push("Feuille des expéditions introuvable : une ligne d’en-tête avec « Article », « Qté » et « Silo » est attendue.");
  }

  return { entries, shipments, errors };
}

type ExportEntry = { entryDate: string | null; article: string; lotNumber: string | null; totalQuantity: string | null; allocations: { silo: string; quantity: string }[] };
type ExportShipment = { shipmentDate: string | null; article: string; lotNumber: string | null; quantity: string; silo: string; shipmentType: string };

const TITLE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF132B35" } };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4826" } };

function styleHeaderRow(row: ExcelJS.Row, firstCol: number, lastCol: number) {
  for (let col = firstCol; col <= lastCol; col += 1) {
    const cell = row.getCell(col);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
  row.height = 24;
}

function writeTitle(worksheet: ExcelJS.Worksheet, rowNumber: number, firstCol: number, lastCol: number, title: string) {
  const row = worksheet.getRow(rowNumber);
  row.getCell(firstCol).value = title;
  worksheet.mergeCells(rowNumber, firstCol, rowNumber, lastCol);
  const cell = row.getCell(firstCol);
  cell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  cell.fill = TITLE_FILL;
  cell.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 26;
}

/**
 * Reconstruit le classeur Silo_PF à partir des données de l’application :
 * les deux feuilles de saisie, puis les deux feuilles calculées qui reprennent
 * les formules d’origine (avec leur résultat déjà renseigné).
 */
export async function buildSiloWorkbook(entries: ExportEntry[], shipments: ExportShipment[], articles: readonly string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Almaraïi Production Pulse";
  workbook.created = new Date();
  workbook.modified = new Date();

  const exportedArticles = articles.length > 0 ? [...articles] : ["—"];
  const siloLastCol = PRODUCTION_SILO_FIRST_COL + SILOS.length - 1;
  const stateLastArticleCol = STATE_ARTICLE_FIRST_COL + exportedArticles.length - 1;
  const stateLastRow = STATE_FIRST_ROW + SILOS.length - 1;
  const occupancyLastRow = OCCUPANCY_FIRST_ROW + SILOS.length - 1;

  // --- 1. Entrées de production ---
  const production = workbook.addWorksheet(PRODUCTION_SHEET, { views: [{ state: "frozen", ySplit: 5 }] });
  writeTitle(production, 3, PRODUCTION_DATE_COL, siloLastCol, "📊  SYNTHÈSE — Traçabilité des Lots par Silo");
  const productionHeader = production.getRow(5);
  ["Date", "Article", "N° Lot", "Qté totale (T)", ...SILOS].forEach((label, index) => {
    productionHeader.getCell(PRODUCTION_DATE_COL + index).value = label;
  });
  styleHeaderRow(productionHeader, PRODUCTION_DATE_COL, siloLastCol);
  production.getColumn(PRODUCTION_DATE_COL).width = 13;
  production.getColumn(PRODUCTION_DATE_COL + 1).width = 11;
  production.getColumn(PRODUCTION_DATE_COL + 2).width = 17;
  production.getColumn(PRODUCTION_DATE_COL + 3).width = 14;
  SILOS.forEach((_, index) => { production.getColumn(PRODUCTION_SILO_FIRST_COL + index).width = 9; });

  entries.forEach((entry, index) => {
    const row = production.getRow(PRODUCTION_FIRST_ROW + index);
    if (entry.entryDate) {
      row.getCell(PRODUCTION_DATE_COL).value = new Date(`${entry.entryDate}T00:00:00`);
      row.getCell(PRODUCTION_DATE_COL).numFmt = "dd/mm/yyyy";
    }
    row.getCell(PRODUCTION_DATE_COL + 1).value = entry.article;
    if (entry.lotNumber) row.getCell(PRODUCTION_DATE_COL + 2).value = entry.lotNumber;
    if (entry.totalQuantity !== null) {
      row.getCell(PRODUCTION_DATE_COL + 3).value = Number(entry.totalQuantity);
      row.getCell(PRODUCTION_DATE_COL + 3).numFmt = "0.00";
    }
    entry.allocations.forEach((allocation) => {
      const siloIndex = SILOS.indexOf(allocation.silo as (typeof SILOS)[number]);
      if (siloIndex === -1) return;
      const cell = row.getCell(PRODUCTION_SILO_FIRST_COL + siloIndex);
      cell.value = Number(allocation.quantity);
      cell.numFmt = "0.00";
    });
  });

  // --- 2. Expéditions ---
  const shipment = workbook.addWorksheet(SHIPMENT_SHEET, { views: [{ state: "frozen", ySplit: 6 }] });
  const shipmentLastCol = PRODUCTION_DATE_COL + 5;
  writeTitle(shipment, 2, PRODUCTION_DATE_COL, shipmentLastCol, "  EXPÉDITIONS VRAC / SAC");
  const shipmentLabels = ["Date", "Article", "N° Lot", "Qté (T)", "Silo", "Expédition"];
  [5, 6].forEach((rowNumber) => {
    const row = shipment.getRow(rowNumber);
    shipmentLabels.forEach((label, index) => { row.getCell(PRODUCTION_DATE_COL + index).value = label; });
    styleHeaderRow(row, PRODUCTION_DATE_COL, shipmentLastCol);
  });
  shipment.getColumn(PRODUCTION_DATE_COL).width = 13;
  shipment.getColumn(PRODUCTION_DATE_COL + 1).width = 11;
  shipment.getColumn(PRODUCTION_DATE_COL + 2).width = 17;
  shipment.getColumn(PRODUCTION_DATE_COL + 3).width = 11;
  shipment.getColumn(PRODUCTION_DATE_COL + 4).width = 9;
  shipment.getColumn(PRODUCTION_DATE_COL + 5).width = 12;

  shipments.forEach((line, index) => {
    const row = shipment.getRow(SHIPMENT_FIRST_ROW + index);
    if (line.shipmentDate) {
      row.getCell(PRODUCTION_DATE_COL).value = new Date(`${line.shipmentDate}T00:00:00`);
      row.getCell(PRODUCTION_DATE_COL).numFmt = "dd/mm/yyyy";
    }
    row.getCell(PRODUCTION_DATE_COL + 1).value = line.article;
    if (line.lotNumber) row.getCell(PRODUCTION_DATE_COL + 2).value = line.lotNumber;
    row.getCell(PRODUCTION_DATE_COL + 3).value = Number(line.quantity);
    row.getCell(PRODUCTION_DATE_COL + 3).numFmt = "0.00";
    row.getCell(PRODUCTION_DATE_COL + 4).value = line.silo;
    row.getCell(PRODUCTION_DATE_COL + 5).value = line.shipmentType;
  });

  // --- Résultats calculés, utilisés comme valeurs mises en cache des formules ---
  const allocationInputs: SiloAllocationInput[] = entries.flatMap((entry) =>
    entry.allocations.map((allocation) => ({ article: entry.article, silo: allocation.silo, quantity: Number(allocation.quantity) })));
  const shipmentInputs: SiloShipmentInput[] = shipments.map((line) => ({ article: line.article, silo: line.silo, quantity: Number(line.quantity) }));
  const matrix = computeSiloMatrix(allocationInputs, shipmentInputs, SILOS, exportedArticles);
  const occupancy = computeSiloOccupancy(matrix, SILOS, exportedArticles);
  const articleStock = computeArticleStock(occupancy, exportedArticles);

  // --- 3. État final des silos (matrice silo × article) ---
  const state = workbook.addWorksheet(STATE_SHEET);
  writeTitle(state, 6, STATE_SILO_COL, stateLastArticleCol, "ÉTAT FINAL DES SILOS SPF");
  const stateHeader = state.getRow(STATE_HEADER_ROW);
  stateHeader.getCell(STATE_SILO_COL).value = "Silo";
  exportedArticles.forEach((article, index) => { stateHeader.getCell(STATE_ARTICLE_FIRST_COL + index).value = article; });
  styleHeaderRow(stateHeader, STATE_SILO_COL, stateLastArticleCol);
  state.getColumn(STATE_SILO_COL).width = 11;
  exportedArticles.forEach((_, index) => { state.getColumn(STATE_ARTICLE_FIRST_COL + index).width = 12; });

  const productionArticleRange = `'${PRODUCTION_SHEET}'!$${columnLetter(PRODUCTION_DATE_COL + 1)}$${PRODUCTION_FIRST_ROW}:$${columnLetter(PRODUCTION_DATE_COL + 1)}$${PRODUCTION_LAST_ROW}`;
  const shipmentQuantityRange = `'${SHIPMENT_SHEET}'!$${columnLetter(PRODUCTION_DATE_COL + 3)}$${SHIPMENT_FIRST_ROW}:$${columnLetter(PRODUCTION_DATE_COL + 3)}$${SHIPMENT_LAST_ROW}`;
  const shipmentArticleRange = `'${SHIPMENT_SHEET}'!$${columnLetter(PRODUCTION_DATE_COL + 1)}$${SHIPMENT_FIRST_ROW}:$${columnLetter(PRODUCTION_DATE_COL + 1)}$${SHIPMENT_LAST_ROW}`;
  const shipmentSiloRange = `'${SHIPMENT_SHEET}'!$${columnLetter(PRODUCTION_DATE_COL + 4)}$${SHIPMENT_FIRST_ROW}:$${columnLetter(PRODUCTION_DATE_COL + 4)}$${SHIPMENT_LAST_ROW}`;

  SILOS.forEach((silo, siloIndex) => {
    const rowNumber = STATE_FIRST_ROW + siloIndex;
    const row = state.getRow(rowNumber);
    row.getCell(STATE_SILO_COL).value = silo;
    row.getCell(STATE_SILO_COL).font = { bold: true };

    exportedArticles.forEach((article, articleIndex) => {
      const articleColLetter = columnLetter(STATE_ARTICLE_FIRST_COL + articleIndex);
      const siloColLetter = columnLetter(PRODUCTION_SILO_FIRST_COL + siloIndex);
      const productionSiloRange = `'${PRODUCTION_SHEET}'!$${siloColLetter}$${PRODUCTION_FIRST_ROW}:$${siloColLetter}$${PRODUCTION_LAST_ROW}`;
      const balance = `SUMIF(${productionArticleRange},${articleColLetter}$${STATE_HEADER_ROW},${productionSiloRange})-SUMIFS(${shipmentQuantityRange},${shipmentArticleRange},${articleColLetter}$${STATE_HEADER_ROW},${shipmentSiloRange},$${columnLetter(STATE_SILO_COL)}${rowNumber})`;
      const value = matrix[silo]?.[article] ?? null;
      const cell = row.getCell(STATE_ARTICLE_FIRST_COL + articleIndex);
      cell.value = { formula: `IF((${balance})<=0,"",${balance})`, result: value === null ? "" : value } as ExcelJS.CellFormulaValue;
      cell.numFmt = "0.00";
    });
  });

  // --- 4. Occupation des silos et stock par article ---
  const occupancySheet = workbook.addWorksheet(OCCUPANCY_SHEET);
  writeTitle(occupancySheet, 3, 2, 4, "ÉTAT FINAL DES SILOS PF");
  writeTitle(occupancySheet, 3, 6, 7, "Stock _Article");
  const occupancyHeader = occupancySheet.getRow(5);
  ["Silo", "Article", "Qté"].forEach((label, index) => { occupancyHeader.getCell(2 + index).value = label; });
  styleHeaderRow(occupancyHeader, 2, 4);
  occupancySheet.getColumn(2).width = 11;
  occupancySheet.getColumn(3).width = 12;
  occupancySheet.getColumn(4).width = 12;
  occupancySheet.getColumn(6).width = 12;
  occupancySheet.getColumn(7).width = 13;

  const stateArticleHeaderRange = `'${STATE_SHEET}'!$${columnLetter(STATE_ARTICLE_FIRST_COL)}$${STATE_HEADER_ROW}:$${columnLetter(stateLastArticleCol)}$${STATE_HEADER_ROW}`;
  const stateBodyRange = `'${STATE_SHEET}'!$${columnLetter(STATE_ARTICLE_FIRST_COL)}$${STATE_FIRST_ROW}:$${columnLetter(stateLastArticleCol)}$${stateLastRow}`;
  const stateSiloRange = `'${STATE_SHEET}'!$${columnLetter(STATE_SILO_COL)}$${STATE_FIRST_ROW}:$${columnLetter(STATE_SILO_COL)}$${stateLastRow}`;

  SILOS.forEach((silo, index) => {
    const rowNumber = OCCUPANCY_FIRST_ROW + index;
    const row = occupancySheet.getRow(rowNumber);
    const stateRowNumber = STATE_FIRST_ROW + index;
    const stateRowRange = `'${STATE_SHEET}'!${columnLetter(STATE_ARTICLE_FIRST_COL)}${stateRowNumber}:${columnLetter(stateLastArticleCol)}${stateRowNumber}`;
    const occupancyRow = occupancy[index];

    row.getCell(2).value = silo;
    row.getCell(2).font = { bold: true };
    row.getCell(3).value = {
      formula: `IFERROR(INDEX(${stateArticleHeaderRange},1,MATCH(1,INDEX((${stateRowRange}<>"")*1,0),0)),"")`,
      result: occupancyRow?.article ?? "",
    } as ExcelJS.CellFormulaValue;
    row.getCell(4).value = {
      formula: `IF(C${rowNumber}="","",INDEX(${stateBodyRange},MATCH(B${rowNumber},${stateSiloRange},0),MATCH(C${rowNumber},${stateArticleHeaderRange},0)))`,
      result: occupancyRow?.quantity ?? "",
    } as ExcelJS.CellFormulaValue;
    row.getCell(4).numFmt = "0.00";
  });

  exportedArticles.forEach((article, index) => {
    const rowNumber = OCCUPANCY_FIRST_ROW + index;
    const row = occupancySheet.getRow(rowNumber);
    row.getCell(6).value = article;
    row.getCell(7).value = {
      formula: `SUMIF($C$${OCCUPANCY_FIRST_ROW}:$C$${occupancyLastRow},F${rowNumber},$D$${OCCUPANCY_FIRST_ROW}:$D$${occupancyLastRow})`,
      result: articleStock.find((stock) => stock.article === article)?.quantity ?? 0,
    } as ExcelJS.CellFormulaValue;
    row.getCell(7).numFmt = "0.00";
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
