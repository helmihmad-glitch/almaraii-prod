import ExcelJS from "exceljs";
import { asc, desc, eq } from "drizzle-orm";
import sourceData from "../client/src/data/app-data.json";
import { productionRecords, synchronizedExcelFiles } from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";

type SourceDay = {
  date: string;
  article: string;
  hours: number;
  plannedStops: number;
  unplannedStops: number;
  production: number;
  waste: number;
  availability: number;
  performance: number;
  quality: number;
  trs: number;
};

type SourceMonth = { key: string; daily: SourceDay[] };

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXCEL_FILE_NAME = "Registre_Production_Synchronise.xlsx";

function asNumber(value: number | string) {
  return typeof value === "number" ? value : Number(value);
}

const monthNumbers: Record<string, string> = {
  janvier: "01", fevrier: "02", mars: "03", avril: "04", mai: "05", juin: "06",
  juillet: "07", aout: "08", septembre: "09", octobre: "10", novembre: "11", decembre: "12",
};

function periodPrefix(monthKey: string) {
  const normalized = monthKey.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const year = normalized.match(/\d{4}/)?.[0];
  const monthName = Object.keys(monthNumbers).find((name) => normalized.startsWith(name));
  if (!year || !monthName) return undefined;
  return `${year}-${monthNumbers[monthName]}`;
}

export function buildSeedRows() {
  const months = (sourceData as unknown as { months: SourceMonth[] }).months;
  const rows = months.flatMap((month) => {
    const prefix = periodPrefix(month.key);
    return month.daily.filter((day) => !prefix || day.date.startsWith(prefix));
  }).map((day) => {
    const realHours = Math.max(day.hours - day.plannedStops - day.unplannedStops, 0);
    const standardRate = realHours > 0 && day.performance > 0
      ? day.production / (realHours * day.performance)
      : 15;
    return {
      productionDate: day.date,
      article: day.article,
      totalProductionHours: day.hours.toFixed(2),
      plannedStopsHours: day.plannedStops.toFixed(2),
      unplannedStopsHours: day.unplannedStops.toFixed(2),
      productionTons: day.production.toFixed(2),
      wasteTons: day.waste.toFixed(2),
      standardRate: standardRate.toFixed(2),
      availability: day.availability.toFixed(6),
      performance: day.performance.toFixed(6),
      quality: day.quality.toFixed(6),
      trs: day.trs.toFixed(6),
      realHours: realHours.toFixed(2),
      source: "excel",
    };
  });
  const unique = new Map(rows.map((row) => [`${row.productionDate}::${row.article}::${row.totalProductionHours}::${row.productionTons}`, row]));
  return Array.from(unique.values());
}

export async function seedExcelRecordsIfNeeded() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const existing = await db.select({ id: productionRecords.id })
    .from(productionRecords)
    .where(eq(productionRecords.source, "excel"))
    .limit(1);
  if (existing.length) return { seeded: false, count: 0 };

  const rows = buildSeedRows();
  for (let start = 0; start < rows.length; start += 100) {
    await db.insert(productionRecords).values(rows.slice(start, start + 100));
  }
  return { seeded: true, count: rows.length };
}

export async function getSynchronizedExcelFile() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(synchronizedExcelFiles).where(eq(synchronizedExcelFiles.id, 1)).limit(1);
  return rows[0];
}

export async function syncExcelFromRecords() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const records = await db.select().from(productionRecords)
    .orderBy(asc(productionRecords.productionDate), asc(productionRecords.article), asc(productionRecords.id));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Almaraïi Production Pulse";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Registre journalier", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "DATE", key: "date", width: 14 },
    { header: "ARTICLE", key: "article", width: 16 },
    { header: "TEMPS TOTAL PROD. (h)", key: "hours", width: 23 },
    { header: "ARRÊTS PLAN. (h)", key: "plannedStops", width: 19 },
    { header: "ARRÊTS NON PL. (h)", key: "unplannedStops", width: 21 },
    { header: "PROD. (T)", key: "production", width: 14 },
    { header: "REBUTS (T)", key: "waste", width: 14 },
    { header: "CADENCE STD", key: "standardRate", width: 16 },
    { header: "DISPO. %", key: "availability", width: 13 },
    { header: "PERF. %", key: "performance", width: 13 },
    { header: "QUALITÉ %", key: "quality", width: 14 },
    { header: "TRS %", key: "trs", width: 13 },
    { header: "H. RÉELLES", key: "realHours", width: 16 },
    { header: "SOURCE", key: "source", width: 14 },
  ];
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF132B35" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  worksheet.getRow(1).height = 28;

  records.forEach((record) => {
    worksheet.addRow({
      id: record.id,
      date: new Date(`${record.productionDate}T00:00:00`),
      article: record.article,
      hours: asNumber(record.totalProductionHours),
      plannedStops: asNumber(record.plannedStopsHours),
      unplannedStops: asNumber(record.unplannedStopsHours),
      production: asNumber(record.productionTons),
      waste: asNumber(record.wasteTons),
      standardRate: asNumber(record.standardRate),
      availability: asNumber(record.availability),
      performance: asNumber(record.performance),
      quality: asNumber(record.quality),
      trs: asNumber(record.trs),
      realHours: asNumber(record.realHours),
      source: record.source,
    });
  });

  worksheet.getColumn("date").numFmt = "dd/mm/yyyy";
  ["hours", "plannedStops", "unplannedStops", "production", "waste", "standardRate", "realHours"].forEach((key) => {
    worksheet.getColumn(key).numFmt = "0.00";
  });
  ["availability", "performance", "quality", "trs"].forEach((key) => {
    worksheet.getColumn(key).numFmt = "0.0%";
  });
  worksheet.autoFilter = "A1:O1";

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const uploaded = await storagePut(`production-sync/${EXCEL_FILE_NAME}`, buffer, EXCEL_MIME);
  const fileValues = {
    id: 1,
    fileName: EXCEL_FILE_NAME,
    storageKey: uploaded.key,
    downloadUrl: uploaded.url,
    recordCount: records.length,
  };
  await db.insert(synchronizedExcelFiles).values(fileValues).onDuplicateKeyUpdate({
    set: {
      fileName: fileValues.fileName,
      storageKey: fileValues.storageKey,
      downloadUrl: fileValues.downloadUrl,
      recordCount: fileValues.recordCount,
    },
  });
  return getSynchronizedExcelFile();
}

export async function initializeSynchronizedExcel() {
  const seed = await seedExcelRecordsIfNeeded();
  const currentFile = await getSynchronizedExcelFile();
  const file = seed.seeded || !currentFile ? await syncExcelFromRecords() : currentFile;
  return { ...file, seeded: seed.seeded, seedCount: seed.count };
}
