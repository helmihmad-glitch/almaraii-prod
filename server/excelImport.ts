import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { productionRecords } from "../drizzle/schema";
import { addProductionArticle, getDb } from "./db";

export type ImportedProductionRow = {
  rowNumber: number;
  id?: number;
  productionDate: string;
  article: string;
  totalProductionHours: number;
  plannedStopsHours: number;
  unplannedStopsHours: number;
  productionTons: number;
  wasteTons: number;
  standardRate: number;
  comment?: string;
};

type ParsedImport = { rows: ImportedProductionRow[]; errors: string[] };

const requiredHeaders = {
  date: ["DATE", "DATEDEPRODUCTION", "JOUR"],
  article: ["ARTICLE", "ARTICLES", "PRODUIT", "PRODUITS", "CODEARTICLE", "DESIGNATION"],
  totalProductionHours: ["TEMPSTOTALPRODH", "TEMPSTOTALPRODHPARARTICLE", "TEMPSTOTALPRODUCTION", "TEMPSTOTALPRODUCTIONH", "TEMPSTOTALPRODUCTIONPARARTICLE", "TEMPSPRODH", "TEMPSPRODUCTION", "TEMPSPRODUCTIONH", "TEMPSDEPRODUCTION", "TEMPSDEPRODUCTIONH", "DUREEPROD", "DUREEPRODH", "DUREEDEPRODUCTION", "DUREEDEPRODUCTIONH", "HEURESPROD", "HEURESPRODUCTION", "NBHEURESPROD"],
  plannedStopsHours: ["ARRETSPLANH"],
  unplannedStopsHours: ["ARRETSNONPLH"],
  productionTons: ["PRODT", "PRODUCTIONT"],
  wasteTons: ["REBUTST"],
  standardRate: ["CADENCESTD", "CADENCESTDDARTICLE"],
} as const;

const optionalHeaders = {
  realHours: ["HRELLES", "HREELLES", "HEURESRELLES", "HEUREREELLES", "TEMPSREEL", "TEMPSREELH"],
} as const;

const frenchMonthNumbers: Record<string, string> = {
  janv: "01", janvier: "01", fev: "02", fevr: "02", fevrier: "02", mars: "03", avr: "04", avril: "04", mai: "05", juin: "06", juil: "07", juillet: "07", aout: "08", sept: "09", septembre: "09", oct: "10", octobre: "10", nov: "11", novembre: "11", dec: "12", decembre: "12",
};

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function matchesHeader(header: string, aliases: readonly string[]) {
  return aliases.some((alias) => header === alias || header.startsWith(alias) || (alias.length >= 5 && header.includes(alias)));
}

function readCellText(cell: ExcelJS.Cell) {
  try {
    return cell.text?.trim() ?? "";
  } catch {
    const value = cell.value;
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  }
}

function parseNumeric(value: ExcelJS.CellValue, text: string) {
  if (typeof value === "number") return value;
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toIsoDate(value: ExcelJS.CellValue, text: string, fallbackYear?: number): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const french = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (french) return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`;
  const localized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\./g, "").match(/^(\d{1,2})[-\s]([a-z]+)/);
  const month = localized ? frenchMonthNumbers[localized[2]] : undefined;
  if (localized && month && fallbackYear) return `${fallbackYear}-${month}-${localized[1].padStart(2, "0")}`;
  return undefined;
}

function findSheetYear(worksheet: ExcelJS.Worksheet) {
  const firstRows = Array.from({ length: Math.min(8, worksheet.rowCount) }, (_, index) => {
    const values = worksheet.getRow(index + 1).values;
    return Array.isArray(values) ? values.map((value) => String(value ?? "")).join(" ") : "";
  }).join(" ");
  const year = `${firstRows} ${worksheet.name}`.match(/(20\d{2})/)?.[1];
  return year ? Number(year) : undefined;
}

function findHeaderRow(worksheet: ExcelJS.Worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(100, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rowValues = Array.isArray(row.values) ? row.values : [];
    const headers = rowValues.map((value: ExcelJS.CellValue) => normalizeHeader(String(value ?? "")));
    if (headers.some((header) => matchesHeader(header, requiredHeaders.date)) && headers.some((header) => matchesHeader(header, requiredHeaders.article))) return row;
  }
  return undefined;
}

function calculateRow(row: ImportedProductionRow) {
  const realHours = Math.max(row.totalProductionHours - row.plannedStopsHours - row.unplannedStopsHours, 0);
  const availability = row.totalProductionHours > 0 ? Math.max((row.totalProductionHours - row.unplannedStopsHours) / row.totalProductionHours, 0) : 0;
  const performance = realHours > 0 ? row.productionTons / (realHours * row.standardRate) : 0;
  const quality = row.productionTons > 0 ? Math.max((row.productionTons - row.wasteTons) / row.productionTons, 0) : 1;
  return {
    productionDate: row.productionDate,
    article: row.article,
    totalProductionHours: row.totalProductionHours.toFixed(2),
    plannedStopsHours: row.plannedStopsHours.toFixed(2),
    unplannedStopsHours: row.unplannedStopsHours.toFixed(2),
    productionTons: row.productionTons.toFixed(2),
    wasteTons: row.wasteTons.toFixed(2),
    standardRate: row.standardRate.toFixed(2),
    availability: availability.toFixed(6),
    performance: performance.toFixed(6),
    quality: quality.toFixed(6),
    trs: (availability * performance * quality).toFixed(6),
    realHours: realHours.toFixed(2),
    comment: row.comment?.trim() || null,
    source: "excel-import",
  };
}

export async function parseImportedWorkbook(buffer: Buffer): Promise<ParsedImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  if (workbook.worksheets.length === 0) return { rows: [], errors: ["Le fichier Excel ne contient aucune feuille."] };
  const rows: ImportedProductionRow[] = [];
  const errors: string[] = [];
  let foundRegistrySheet = false;
  for (const worksheet of workbook.worksheets) {
    const headerRow = findHeaderRow(worksheet);
    if (!headerRow) continue;
    foundRegistrySheet = true;
    const sheetYear = findSheetYear(worksheet);
    const headerIndexes = new Map<string, number>();
    headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => headerIndexes.set(normalizeHeader(readCellText(cell)), columnNumber));
    const findColumn = (aliases: readonly string[]) => Array.from(headerIndexes.entries()).find(([header]) => matchesHeader(header, aliases))?.[1];
    const columns = Object.fromEntries(Object.entries(requiredHeaders).map(([key, aliases]) => [key, findColumn(aliases)])) as Record<keyof typeof requiredHeaders, number | undefined>;
    const realHoursColumn = findColumn(optionalHeaders.realHours);
    const missingHeaders = Object.entries(columns).filter(([key, column]) => !column && !(key === "totalProductionHours" && realHoursColumn)).map(([key]) => key);
    if (missingHeaders.length) {
      errors.push(`Feuille ${worksheet.name} : colonnes obligatoires manquantes : ${missingHeaders.join(", ")}.`);
      continue;
    }
    const idColumn = findColumn(["ID"]);
    const commentColumn = findColumn(["COMMENTAIRE", "COMMENT"]);
    for (let rowNumber = headerRow.number + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const articleCell = row.getCell(columns.article!);
      const article = readCellText(articleCell).toUpperCase();
      const dateCell = row.getCell(columns.date!);
      if (!article && !readCellText(dateCell)) continue;
      const productionDate = toIsoDate(dateCell.value, readCellText(dateCell), sheetYear);
      const asZeroWhenBlank = (column: number | undefined) => {
        if (!column) return 0;
        const cell = row.getCell(column);
        const value = parseNumeric(cell.value, readCellText(cell));
        return Number.isNaN(value) && !readCellText(cell) ? 0 : value;
      };
      const plannedStopsHours = asZeroWhenBlank(columns.plannedStopsHours);
      const unplannedStopsHours = asZeroWhenBlank(columns.unplannedStopsHours);
      const importedRealHours = realHoursColumn ? parseNumeric(row.getCell(realHoursColumn).value, readCellText(row.getCell(realHoursColumn))) : Number.NaN;
      const values = {
        totalProductionHours: columns.totalProductionHours ? parseNumeric(row.getCell(columns.totalProductionHours).value, readCellText(row.getCell(columns.totalProductionHours))) : importedRealHours + plannedStopsHours + unplannedStopsHours,
        plannedStopsHours,
        unplannedStopsHours,
        productionTons: parseNumeric(row.getCell(columns.productionTons!).value, readCellText(row.getCell(columns.productionTons!))),
        wasteTons: asZeroWhenBlank(columns.wasteTons),
        standardRate: parseNumeric(row.getCell(columns.standardRate!).value, readCellText(row.getCell(columns.standardRate!))),
      };
      if (!productionDate || !article || Object.values(values).some((value: number) => !Number.isFinite(value))) {
        errors.push(`Feuille ${worksheet.name}, ligne ${rowNumber} : date, article ou valeurs numériques invalides.`);
        continue;
      }
      if (values.totalProductionHours <= 0 || values.productionTons <= 0 || values.standardRate <= 0 || values.plannedStopsHours < 0 || values.unplannedStopsHours < 0 || values.wasteTons < 0 || values.wasteTons > values.productionTons || values.plannedStopsHours + values.unplannedStopsHours > values.totalProductionHours) {
        errors.push(`Feuille ${worksheet.name}, ligne ${rowNumber} : les temps, la production ou les rebuts ne respectent pas les règles du registre.`);
        continue;
      }
      const idValue = idColumn ? parseNumeric(row.getCell(idColumn).value, readCellText(row.getCell(idColumn))) : Number.NaN;
      rows.push({ rowNumber, id: Number.isInteger(idValue) && idValue > 0 ? idValue : undefined, productionDate, article, ...values, comment: commentColumn ? readCellText(row.getCell(commentColumn)) : undefined });
    }
  }
  if (!foundRegistrySheet) return { rows: [], errors: ["Les en-têtes de date et d’article sont introuvables dans les cent premières lignes de toutes les feuilles du fichier."] };
  return { rows, errors };
}

export async function importProductionRows(rows: ImportedProductionRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(productionRecords);
  const byId = new Map(existing.map((record) => [record.id, record]));
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const values = calculateRow(row);
    const existingRecord = row.id ? byId.get(row.id) : undefined;
    if (existingRecord) {
      await db.update(productionRecords).set(values).where(eq(productionRecords.id, existingRecord.id));
      updated += 1;
    } else {
      const result = await db.insert(productionRecords).values(values);
      byId.set(result[0].insertId, { ...values, id: result[0].insertId, createdAt: new Date(), updatedAt: new Date() } as typeof existing[number]);
      created += 1;
    }
    await addProductionArticle(row.article);
  }
  return { created, updated, total: rows.length };
}
