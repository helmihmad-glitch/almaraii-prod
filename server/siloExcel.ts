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

/**
 * Convertit une date AAAA-MM-JJ en Date à écrire dans une cellule Excel
 * typée date (avec un numFmt), ancrée à minuit UTC plutôt qu'à minuit heure
 * locale du serveur. Sans cela, `new Date(\`${iso}T00:00:00\`)` (minuit
 * local) tombe la veille en UTC dès que le serveur tourne dans un fuseau en
 * avance sur UTC (ex. Europe) — ExcelJS sérialise le nombre de série Excel à
 * partir de l'horodatage UTC, donc Excel affiche alors le jour précédent
 * (J-1), quel que soit le fuseau de la personne qui ouvre ensuite le
 * fichier. N'utiliser QUE pour une valeur de cellule réellement typée date
 * (numFmt appliqué) — un simple texte formaté (toLocaleDateString, un
 * Intl.DateTimeFormat) n'est, lui, pas concerné.
 */
export function excelDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function columnLetter(index: number) {
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
  // Getters UTC, pas locaux : une cellule Excel typée date n'a pas de fuseau
  // (juste un numéro de série), et ExcelJS la restitue systématiquement comme
  // minuit UTC de ce jour-là — lire ses champs locaux la ferait retomber la
  // veille dès que le serveur tourne dans un fuseau en retard sur UTC (voir
  // excelDate, qui écrit ces cellules en miroir de cette lecture).
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
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
export async function parseSiloWorkbook(buffer: Buffer, knownSilos: readonly string[] = SILOS): Promise<ParsedSiloWorkbook> {
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
    knownSilos.forEach((silo) => {
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
    // Une expédition répartie sur plusieurs lots (voir allocateFifoShipment
    // côté serveur) fusionne à l'export les cellules Article et Silo sur ses
    // lignes consécutives, comme le fait déjà le classeur d'origine pour la
    // date : une case vide reprend donc la dernière valeur connue plutôt que
    // d'être traitée comme une ligne incomplète.
    let lastArticle: string | undefined;
    let lastSilo: string | undefined;
    let lastType: string | undefined;
    for (let rowNumber = header.rowNumber + 1; rowNumber <= shipmentSheet.rowCount; rowNumber += 1) {
      const row = shipmentSheet.getRow(rowNumber);
      const rawArticle = readText(row.getCell(articleCol));
      const rawSilo = readText(row.getCell(siloCol)).toUpperCase();
      const quantity = readNumber(row.getCell(quantityCol));
      if (rawArticle && IGNORED_ROW_LABELS.includes(normalizeHeader(rawArticle))) continue;
      // Ligne entièrement vide sous le tableau (rien à reprendre du haut non plus) : rien à signaler.
      if (!rawArticle && !rawSilo && quantity === undefined) continue;

      const article = rawArticle || lastArticle;
      const silo = rawSilo || lastSilo;
      if (!article) continue;
      if (rawArticle) lastArticle = rawArticle;
      if (rawSilo) lastSilo = rawSilo;

      const rowDate = dateCol ? readDate(row.getCell(dateCol)) : undefined;
      if (rowDate) lastDate = rowDate;

      if (quantity === undefined) {
        errors.push(`Feuille ${shipmentSheet.name}, ligne ${rowNumber} : quantité expédiée illisible.`);
        continue;
      }
      if (!silo || !knownSilos.includes(silo)) {
        errors.push(`Feuille ${shipmentSheet.name}, ligne ${rowNumber} : silo « ${silo || "vide"} » inconnu.`);
        continue;
      }

      const rawType = typeCol ? readText(row.getCell(typeCol)) : "";
      if (rawType) lastType = rawType;
      const shipmentType = SHIPMENT_TYPES.find((type) => normalizeHeader(type) === normalizeHeader(rawType || lastType || "")) ?? SHIPMENT_TYPES[0];

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
type ExportShipment = { shipmentDate: string | null; article: string; lotNumber: string | null; quantity: string; silo: string; shipmentType: string; splitGroupId?: number | null };

export const TITLE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF132B35" } };
export const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4826" } };

export function styleHeaderRow(row: ExcelJS.Row, firstCol: number, lastCol: number) {
  for (let col = firstCol; col <= lastCol; col += 1) {
    const cell = row.getCell(col);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
  row.height = 24;
}

export function writeTitle(worksheet: ExcelJS.Worksheet, rowNumber: number, firstCol: number, lastCol: number, title: string) {
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
export async function buildSiloWorkbook(entries: ExportEntry[], shipments: ExportShipment[], articles: readonly string[], silos: readonly string[] = SILOS): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Almaraïi Production Pulse";
  workbook.created = new Date();
  workbook.modified = new Date();

  const exportedArticles = articles.length > 0 ? [...articles] : ["—"];
  const siloLastCol = PRODUCTION_SILO_FIRST_COL + silos.length - 1;
  const stateLastArticleCol = STATE_ARTICLE_FIRST_COL + exportedArticles.length - 1;
  const stateLastRow = STATE_FIRST_ROW + silos.length - 1;
  const occupancyLastRow = OCCUPANCY_FIRST_ROW + silos.length - 1;

  // --- 1. Entrées de production ---
  const production = workbook.addWorksheet(PRODUCTION_SHEET, { views: [{ state: "frozen", ySplit: 5 }] });
  writeTitle(production, 3, PRODUCTION_DATE_COL, siloLastCol, "📊  SYNTHÈSE — Traçabilité des Lots par Silo");
  const productionHeader = production.getRow(5);
  ["Date", "Article", "N° Lot", "Qté totale (T)", ...silos].forEach((label, index) => {
    productionHeader.getCell(PRODUCTION_DATE_COL + index).value = label;
  });
  styleHeaderRow(productionHeader, PRODUCTION_DATE_COL, siloLastCol);
  production.getColumn(PRODUCTION_DATE_COL).width = 13;
  production.getColumn(PRODUCTION_DATE_COL + 1).width = 11;
  production.getColumn(PRODUCTION_DATE_COL + 2).width = 17;
  production.getColumn(PRODUCTION_DATE_COL + 3).width = 14;
  silos.forEach((_, index) => { production.getColumn(PRODUCTION_SILO_FIRST_COL + index).width = 9; });

  entries.forEach((entry, index) => {
    const row = production.getRow(PRODUCTION_FIRST_ROW + index);
    if (entry.entryDate) {
      row.getCell(PRODUCTION_DATE_COL).value = excelDate(entry.entryDate);
      row.getCell(PRODUCTION_DATE_COL).numFmt = "dd/mm/yyyy";
    }
    row.getCell(PRODUCTION_DATE_COL + 1).value = entry.article;
    if (entry.lotNumber) row.getCell(PRODUCTION_DATE_COL + 2).value = entry.lotNumber;
    if (entry.totalQuantity !== null) {
      row.getCell(PRODUCTION_DATE_COL + 3).value = Number(entry.totalQuantity);
      row.getCell(PRODUCTION_DATE_COL + 3).numFmt = "0.00";
    }
    entry.allocations.forEach((allocation) => {
      const siloIndex = silos.indexOf(allocation.silo);
      if (siloIndex === -1) return;
      const cell = row.getCell(PRODUCTION_SILO_FIRST_COL + siloIndex);
      cell.value = Number(allocation.quantity);
      cell.numFmt = "0.00";
    });
  });

  // --- 2. Expéditions ---
  const shipment = workbook.addWorksheet(SHIPMENT_SHEET, { views: [{ state: "frozen", ySplit: 6 }] });
  const shipmentLastCol = PRODUCTION_DATE_COL + 6;
  writeTitle(shipment, 2, PRODUCTION_DATE_COL, shipmentLastCol, "  EXPÉDITIONS VRAC / SAC");
  // Silo (+4) avant Qté G(T) (+5) : Silo reste, comme N° Lot et Qté (T), une
  // valeur propre à chaque ligne (jamais fusionnée dès qu'une répartition
  // touche plusieurs silos — voir plus bas), ce qui se lit mieux juste à côté
  // d'elles plutôt qu'entre deux colonnes fusionnées.
  const shipmentLabels = ["Date", "Article", "N° Lot", "Qté (T)", "Silo", "Qté G(T)", "Expédition"];
  [6].forEach((rowNumber) => {
    const row = shipment.getRow(rowNumber);
    shipmentLabels.forEach((label, index) => { row.getCell(PRODUCTION_DATE_COL + index).value = label; });
    styleHeaderRow(row, PRODUCTION_DATE_COL, shipmentLastCol);
  });
  shipment.getColumn(PRODUCTION_DATE_COL).width = 13;
  shipment.getColumn(PRODUCTION_DATE_COL + 1).width = 11;
  shipment.getColumn(PRODUCTION_DATE_COL + 2).width = 17;
  shipment.getColumn(PRODUCTION_DATE_COL + 3).width = 11;
  shipment.getColumn(PRODUCTION_DATE_COL + 4).width = 9;
  shipment.getColumn(PRODUCTION_DATE_COL + 5).width = 11;
  shipment.getColumn(PRODUCTION_DATE_COL + 6).width = 12;

  shipments.forEach((line, index) => {
    const row = shipment.getRow(SHIPMENT_FIRST_ROW + index);
    if (line.lotNumber) row.getCell(PRODUCTION_DATE_COL + 2).value = line.lotNumber;
    row.getCell(PRODUCTION_DATE_COL + 3).value = Number(line.quantity);
    row.getCell(PRODUCTION_DATE_COL + 3).numFmt = "0.00";
    // Valeur par défaut, silo par silo : reprise telle quelle si l'expédition
    // groupée touche plusieurs silos (voir silo.createSplitShipment côté
    // serveur), écrasée par une cellule fusionnée sinon (voir plus bas).
    const siloCell = row.getCell(PRODUCTION_DATE_COL + 4);
    siloCell.value = line.silo;
    siloCell.alignment = { vertical: "middle", horizontal: "center" };
  });

  // Date, Article, Qté G(T), Silo et Expédition fusionnés sur les lignes d'une
  // même expédition répartie sur plusieurs lots (voir allocateFifoShipment et
  // createSiloShipmentGroup côté serveur, qui relient les lignes créées
  // ensemble par un splitGroupId partagé) : seuls N° Lot et Qté (T), propres à
  // chaque lot, restent renseignés ligne par ligne. « Qté G(T) » (quantité
  // groupée) donne le total de l'expédition d'origine (5 + 10 + 3 = 18, par
  // ex.), sans avoir à additionner les lignes à la main. Le regroupement se
  // fait par splitGroupId, jamais par coïncidence de valeurs : deux
  // expéditions saisies séparément qui partagent seulement la même date,
  // le même article, le même silo et le même type ne sont donc jamais
  // fusionnées comme si elles n'en formaient qu'une.
  const shipmentGroupKey = (line: ExportShipment, index: number) => (line.splitGroupId ? `group:${line.splitGroupId}` : `single:${index}`);
  // Silo (colonne +4) volontairement absente d'office : une répartition
  // manuelle sur plusieurs silos (voir silo.createSplitShipment) garde alors
  // une valeur par ligne plutôt qu'une seule cellule fusionnée qui ne
  // montrerait que le premier silo touché — voir plus bas.
  const shipmentGroupColumns = [PRODUCTION_DATE_COL, PRODUCTION_DATE_COL + 1, PRODUCTION_DATE_COL + 5, PRODUCTION_DATE_COL + 6];
  let groupStart = 0;
  while (groupStart < shipments.length) {
    let groupEnd = groupStart;
    while (groupEnd + 1 < shipments.length && shipmentGroupKey(shipments[groupEnd + 1], groupEnd + 1) === shipmentGroupKey(shipments[groupStart], groupStart)) groupEnd += 1;
    const startRow = SHIPMENT_FIRST_ROW + groupStart;
    const endRow = SHIPMENT_FIRST_ROW + groupEnd;
    const group = shipments.slice(groupStart, groupEnd + 1);
    const distinctSilos = Array.from(new Set(group.map((line) => line.silo)));
    if (endRow > startRow) {
      shipmentGroupColumns.forEach((col) => shipment.mergeCells(startRow, col, endRow, col));
      if (distinctSilos.length === 1) shipment.mergeCells(startRow, PRODUCTION_DATE_COL + 4, endRow, PRODUCTION_DATE_COL + 4);
    }

    const dateCell = shipment.getCell(startRow, PRODUCTION_DATE_COL);
    if (group[0].shipmentDate) {
      dateCell.value = excelDate(group[0].shipmentDate);
      dateCell.numFmt = "dd/mm/yyyy";
    }
    dateCell.alignment = { vertical: "middle", horizontal: "center" };
    const articleCell = shipment.getCell(startRow, PRODUCTION_DATE_COL + 1);
    articleCell.value = group[0].article;
    articleCell.alignment = { vertical: "middle", horizontal: "center" };
    // Une seule cellule fusionnée si le groupe ne touche qu'un seul silo ;
    // sinon chaque ligne garde déjà son propre silo (voir la boucle ci-dessus).
    if (distinctSilos.length === 1) {
      const siloCell = shipment.getCell(startRow, PRODUCTION_DATE_COL + 4);
      siloCell.value = distinctSilos[0];
      siloCell.alignment = { vertical: "middle", horizontal: "center" };
    }
    const totalCell = shipment.getCell(startRow, PRODUCTION_DATE_COL + 5);
    totalCell.value = group.reduce((sum, line) => sum + Number(line.quantity), 0);
    totalCell.numFmt = "0.00";
    totalCell.alignment = { vertical: "middle", horizontal: "center" };
    const typeCell = shipment.getCell(startRow, PRODUCTION_DATE_COL + 6);
    typeCell.value = group[0].shipmentType;
    typeCell.alignment = { vertical: "middle", horizontal: "center" };
    groupStart = groupEnd + 1;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
