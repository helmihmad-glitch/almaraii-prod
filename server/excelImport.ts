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
  date: ["DATE"],
  article: ["ARTICLE"],
  totalProductionHours: ["TEMPSTOTALPRODH", "TEMPSTOTALPRODHPARARTICLE"],
  plannedStopsHours: ["ARRETSPLANH"],
  unplannedStopsHours: ["ARRETSNONPLH"],
  productionTons: ["PRODT", "PRODUCTIONT"],
  wasteTons: ["REBUTST"],
  standardRate: ["CADENCESTD", "CADENCESTDDARTICLE"],
} as const;

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function readCellText(cell: ExcelJS.Cell) {
  return cell.text?.trim() ?? "";
}

function parseNumeric(value: ExcelJS.CellValue, text: string) {
  if (typeof value === "number") return value;
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toIsoDate(value: ExcelJS.CellValue, text: string): string | undefined {
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
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { rows: [], errors: ["Le fichier Excel ne contient aucune feuille."] };

  let headerRow: ExcelJS.Row | undefined;
  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rowValues = Array.isArray(row.values) ? row.values : [];
    const headers = rowValues.map((value: ExcelJS.CellValue) => normalizeHeader(String(value ?? "")));
    if (headers.includes("DATE") && headers.includes("ARTICLE")) {
      headerRow = row;
      break;
    }
  }
  if (!headerRow) return { rows: [], errors: ["Les en-têtes DATE et ARTICLE sont introuvables dans les dix premières lignes du fichier."] };

  const headerIndexes = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => headerIndexes.set(normalizeHeader(readCellText(cell)), columnNumber));
  const findColumn = (aliases: readonly string[]) => {
    for (const [header, column] of Array.from(headerIndexes.entries())) if (aliases.some((alias) => header === alias || header.startsWith(alias))) return column;
    return undefined;
  };
  const columns = Object.fromEntries(Object.entries(requiredHeaders).map(([key, aliases]) => [key, findColumn(aliases)])) as Record<keyof typeof requiredHeaders, number | undefined>;
  const missingHeaders = Object.entries(columns).filter(([, column]) => !column).map(([key]) => key);
  if (missingHeaders.length) return { rows: [], errors: [`Colonnes obligatoires manquantes : ${missingHeaders.join(", ")}.`] };

  const idColumn = findColumn(["ID"]);
  const commentColumn = findColumn(["COMMENTAIRE", "COMMENT"]);
  const rows: ImportedProductionRow[] = [];
  const errors: string[] = [];
  for (let rowNumber = headerRow.number + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const articleCell = row.getCell(columns.article!);
    const article = readCellText(articleCell).toUpperCase();
    if (!article && row.cellCount === 0) continue;
    const dateCell = row.getCell(columns.date!);
    const productionDate = toIsoDate(dateCell.value, readCellText(dateCell));
    const values = {
      totalProductionHours: parseNumeric(row.getCell(columns.totalProductionHours!).value, readCellText(row.getCell(columns.totalProductionHours!))),
      plannedStopsHours: parseNumeric(row.getCell(columns.plannedStopsHours!).value, readCellText(row.getCell(columns.plannedStopsHours!))),
      unplannedStopsHours: parseNumeric(row.getCell(columns.unplannedStopsHours!).value, readCellText(row.getCell(columns.unplannedStopsHours!))),
      productionTons: parseNumeric(row.getCell(columns.productionTons!).value, readCellText(row.getCell(columns.productionTons!))),
      wasteTons: parseNumeric(row.getCell(columns.wasteTons!).value, readCellText(row.getCell(columns.wasteTons!))),
      standardRate: parseNumeric(row.getCell(columns.standardRate!).value, readCellText(row.getCell(columns.standardRate!))),
    };
    if (!productionDate || !article || Object.values(values).some((value: number) => !Number.isFinite(value))) {
      errors.push(`Ligne ${rowNumber} : date, article ou valeurs numériques invalides.`);
      continue;
    }
    if (values.totalProductionHours <= 0 || values.productionTons <= 0 || values.standardRate <= 0 || values.plannedStopsHours < 0 || values.unplannedStopsHours < 0 || values.wasteTons < 0 || values.wasteTons > values.productionTons || values.plannedStopsHours + values.unplannedStopsHours > values.totalProductionHours) {
      errors.push(`Ligne ${rowNumber} : les temps, la production ou les rebuts ne respectent pas les règles du registre.`);
      continue;
    }
    const idValue = idColumn ? parseNumeric(row.getCell(idColumn).value, readCellText(row.getCell(idColumn))) : Number.NaN;
    rows.push({ rowNumber, id: Number.isInteger(idValue) && idValue > 0 ? idValue : undefined, productionDate, article, ...values, comment: commentColumn ? readCellText(row.getCell(commentColumn)) : undefined });
  }
  return { rows, errors };
}

export async function importProductionRows(rows: ImportedProductionRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(productionRecords);
  const byId = new Map(existing.map((record) => [record.id, record]));
  const byDateAndArticle = new Map(existing.map((record) => [`${record.productionDate}::${record.article.toUpperCase()}`, record]));
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const values = calculateRow(row);
    const existingRecord = (row.id ? byId.get(row.id) : undefined) ?? byDateAndArticle.get(`${row.productionDate}::${row.article.toUpperCase()}`);
    if (existingRecord) {
      await db.update(productionRecords).set(values).where(eq(productionRecords.id, existingRecord.id));
      updated += 1;
    } else {
      const result = await db.insert(productionRecords).values(values);
      byId.set(result[0].insertId, { ...values, id: result[0].insertId, createdAt: new Date(), updatedAt: new Date() } as typeof existing[number]);
      created += 1;
    }
    byDateAndArticle.set(`${row.productionDate}::${row.article.toUpperCase()}`, { ...values, id: existingRecord?.id ?? 0, createdAt: new Date(), updatedAt: new Date() } as typeof existing[number]);
    await addProductionArticle(row.article);
  }
  return { created, updated, total: rows.length };
}
