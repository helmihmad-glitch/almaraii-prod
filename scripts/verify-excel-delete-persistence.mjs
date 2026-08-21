import { and, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { getDb } from "../server/db.ts";
import { getSynchronizedExcelFile, initializeSynchronizedExcel, syncExcelFromRecords } from "../server/excelSync.ts";
import { productionRecords } from "../drizzle/schema.ts";
import { storageGetSignedUrl } from "../server/storage.ts";

const db = await getDb();
if (!db) throw new Error("Base de données indisponible pour la vérification de suppression.");

const [target] = await db.select().from(productionRecords).where(eq(productionRecords.source, "excel")).limit(1);
if (!target) throw new Error("Aucune ligne Excel disponible pour la vérification réversible.");

const sameSourceSignature = and(
  eq(productionRecords.productionDate, target.productionDate),
  eq(productionRecords.article, target.article),
  eq(productionRecords.totalProductionHours, target.totalProductionHours),
  eq(productionRecords.productionTons, target.productionTons),
  eq(productionRecords.source, "excel"),
);

let removalStarted = false;
let temporaryRecordId;

try {
  await db.delete(productionRecords).where(eq(productionRecords.id, target.id));
  removalStarted = true;
  await syncExcelFromRecords();
  const synchronizedFile = await getSynchronizedExcelFile();
  if (!synchronizedFile) throw new Error("Le fichier Excel synchronisé est introuvable après suppression.");
  const excelResponse = await fetch(await storageGetSignedUrl(synchronizedFile.storageKey));
  if (!excelResponse.ok) throw new Error("Le fichier Excel synchronisé ne peut pas être téléchargé.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await excelResponse.arrayBuffer()));
  const worksheet = workbook.getWorksheet("Registre journalier");
  const exportedIds = new Set((worksheet?.getColumn(1).values ?? []).filter((value) => typeof value === "number"));
  if (exportedIds.has(target.id)) throw new Error("Le fichier Excel synchronisé contient encore la ligne supprimée.");
  await initializeSynchronizedExcel();

  const byOriginalId = await db.select({ id: productionRecords.id }).from(productionRecords).where(eq(productionRecords.id, target.id));
  const bySourceSignature = await db.select({ id: productionRecords.id }).from(productionRecords).where(sameSourceSignature);
  if (byOriginalId.length || bySourceSignature.length) {
    throw new Error("La ligne Excel supprimée a été réintroduite pendant la réinitialisation.");
  }

  const temporaryArticle = `TEST-SUPPRESSION-${Date.now()}`;
  const temporaryInsert = await db.insert(productionRecords).values({
    productionDate: "2026-12-31",
    article: temporaryArticle,
    totalProductionHours: "1.00",
    plannedStopsHours: "0.00",
    unplannedStopsHours: "0.00",
    productionTons: "1.00",
    wasteTons: "0.00",
    standardRate: "1.00",
    availability: "1.000000",
    performance: "1.000000",
    quality: "1.000000",
    trs: "1.000000",
    realHours: "1.00",
    comment: "Vérification temporaire de suppression",
    source: "manual",
  });
  temporaryRecordId = Number(temporaryInsert[0].insertId);
  await syncExcelFromRecords();
  await db.delete(productionRecords).where(eq(productionRecords.id, temporaryRecordId));
  await syncExcelFromRecords();
  await initializeSynchronizedExcel();
  const temporaryAfterInitialize = await db.select({ id: productionRecords.id }).from(productionRecords).where(eq(productionRecords.id, temporaryRecordId));
  if (temporaryAfterInitialize.length) throw new Error("La ligne temporaire supprimée a réapparu après réinitialisation.");

  console.log(JSON.stringify({ deletedRecordId: target.id, temporaryRecordId, absentFromSynchronizedExcel: true, absentAfterInitialize: true, temporaryRecordAbsentAfterInitialize: true }));
} finally {
  if (temporaryRecordId) {
    await db.delete(productionRecords).where(eq(productionRecords.id, temporaryRecordId));
  }
  if (removalStarted) {
    const reintroduced = await db.select({ id: productionRecords.id }).from(productionRecords).where(sameSourceSignature);
    for (const row of reintroduced) {
      await db.delete(productionRecords).where(eq(productionRecords.id, row.id));
    }
    await db.insert(productionRecords).values(target);
    await syncExcelFromRecords();
    console.log(JSON.stringify({ restoredRecordId: target.id, excelSynchronizedAfterRestore: true }));
  }
}

process.exit(0);
