import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  addProductionArticle,
  addProductionOperator,
  archiveProductionArticle,
  archiveProductionOperator,
  createDailyProgram,
  createDailyProgramLine,
  createProductionRecord,
  deleteDailyProgram,
  deleteDailyProgramLine,
  deleteProductionRecord,
  getDailyProgramByDate,
  getProductionSettings,
  initializeProductionArticles,
  listActiveProductionArticles,
  listActiveProductionOperators,
  listDailyPrograms,
  listProductionRecords,
  saveActionPasswordDigest,
  updateDailyProgram,
  updateDailyProgramLine,
  updateProductionRecord,
} from "./db";
import { getSynchronizedExcelFile, initializeSynchronizedExcel, syncExcelFromRecords } from "./excelSync";
import { importProductionRows, parseImportedWorkbook } from "./excelImport";
import { createActionPasswordDigest, verifyActionPasswordDigest } from "./settingsSecurity";
import { isVercelBlobConfigured, storageCreatePresignedUpload, storageGetSignedUrl } from "./storage";
import {
  createSiloProductionEntry,
  createSiloShipment,
  deleteSiloProductionEntry,
  deleteSiloShipment,
  listSiloMovementArticles,
  listSiloProductionEntries,
  listSiloShipments,
  loadLotMovements,
  loadSiloMovements,
  replaceSiloMovements,
  updateSiloProductionEntry,
  updateSiloShipment,
} from "./siloDb";
import { buildSiloWorkbook, parseSiloWorkbook } from "./siloExcel";
import { computeLotLedger } from "./siloLots";
import { computeArticleStock, computeSiloMatrix, computeSiloOccupancy, computeTotalStock } from "./siloStock";
import { SHIPMENT_TYPES, SILOS } from "../shared/silo";

export const recordInput = z.object({
  productionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit être au format AAAA-MM-JJ"),
  article: z.string().trim().min(1).max(64),
  totalProductionHours: z.number().positive(),
  plannedStopsHours: z.number().min(0),
  unplannedStopsHours: z.number().min(0),
  productionTons: z.number().positive(),
  wasteTons: z.number().min(0),
  standardRate: z.number().positive(),
}).superRefine((value, ctx) => {
  if (value.wasteTons > value.productionTons) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["wasteTons"], message: "Les rebuts ne peuvent pas dépasser la production." });
  if (value.plannedStopsHours + value.unplannedStopsHours > value.totalProductionHours) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unplannedStopsHours"], message: "Les arrêts cumulés ne peuvent pas dépasser le temps total." });
});

export async function isActionPasswordValid(password: string) {
  const settings = await getProductionSettings();
  console.log("Checking action password validity:", { password, settings });
  if (settings?.actionPasswordHash && settings.actionPasswordSalt) {
    return verifyActionPasswordDigest(password, { hash: settings.actionPasswordHash, salt: settings.actionPasswordSalt });
  }
  return Boolean(process.env.COMMENT_EDIT_PASSWORD) && password === process.env.COMMENT_EDIT_PASSWORD;
}

export async function assertProductionActionAuthorized(password: string | undefined) {
  const settings = await getProductionSettings();
  const hasStoredActionPassword = Boolean(settings?.actionPasswordHash && settings.actionPasswordSalt);
  const hasLegacyEnvPassword = Boolean(process.env.COMMENT_EDIT_PASSWORD);

  if (!hasStoredActionPassword && !hasLegacyEnvPassword) {
    return;
  }

  if (!password || !(await isActionPasswordValid(password))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Le mot de passe est requis pour modifier, supprimer ou gérer les paramètres." });
  }
}

const recordWithCommentInput = recordInput.safeExtend({
  comment: z.string().trim().max(1000, "Le commentaire ne peut pas dépasser 1 000 caractères.").optional(),
});

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit être au format AAAA-MM-JJ");
const optionalProgramText = (maxLength: number) => z.string().trim().max(maxLength).optional().transform((value) => value || undefined);
const dailyProgramInput = z.object({
  programDate: dateInput,
  operatorName: z.string().trim().min(1, "Indiquez le pupitreur.").max(1000),
});
const dailyProgramLineInput = z.object({
  programId: z.number().int().positive(),
  sequence: z.number().int().min(1).max(999),
  article: optionalProgramText(64),
  version: optionalProgramText(64),
  bagQuantity: optionalProgramText(128),
  bulkQuantity: optionalProgramText(128),
  plannedStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "L’heure de début doit être au format HH:MM"),
  plannedEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "L’heure de fin doit être au format HH:MM"),
  observation: optionalProgramText(4000),
});
const SILO_IMPORT_PREFIX = "silo-import/";
const siloInput = z.enum(SILOS);
const optionalDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit être au format AAAA-MM-JJ").optional().or(z.literal("").transform(() => undefined));
const siloArticleInput = z.string().trim().min(1, "Indiquez l’article.").max(64);
const lotNumberInput = z.string().trim().max(64).optional().transform((value) => value || undefined);
// Les quantités peuvent être négatives : le classeur d’origine utilise des
// lignes de correction pour rééquilibrer un silo (par exemple -40 T).
const siloQuantityInput = z.number().finite();
const siloEntryInput = z.object({
  entryDate: optionalDateInput,
  article: siloArticleInput,
  lotNumber: lotNumberInput,
  totalQuantity: z.number().finite().optional(),
  allocations: z.array(z.object({ silo: siloInput, quantity: siloQuantityInput })).max(SILOS.length),
});
const siloShipmentInput = z.object({
  shipmentDate: optionalDateInput,
  article: siloArticleInput,
  lotNumber: lotNumberInput,
  quantity: siloQuantityInput,
  silo: siloInput,
  shipmentType: z.enum(SHIPMENT_TYPES),
});

export const EXCEL_IMPORT_MAX_BYTES = 5_700_000;
const importFileNameInput = z.string().trim().min(1).max(255).refine((fileName) => /\.xlsx$/i.test(fileName), "Importez un fichier Excel au format .xlsx.");

const importSourceInput = z.string().startsWith("production-import/");

async function importWorkbookBuffer(buffer: Buffer) {
  const parsed = await parseImportedWorkbook(buffer);
  if (parsed.rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Aucune ligne de production valide n’a été trouvée dans le fichier. ${parsed.errors.slice(0, 5).join(" ")}`.trim() });
  const result = await importProductionRows(parsed.rows);
  await syncExcelFromRecords();
  return { ...result, rejected: parsed.errors.length, rejectedLines: parsed.errors.slice(0, 5) };
}

export function calculateRecord(input: z.infer<typeof recordInput>) {
  const realHours = Math.max(input.totalProductionHours - input.plannedStopsHours - input.unplannedStopsHours, 0);
  const availability = input.totalProductionHours > 0 ? Math.max((input.totalProductionHours - input.unplannedStopsHours) / input.totalProductionHours, 0) : 0;
  const performance = realHours > 0 ? input.productionTons / (realHours * input.standardRate) : 0;
  const quality = input.productionTons > 0 ? Math.max((input.productionTons - input.wasteTons) / input.productionTons, 0) : 1;
  const trs = availability * performance * quality;
  return {
    ...input,
    totalProductionHours: input.totalProductionHours.toFixed(2),
    plannedStopsHours: input.plannedStopsHours.toFixed(2),
    unplannedStopsHours: input.unplannedStopsHours.toFixed(2),
    productionTons: input.productionTons.toFixed(2),
    wasteTons: input.wasteTons.toFixed(2),
    standardRate: input.standardRate.toFixed(2),
    availability: availability.toFixed(6),
    performance: performance.toFixed(6),
    quality: quality.toFixed(6),
    trs: trs.toFixed(6),
    realHours: realHours.toFixed(2),
  };
}

export const appRouter = router({
  system: systemRouter,
  settings: router({
    listArticles: publicProcedure.query(async () => {
      await initializeProductionArticles();
      return listActiveProductionArticles();
    }),
    addArticle: publicProcedure.input(z.object({ code: z.string().trim().min(1, "Saisissez un article.").max(64), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return addProductionArticle(input.code);
    }),
    archiveArticle: publicProcedure.input(z.object({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return archiveProductionArticle(input.id);
    }),
    listOperators: publicProcedure.query(() => listActiveProductionOperators()),
    addOperator: publicProcedure.input(z.object({ name: z.string().trim().min(1, "Saisissez un pupitreur.").max(128), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return addProductionOperator(input.name);
    }),
    archiveOperator: publicProcedure.input(z.object({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return archiveProductionOperator(input.id);
    }),
    changeActionPassword: publicProcedure.input(z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(6, "Le nouveau mot de passe doit contenir au moins 6 caractères.").max(128) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.currentPassword);
      await saveActionPasswordDigest(createActionPasswordDigest(input.newPassword));
      return { success: true } as const;
    }),
  }),
  dailyProgram: router({
    list: publicProcedure.query(() => listDailyPrograms()),
    byDate: publicProcedure.input(z.object({ programDate: dateInput })).query(({ input }) => getDailyProgramByDate(input.programDate)),
    create: publicProcedure.input(dailyProgramInput.safeExtend({ actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { actionPassword, ...program } = input;
      return createDailyProgram(program);
    }),
    update: publicProcedure.input(dailyProgramInput.safeExtend({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { id, actionPassword, ...program } = input;
      return updateDailyProgram(id, program);
    }),
    delete: publicProcedure.input(z.object({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return deleteDailyProgram(input.id);
    }),
    createLine: publicProcedure.input(dailyProgramLineInput.safeExtend({ actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { actionPassword, ...line } = input;
      return createDailyProgramLine(line);
    }),
    updateLine: publicProcedure.input(dailyProgramLineInput.safeExtend({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { id, actionPassword, ...line } = input;
      return updateDailyProgramLine(id, line);
    }),
    deleteLine: publicProcedure.input(z.object({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return deleteDailyProgramLine(input.id);
    }),
  }),
  silo: router({
    /** État courant des silos : matrice, occupation et stock par article. */
    state: publicProcedure.query(async () => {
      const [{ allocations, shipments }, configuredArticles, movementArticles] = await Promise.all([
        loadSiloMovements(),
        listActiveProductionArticles(),
        listSiloMovementArticles(),
      ]);
      // Les articles configurés donnent l’ordre des colonnes ; ceux rencontrés
      // uniquement dans d’anciens mouvements restent visibles à la suite.
      const configuredCodes = configuredArticles.map((article) => article.code);
      const articles = [...configuredCodes, ...movementArticles.filter((article) => !configuredCodes.includes(article))];
      const matrix = computeSiloMatrix(allocations, shipments, SILOS, articles);
      const occupancy = computeSiloOccupancy(matrix, SILOS, articles);
      return {
        silos: [...SILOS],
        articles,
        matrix,
        occupancy,
        articleStock: computeArticleStock(occupancy, articles),
        totalStock: computeTotalStock(occupancy),
      };
    }),
    listEntries: publicProcedure.query(() => listSiloProductionEntries()),
    createEntry: publicProcedure.input(siloEntryInput.safeExtend({ actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { actionPassword, allocations, totalQuantity, ...entry } = input;
      return createSiloProductionEntry({ ...entry, totalQuantity: totalQuantity === undefined ? null : totalQuantity.toFixed(2) }, allocations);
    }),
    updateEntry: publicProcedure.input(siloEntryInput.safeExtend({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { id, actionPassword, allocations, totalQuantity, ...entry } = input;
      return updateSiloProductionEntry(id, { ...entry, totalQuantity: totalQuantity === undefined ? null : totalQuantity.toFixed(2) }, allocations);
    }),
    deleteEntry: publicProcedure.input(z.object({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return deleteSiloProductionEntry(input.id);
    }),
    listShipments: publicProcedure.query(() => listSiloShipments()),
    createShipment: publicProcedure.input(siloShipmentInput.safeExtend({ actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { actionPassword, quantity, ...shipment } = input;
      return createSiloShipment({ ...shipment, quantity: quantity.toFixed(2) });
    }),
    updateShipment: publicProcedure.input(siloShipmentInput.safeExtend({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { id, actionPassword, quantity, ...shipment } = input;
      return updateSiloShipment(id, { ...shipment, quantity: quantity.toFixed(2) });
    }),
    deleteShipment: publicProcedure.input(z.object({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return deleteSiloShipment(input.id);
    }),
    /** Prépare le téléversement direct du classeur Silo_PF (hors corps de fonction). */
    prepareExcelUpload: publicProcedure.input(z.object({ fileName: importFileNameInput, actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const relKey = `${SILO_IMPORT_PREFIX}${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      if (isVercelBlobConfigured()) return { mode: "vercel-blob" as const, key: relKey };
      const prepared = await storageCreatePresignedUpload(relKey);
      return { mode: "put" as const, key: prepared.key, uploadUrl: prepared.uploadUrl };
    }),
    importExcelFromStorage: publicProcedure.input(z.object({ storageKey: z.string().startsWith(SILO_IMPORT_PREFIX), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const sourceUrl = await storageGetSignedUrl(input.storageKey);
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[SiloImport] Échec de la récupération du fichier téléversé (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
        throw new TRPCError({ code: "BAD_REQUEST", message: `Le fichier Excel téléversé est indisponible (${response.status}). Réessayez l’import.` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Le fichier Excel dépasse la limite de 5,7 Mo." });

      const parsed = await parseSiloWorkbook(buffer);
      if (parsed.entries.length === 0 && parsed.shipments.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Aucun mouvement de silo n’a été trouvé dans le fichier. ${parsed.errors.slice(0, 3).join(" ")}`.trim() });
      }

      const result = await replaceSiloMovements(
        parsed.entries.map((entry) => ({
          entry: {
            entryDate: entry.entryDate ?? null,
            article: entry.article,
            lotNumber: entry.lotNumber ?? null,
            totalQuantity: entry.totalQuantity === undefined ? null : entry.totalQuantity.toFixed(2),
          },
          allocations: entry.allocations,
        })),
        parsed.shipments.map((shipment) => ({
          shipmentDate: shipment.shipmentDate ?? null,
          article: shipment.article,
          lotNumber: shipment.lotNumber ?? null,
          quantity: shipment.quantity.toFixed(2),
          silo: shipment.silo,
          shipmentType: shipment.shipmentType,
        })),
      );

      return { ...result, rejected: parsed.errors.length, rejectedLines: parsed.errors.slice(0, 5) };
    }),
    /** Reconstruit le classeur Silo_PF complet, formules comprises. */
    exportExcel: publicProcedure.query(async () => {
      const [entries, shipments, configuredArticles, movementArticles] = await Promise.all([
        listSiloProductionEntries(),
        listSiloShipments(),
        listActiveProductionArticles(),
        listSiloMovementArticles(),
      ]);
      const configuredCodes = configuredArticles.map((article) => article.code);
      const articles = [...configuredCodes, ...movementArticles.filter((article) => !configuredCodes.includes(article))];
      const workbook = await buildSiloWorkbook(entries, shipments, articles);
      return {
        fileName: `Silo_PF_${new Date().toISOString().slice(0, 10)}.xlsx`,
        fileBase64: workbook.toString("base64"),
      };
    }),
    /** Traçabilité FIFO : quantité restante par lot, silo par silo. */
    lotLedger: publicProcedure.query(async () => {
      const { allocations, shipments } = await loadLotMovements();
      return computeLotLedger(allocations, shipments);
    }),
  }),
  production: router({
    list: publicProcedure.query(() => listProductionRecords()),
    initialize: publicProcedure.mutation(() => initializeSynchronizedExcel()),
    importExcel: publicProcedure.input(z.object({ fileName: z.string().trim().min(1).max(255), fileBase64: z.string().min(1).max(8_000_000), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      if (!/\.xlsx$/i.test(input.fileName)) throw new TRPCError({ code: "BAD_REQUEST", message: "Importez un fichier Excel au format .xlsx." });
      await assertProductionActionAuthorized(input.actionPassword);
      return importWorkbookBuffer(Buffer.from(input.fileBase64, "base64"));
    }),
    prepareExcelUpload: publicProcedure.input(z.object({ fileName: importFileNameInput, actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const relKey = `production-import/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      // Sur Vercel, le navigateur téléverse directement vers Vercel Blob via
      // un jeton de courte durée (route /api/blob-upload) : le fichier ne
      // passe donc jamais par le corps de la fonction. Sans Vercel Blob
      // configuré, on retombe sur une URL PUT présignée classique (Forge ou
      // stockage local en développement).
      if (isVercelBlobConfigured()) {
        return { mode: "vercel-blob" as const, key: relKey };
      }
      const prepared = await storageCreatePresignedUpload(relKey);
      return { mode: "put" as const, key: prepared.key, uploadUrl: prepared.uploadUrl };
    }),
    importExcelFromStorage: publicProcedure.input(z.object({ storageKey: importSourceInput, actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const sourceUrl = await storageGetSignedUrl(input.storageKey);
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[ImportExcel] Échec de la récupération du fichier téléversé (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
        throw new TRPCError({ code: "BAD_REQUEST", message: `Le fichier Excel téléversé est indisponible (${response.status}). Réessayez l’import.` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Le fichier Excel dépasse la limite de 5,7 Mo." });
      return importWorkbookBuffer(buffer);
    }),
    syncFile: publicProcedure.query(() => getSynchronizedExcelFile()),
    verifyActionPassword: publicProcedure.input(z.object({ password: z.string() })).mutation(async ({ input }) => ({
      authorized: await isActionPasswordValid(input.password),
    })),
    create: publicProcedure.input(recordWithCommentInput).mutation(async ({ input }) => {
      const { comment, ...record } = input;
      const created = await createProductionRecord({ ...calculateRecord(record), comment: comment || null, source: "manual" });
      await syncExcelFromRecords();
      return created;
    }),
    update: publicProcedure.input(recordWithCommentInput.safeExtend({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      const { id, comment, actionPassword, ...record } = input;
      await assertProductionActionAuthorized(actionPassword);
      const updated = await updateProductionRecord(id, { ...calculateRecord(record), ...(comment !== undefined ? { comment } : {}) });
      await syncExcelFromRecords();
      return updated;
    }),
    delete: publicProcedure.input(z.object({ id: z.number().int().positive(), actionPassword: z.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const deleted = await deleteProductionRecord(input.id);
      await syncExcelFromRecords();
      return deleted;
    }),
  }),
});

export type AppRouter = typeof appRouter;
