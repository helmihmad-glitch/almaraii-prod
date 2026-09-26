import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";
import {
  addProductionArticle,
  addProductionOperator,
  addSmsContact,
  addSmsGroup,
  archiveProductionArticle,
  archiveProductionOperator,
  archiveSmsContact,
  archiveSmsGroup,
  createDailyProgram,
  createDailyProgramLine,
  createProductionRecord,
  deleteDailyProgram,
  deleteDailyProgramLine,
  deleteProductionRecord,
  getDailyProgramByDate,
  getProductionSettings,
  getSmsContactsByIds,
  importDailyProgramDay,
  initializeProductionArticles,
  listActiveProductionArticles,
  listActiveProductionOperators,
  listActiveSmsContacts,
  listActiveSmsGroups,
  listDailyPrograms,
  listProductionRecords,
  saveAdminCredentials,
  updateDailyProgram,
  updateDailyProgramLine,
  updateProductionRecord,
  updateSmsGroup,
} from "./db";
import { sendSmsToMany } from "./smsSend";
import { getSynchronizedExcelFile, initializeSynchronizedExcel, syncExcelFromRecords } from "./excelSync";
import { importProductionRows, parseImportedWorkbook, previewProductionImport } from "./excelImport";
import { parseDailyProgramWorkbook } from "./dailyProgramExcel";
import { createActionPasswordDigest, verifyActionPasswordDigest } from "./settingsSecurity";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_DURATION_MS, getAdminSessionCookieOptions, signAdminSession } from "./_core/adminSession";
import { isVercelBlobConfigured, storageCreatePresignedUpload, storageGetSignedUrl } from "./storage";
import {
  addSilo,
  archiveSilo,
  createSiloProductionEntry,
  createSiloShipment,
  createSiloShipmentGroup,
  deleteSiloProductionEntry,
  deleteSiloShipment,
  initializeSilos,
  listActiveSilos,
  listSiloMovementArticles,
  listSiloMovementSilos,
  listSiloProductionEntries,
  listSiloShipments,
  loadLotMovements,
  loadSiloMovements,
  renameSilo,
  replaceSiloMovements,
  setLotManualDepletion,
  updateSiloProductionEntry,
  updateSiloShipment,
} from "./siloDb";
import { buildSiloWorkbook, parseSiloWorkbook } from "./siloExcel";
import { allocateFifoShipment, buildLotLedgerWorkbook, computeLotLedger, manualDepletionWriteOffs } from "./siloLots";
import { buildFilteredRegistryWorkbook, type FilteredRegistryRow } from "./registryExcel";
import { buildShipmentsReportWorkbook } from "./shipmentsReport";
import { extractExpeditionPdfText, importExpeditionShipments, parseExpeditionPdfText } from "./expeditionPdfImport";
import { computeArticleStock, computeShipmentAvailability, computeSiloMatrix, computeSiloOccupancy, computeTotalStock } from "./siloStock";
import { SHIPMENT_TYPES } from "../shared/silo";

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

/**
 * Autorisation unique de toutes les mutations (saisie, modification,
 * suppression, import) : la session admin (cookie posé par auth.login)
 * remplace l'ancien mot de passe d'action séparé, devenu redondant — se
 * connecter une fois suffit désormais pour toute la durée de la session.
 */
function assertAdminSession(ctx: Pick<TrpcContext, "isAdmin">) {
  if (!ctx.isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Connectez-vous en tant qu’administrateur pour effectuer cette action." });
  }
}

/** Bloque une expédition (création ou modification) qui dépasserait le stock réellement disponible dans le silo. */
async function assertShipmentWithinStock(silo: string, article: string, quantity: number, excludeShipmentId?: number) {
  const [{ allocations }, shipmentRows, lotMovements] = await Promise.all([loadSiloMovements(), listSiloShipments(), loadLotMovements()]);
  const shipments = shipmentRows.map((shipment) => ({ id: shipment.id, article: shipment.article, silo: shipment.silo, quantity: Number(shipment.quantity) }));
  // Un lot fermé manuellement (voir manualDepletionWriteOffs) ne doit plus
  // être proposé comme stock disponible pour une nouvelle expédition — un id
  // hors de portée des vraies expéditions, donc jamais retiré par excludeShipmentId.
  const writeOffs = manualDepletionWriteOffs(computeLotLedger(lotMovements.allocations, lotMovements.shipments).lots)
    .map((row, index) => ({ id: -1 - index, ...row }));
  const available = computeShipmentAvailability(allocations, [...shipments, ...writeOffs], silo, article, excludeShipmentId);
  if (quantity > available + 0.005) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `La quantité expédiée (${quantity.toFixed(2)} T) dépasse le stock disponible de ${article} dans ${silo} (${Math.max(available, 0).toFixed(2)} T).`,
    });
  }
}

/**
 * Liste des silos à afficher/exporter : les silos configurés (Réglages),
 * dans l'ordre choisi, puis ceux rencontrés uniquement dans d'anciens
 * mouvements — même principe que les articles (voir listActiveProductionArticles
 * / listSiloMovementArticles) : retirer un silo ne fait jamais disparaître un
 * stock ou un historique déjà enregistré sous ce code.
 */
async function resolveSiloCodes(): Promise<string[]> {
  await initializeSilos();
  const [configured, fromMovements] = await Promise.all([listActiveSilos(), listSiloMovementSilos()]);
  const configuredCodes = configured.map((silo) => silo.code);
  return [...configuredCodes, ...fromMovements.filter((code) => !configuredCodes.includes(code))];
}

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "123456";

/** Vérifie les identifiants admin, avec repli sur admin/123456 tant qu'aucun identifiant n'a été enregistré. */
async function verifyAdminCredentials(username: string, password: string) {
  const settings = await getProductionSettings();
  if (settings?.adminUsername && settings.adminPasswordHash && settings.adminPasswordSalt) {
    return username === settings.adminUsername && verifyActionPasswordDigest(password, { hash: settings.adminPasswordHash, salt: settings.adminPasswordSalt });
  }
  return username === DEFAULT_ADMIN_USERNAME && password === DEFAULT_ADMIN_PASSWORD;
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
const PROGRAM_IMPORT_PREFIX = "program-import/";
const EXPEDITION_PDF_IMPORT_PREFIX = "expedition-pdf-import/";
const importPdfFileNameInput = z.string().trim().min(1).max(255).refine((fileName) => /\.pdf$/i.test(fileName), "Importez un fichier PDF au format .pdf.");
// Silo dynamique (voir settings.listSilos/addSilo/renameSilo/archiveSilo) :
// simple chaîne plutôt qu'un enum figé, comme siloArticleInput pour les
// articles — la liste réellement proposée est celle des silos actifs, gérée
// depuis les Réglages plutôt que fixée à la compilation.
const siloInput = z.string().trim().min(1, "Choisissez un silo.").max(16);
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
  allocations: z.array(z.object({ silo: siloInput, quantity: siloQuantityInput })).max(64),
});
const siloShipmentInput = z.object({
  shipmentDate: optionalDateInput,
  article: siloArticleInput,
  lotNumber: lotNumberInput,
  quantity: siloQuantityInput,
  silo: siloInput,
  shipmentType: z.enum(SHIPMENT_TYPES),
});
/**
 * Une même expédition (un seul « vrac »/camion) répartie manuellement sur
 * plusieurs silos, chacun avec son propre n° de lot connu — à la différence
 * de createShipment, qui ne répartit automatiquement (FIFO) que sur
 * plusieurs LOTS d'un même silo. Le n° de lot est ici obligatoire sur
 * chaque ligne : sans lot connu, la saisie à un seul silo (avec FIFO
 * automatique) reste le bon outil.
 */
const siloShipmentSplitInput = z.object({
  shipmentDate: optionalDateInput,
  article: siloArticleInput,
  shipmentType: z.enum(SHIPMENT_TYPES),
  allocations: z.array(z.object({
    silo: siloInput,
    lotNumber: z.string().trim().min(1, "Indiquez le n° de lot.").max(64),
    quantity: z.number().positive("La quantité doit être positive."),
  })).min(2, "Ajoutez au moins deux répartitions, sinon utilisez la saisie simple.").max(10, "Trop de répartitions pour une seule expédition."),
});

const shipmentReportFilterInput = z.object({
  shipmentType: z.enum(SHIPMENT_TYPES).optional(),
  dateFrom: optionalDateInput,
  dateTo: optionalDateInput,
});

const registryFilterInput = z.object({
  query: z.string().trim().max(200).optional(),
  dateFrom: optionalDateInput,
  dateTo: optionalDateInput,
});

export const EXCEL_IMPORT_MAX_BYTES = 5_700_000;
const importFileNameInput = z.string().trim().min(1).max(255).refine((fileName) => /\.xlsx$/i.test(fileName), "Importez un fichier Excel au format .xlsx.");

const importSourceInput = z.string().startsWith("production-import/");

/** Télécharge et valide la taille d'un fichier précédemment téléversé (voir prepareExcelUpload), partagé par l'aperçu et l'import réel. */
async function fetchImportBuffer(storageKey: string, label: string): Promise<Buffer> {
  const sourceUrl = await storageGetSignedUrl(storageKey);
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[ImportExcel] Échec de la récupération du fichier téléversé (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
    throw new TRPCError({ code: "BAD_REQUEST", message: `Le fichier ${label} téléversé est indisponible (${response.status}). Réessayez l’import.` });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: `Le fichier ${label} dépasse la limite de 5,7 Mo.` });
  return buffer;
}

async function importWorkbookBuffer(buffer: Buffer, applyModifications: boolean) {
  const parsed = await parseImportedWorkbook(buffer);
  if (parsed.rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Aucune ligne de production valide n’a été trouvée dans le fichier. ${parsed.errors.slice(0, 5).join(" ")}`.trim() });
  const result = await importProductionRows(parsed.rows, { applyModifications });
  await syncExcelFromRecords();
  return { ...result, rejected: parsed.errors.length, rejectedLines: parsed.errors.slice(0, 5) };
}

/** Aperçu (sans écrire) d'un import Excel du registre — voir previewProductionImport. */
async function previewWorkbookBuffer(buffer: Buffer) {
  const parsed = await parseImportedWorkbook(buffer);
  if (parsed.rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Aucune ligne de production valide n’a été trouvée dans le fichier. ${parsed.errors.slice(0, 5).join(" ")}`.trim() });
  const preview = await previewProductionImport(parsed.rows);
  return { ...preview, rejected: parsed.errors.length, rejectedLines: parsed.errors.slice(0, 5) };
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
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.isAdmin) return { role: "visiteur" as const, username: null };
      const settings = await getProductionSettings();
      return { role: "admin" as const, username: settings?.adminUsername || DEFAULT_ADMIN_USERNAME };
    }),
    login: publicProcedure.input(z.object({ username: z.string().trim().min(1, "Indiquez l’identifiant."), password: z.string().min(1, "Indiquez le mot de passe.") })).mutation(async ({ ctx, input }) => {
      const valid = await verifyAdminCredentials(input.username, input.password);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Identifiant ou mot de passe incorrect." });
      const token = await signAdminSession();
      ctx.res.cookie(ADMIN_SESSION_COOKIE, token, { ...getAdminSessionCookieOptions(ctx.req), maxAge: ADMIN_SESSION_DURATION_MS });
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(ADMIN_SESSION_COOKIE, getAdminSessionCookieOptions(ctx.req));
      return { success: true } as const;
    }),
    changeAdminCredentials: publicProcedure.input(z.object({
      currentPassword: z.string().min(1, "Indiquez le mot de passe actuel."),
      newUsername: z.string().trim().min(1, "Indiquez un identifiant.").max(64),
      newPassword: z.string().min(6, "Le nouveau mot de passe doit contenir au moins 6 caractères.").max(128),
    })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const settings = await getProductionSettings();
      const currentValid = settings?.adminUsername && settings.adminPasswordHash && settings.adminPasswordSalt
        ? verifyActionPasswordDigest(input.currentPassword, { hash: settings.adminPasswordHash, salt: settings.adminPasswordSalt })
        : input.currentPassword === DEFAULT_ADMIN_PASSWORD;
      if (!currentValid) throw new TRPCError({ code: "FORBIDDEN", message: "Mot de passe actuel incorrect." });
      await saveAdminCredentials(input.newUsername, createActionPasswordDigest(input.newPassword));
      return { success: true } as const;
    }),
  }),
  settings: router({
    listArticles: publicProcedure.query(async () => {
      await initializeProductionArticles();
      return listActiveProductionArticles();
    }),
    addArticle: publicProcedure.input(z.object({ code: z.string().trim().min(1, "Saisissez un article.").max(64) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return addProductionArticle(input.code);
    }),
    archiveArticle: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return archiveProductionArticle(input.id);
    }),
    listOperators: publicProcedure.query(() => listActiveProductionOperators()),
    addOperator: publicProcedure.input(z.object({ name: z.string().trim().min(1, "Saisissez un pupitreur.").max(128) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return addProductionOperator(input.name);
    }),
    archiveOperator: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return archiveProductionOperator(input.id);
    }),
    listSilos: publicProcedure.query(async () => {
      await initializeSilos();
      return listActiveSilos();
    }),
    addSilo: publicProcedure.input(z.object({ code: z.string().trim().min(1, "Saisissez un silo.").max(16) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return addSilo(input.code);
    }),
    /** Renomme un silo : le nouveau code remplace l'ancien dans les entrées et expéditions déjà enregistrées (voir renameSilo). */
    renameSilo: publicProcedure.input(z.object({ id: z.number().int().positive(), code: z.string().trim().min(1, "Saisissez un silo.").max(16) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const updated = await renameSilo(input.id, input.code);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Ce silo est introuvable." });
      return updated;
    }),
    archiveSilo: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return archiveSilo(input.id);
    }),
    listSmsContacts: publicProcedure.query(() => listActiveSmsContacts()),
    addSmsContact: publicProcedure.input(z.object({
      name: z.string().trim().min(1, "Saisissez un nom.").max(128),
      phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Utilisez le format international, ex. +21612345678."),
    })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return addSmsContact(input.name, input.phone);
    }),
    archiveSmsContact: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return archiveSmsContact(input.id);
    }),
    listSmsGroups: publicProcedure.query(() => listActiveSmsGroups()),
    addSmsGroup: publicProcedure.input(z.object({
      name: z.string().trim().min(1, "Saisissez un nom de groupe.").max(128),
      contactIds: z.array(z.number().int().positive()).min(1, "Ajoutez au moins un contact au groupe."),
    })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return addSmsGroup(input.name, input.contactIds);
    }),
    updateSmsGroup: publicProcedure.input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(1, "Saisissez un nom de groupe.").max(128),
      contactIds: z.array(z.number().int().positive()).min(1, "Ajoutez au moins un contact au groupe."),
    })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const updated = await updateSmsGroup(input.id, input.name, input.contactIds);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Ce groupe est introuvable." });
      return updated;
    }),
    archiveSmsGroup: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return archiveSmsGroup(input.id);
    }),
  }),
  dailyProgram: router({
    list: publicProcedure.query(() => listDailyPrograms()),
    byDate: publicProcedure.input(z.object({ programDate: dateInput })).query(({ input }) => getDailyProgramByDate(input.programDate)),
    create: publicProcedure.input(dailyProgramInput).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return createDailyProgram(input);
    }),
    update: publicProcedure.input(dailyProgramInput.safeExtend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { id, ...program } = input;
      return updateDailyProgram(id, program);
    }),
    delete: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return deleteDailyProgram(input.id);
    }),
    createLine: publicProcedure.input(dailyProgramLineInput).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return createDailyProgramLine(input);
    }),
    updateLine: publicProcedure.input(dailyProgramLineInput.safeExtend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { id, ...line } = input;
      return updateDailyProgramLine(id, line);
    }),
    deleteLine: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return deleteDailyProgramLine(input.id);
    }),
    /** Prépare le téléversement direct du classeur Programme de Production (hors corps de fonction). */
    prepareExcelUpload: publicProcedure.input(z.object({ fileName: importFileNameInput })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const relKey = `${PROGRAM_IMPORT_PREFIX}${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      if (isVercelBlobConfigured()) return { mode: "vercel-blob" as const, key: relKey };
      const prepared = await storageCreatePresignedUpload(relKey);
      return { mode: "put" as const, key: prepared.key, uploadUrl: prepared.uploadUrl };
    }),
    /** Lit le classeur téléversé : chaque journée trouvée remplace intégralement le programme existant à cette date. */
    importExcelFromStorage: publicProcedure.input(z.object({ storageKey: z.string().startsWith(PROGRAM_IMPORT_PREFIX) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const sourceUrl = await storageGetSignedUrl(input.storageKey);
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[ProgramImport] Échec de la récupération du fichier téléversé (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
        throw new TRPCError({ code: "BAD_REQUEST", message: `Le fichier Excel téléversé est indisponible (${response.status}). Réessayez l’import.` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Le fichier Excel dépasse la limite de 5,7 Mo." });

      const parsed = await parseDailyProgramWorkbook(buffer);
      if (parsed.days.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Aucune journée de programme n’a été trouvée dans le fichier. ${parsed.errors.slice(0, 3).join(" ")}`.trim() });
      }

      // Séquentiel, pas Promise.all : si une date apparaît deux fois dans le fichier, c'est la
      // dernière occurrence rencontrée dans l'ordre du classeur qui doit l'emporter.
      for (const day of parsed.days) {
        await importDailyProgramDay({ programDate: day.programDate, operatorName: day.operatorName, lines: day.lines });
      }

      return {
        days: parsed.days.length,
        lines: parsed.days.reduce((sum, day) => sum + day.lines.length, 0),
        rejected: parsed.errors.length,
        rejectedLines: parsed.errors.slice(0, 8),
      };
    }),
  }),
  silo: router({
    /** État courant des silos : matrice, occupation et stock par article. */
    state: publicProcedure.query(async () => {
      const [{ allocations, shipments }, lotMovements, configuredArticles, movementArticles, siloCodes] = await Promise.all([
        loadSiloMovements(),
        loadLotMovements(),
        listActiveProductionArticles(),
        listSiloMovementArticles(),
        resolveSiloCodes(),
      ]);
      // Les articles configurés donnent l’ordre des colonnes ; ceux rencontrés
      // uniquement dans d’anciens mouvements restent visibles à la suite.
      const configuredCodes = configuredArticles.map((article) => article.code);
      const articles = [...configuredCodes, ...movementArticles.filter((article) => !configuredCodes.includes(article))];
      // Un lot fermé manuellement dans la traçabilité des lots ne doit plus
      // apparaître comme stock disponible ici (voir manualDepletionWriteOffs).
      const writeOffs = manualDepletionWriteOffs(computeLotLedger(lotMovements.allocations, lotMovements.shipments).lots);
      const matrix = computeSiloMatrix(allocations, [...shipments, ...writeOffs], siloCodes, articles);
      const occupancy = computeSiloOccupancy(matrix, siloCodes, articles);
      return {
        silos: siloCodes,
        articles,
        matrix,
        occupancy,
        articleStock: computeArticleStock(occupancy, articles),
        totalStock: computeTotalStock(occupancy),
      };
    }),
    listEntries: publicProcedure.query(() => listSiloProductionEntries()),
    createEntry: publicProcedure.input(siloEntryInput).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { allocations, totalQuantity, ...entry } = input;
      return createSiloProductionEntry({ ...entry, totalQuantity: totalQuantity === undefined ? null : totalQuantity.toFixed(2) }, allocations);
    }),
    updateEntry: publicProcedure.input(siloEntryInput.safeExtend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { id, allocations, totalQuantity, ...entry } = input;
      return updateSiloProductionEntry(id, { ...entry, totalQuantity: totalQuantity === undefined ? null : totalQuantity.toFixed(2) }, allocations);
    }),
    deleteEntry: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return deleteSiloProductionEntry(input.id);
    }),
    listShipments: publicProcedure.query(() => listSiloShipments()),
    /**
     * Sans N° Lot précisé, la quantité est répartie sur les lots actifs les
     * plus anciens d'abord (FIFO) — une ligne d'expédition par lot réellement
     * entamé plutôt qu'une seule ligne portant un lot arbitraire (voir
     * allocateFifoShipment dans siloLots.ts) ; le classeur Silo_PF reflète
     * alors correctement chaque lot touché sans traitement supplémentaire,
     * puisqu'il liste simplement les lignes d'expédition telles quelles.
     * Un N° Lot précisé explicitement (correction, cas particulier) garde le
     * comportement d'une seule ligne.
     */
    createShipment: publicProcedure.input(siloShipmentInput).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      await assertShipmentWithinStock(input.silo, input.article, input.quantity);
      const { quantity, lotNumber, ...shipment } = input;
      if (lotNumber) {
        const created = await createSiloShipment({ ...shipment, lotNumber, quantity: quantity.toFixed(2) });
        return { shipments: [created] };
      }

      const date = shipment.shipmentDate ?? new Date().toISOString().slice(0, 10);
      const lotMovements = await loadLotMovements();
      const ledger = computeLotLedger(
        lotMovements.allocations.filter((allocation) => !allocation.entryDate || allocation.entryDate <= date),
        lotMovements.shipments.filter((movement) => !movement.shipmentDate || movement.shipmentDate <= date),
      );
      const chunks = allocateFifoShipment(ledger.lots, shipment.article, shipment.silo, quantity);
      // Reliées par un splitGroupId partagé (voir createSiloShipmentGroup) :
      // seule cette saisie précise s'affiche comme une expédition répartie sur
      // plusieurs lots, jamais une autre qui partagerait par coïncidence la
      // même date, le même article, le même silo et le même type.
      const created = await createSiloShipmentGroup(chunks.map((chunk) => ({ ...shipment, lotNumber: chunk.lotNumber ?? undefined, quantity: chunk.quantity.toFixed(2) })));
      return { shipments: created };
    }),
    /** Voir siloShipmentSplitInput : une seule expédition, plusieurs silos, un n° de lot connu par ligne. */
    createSplitShipment: publicProcedure.input(siloShipmentSplitInput).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { allocations, ...shipment } = input;
      const quantityBySilo = new Map<string, number>();
      allocations.forEach((allocation) => quantityBySilo.set(allocation.silo, (quantityBySilo.get(allocation.silo) ?? 0) + allocation.quantity));
      await Promise.all(Array.from(quantityBySilo.entries()).map(([silo, quantity]) => assertShipmentWithinStock(silo, shipment.article, quantity)));

      const created = await createSiloShipmentGroup(allocations.map((allocation) => ({ ...shipment, silo: allocation.silo, lotNumber: allocation.lotNumber, quantity: allocation.quantity.toFixed(2) })));
      return { shipments: created };
    }),
    updateShipment: publicProcedure.input(siloShipmentInput.safeExtend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      await assertShipmentWithinStock(input.silo, input.article, input.quantity, input.id);
      const { id, quantity, ...shipment } = input;
      return updateSiloShipment(id, { ...shipment, quantity: quantity.toFixed(2) });
    }),
    deleteShipment: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return deleteSiloShipment(input.id);
    }),
    /** Prépare le téléversement direct du classeur Silo_PF (hors corps de fonction). */
    prepareExcelUpload: publicProcedure.input(z.object({ fileName: importFileNameInput })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const relKey = `${SILO_IMPORT_PREFIX}${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      if (isVercelBlobConfigured()) return { mode: "vercel-blob" as const, key: relKey };
      const prepared = await storageCreatePresignedUpload(relKey);
      return { mode: "put" as const, key: prepared.key, uploadUrl: prepared.uploadUrl };
    }),
    importExcelFromStorage: publicProcedure.input(z.object({ storageKey: z.string().startsWith(SILO_IMPORT_PREFIX) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const sourceUrl = await storageGetSignedUrl(input.storageKey);
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[SiloImport] Échec de la récupération du fichier téléversé (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
        throw new TRPCError({ code: "BAD_REQUEST", message: `Le fichier Excel téléversé est indisponible (${response.status}). Réessayez l’import.` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Le fichier Excel dépasse la limite de 5,7 Mo." });

      const parsed = await parseSiloWorkbook(buffer, await resolveSiloCodes());
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
    /** Prépare le téléversement direct d'un rapport PDF « Traçabilité Expédition » (hors corps de fonction). */
    preparePdfUpload: publicProcedure.input(z.object({ fileName: importPdfFileNameInput })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const relKey = `${EXPEDITION_PDF_IMPORT_PREFIX}${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      if (isVercelBlobConfigured()) return { mode: "vercel-blob" as const, key: relKey };
      const prepared = await storageCreatePresignedUpload(relKey);
      return { mode: "put" as const, key: prepared.key, uploadUrl: prepared.uploadUrl };
    }),
    /**
     * Lit un rapport PDF « Traçabilité Expédition » (système de pesée externe) :
     * chaque expédition qu'il contient (date, article, quantité, silo) est
     * ajoutée en type Vrac, avec un numéro de lot recalculé depuis le grand
     * livre FIFO de l'application plutôt que repris du PDF — voir
     * expeditionPdfImport.ts.
     */
    importExpeditionPdf: publicProcedure.input(z.object({ storageKey: z.string().startsWith(EXPEDITION_PDF_IMPORT_PREFIX) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const sourceUrl = await storageGetSignedUrl(input.storageKey);
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[ExpeditionPdfImport] Échec de la récupération du fichier téléversé (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
        throw new TRPCError({ code: "BAD_REQUEST", message: `Le fichier PDF téléversé est indisponible (${response.status}). Réessayez l’import.` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Le fichier PDF dépasse la limite de 5,7 Mo." });

      const text = await extractExpeditionPdfText(buffer);
      const parsed = parseExpeditionPdfText(text);
      if (parsed.shipments.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Aucune expédition n’a été trouvée dans le PDF. ${parsed.errors.slice(0, 3).join(" ")}`.trim() });
      }

      const result = await importExpeditionShipments(parsed.shipments);
      return { ...result, rejected: parsed.errors.length, rejectedLines: parsed.errors.slice(0, 5) };
    }),
    /** Reconstruit le classeur Silo_PF complet, formules comprises. */
    exportExcel: publicProcedure.query(async () => {
      const [entries, shipments, configuredArticles, movementArticles, siloCodes] = await Promise.all([
        listSiloProductionEntries(),
        listSiloShipments(),
        listActiveProductionArticles(),
        listSiloMovementArticles(),
        resolveSiloCodes(),
      ]);
      const configuredCodes = configuredArticles.map((article) => article.code);
      const articles = [...configuredCodes, ...movementArticles.filter((article) => !configuredCodes.includes(article))];
      const workbook = await buildSiloWorkbook(entries, shipments, articles, siloCodes);
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
    /**
     * Ferme (ou rouvre) manuellement un lot, indépendamment de ce que les
     * sorties enregistrées couvrent réellement — voir la note sur
     * LotBalance.manuallyDepleted dans siloLots.ts.
     */
    setLotDepletion: publicProcedure.input(z.object({ entryId: z.number().int().positive(), silo: siloInput, manuallyDepleted: z.boolean() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const updated = await setLotManualDepletion(input.entryId, input.silo, input.manuallyDepleted);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Ce lot est introuvable pour ce silo." });
      return updated;
    }),
    /** Export Excel de la traçabilité des lots (une ligne par lot). */
    exportLotLedger: publicProcedure.query(async () => {
      const [{ allocations, shipments }, siloCodes] = await Promise.all([loadLotMovements(), resolveSiloCodes()]);
      const ledger = computeLotLedger(allocations, shipments);
      const workbook = await buildLotLedgerWorkbook(ledger, siloCodes);
      return {
        fileName: `Tracabilite_Lots_${new Date().toISOString().slice(0, 10)}.xlsx`,
        fileBase64: workbook.toString("base64"),
      };
    }),
    /** Export Excel des expéditions filtrées par type (Vrac/Sac) et par période, comme depuis Ajouter une expédition. */
    exportShipmentsReport: publicProcedure.input(shipmentReportFilterInput).query(async ({ input }) => {
      const shipments = await listSiloShipments();
      const filtered = shipments
        .filter((shipment) => !input.shipmentType || shipment.shipmentType === input.shipmentType)
        .filter((shipment) => !input.dateFrom || (shipment.shipmentDate ?? "") >= input.dateFrom)
        .filter((shipment) => !input.dateTo || (shipment.shipmentDate ?? "") <= input.dateTo);
      const workbook = await buildShipmentsReportWorkbook(
        filtered.map((shipment) => ({
          shipmentDate: shipment.shipmentDate,
          article: shipment.article,
          lotNumber: shipment.lotNumber,
          quantity: Number(shipment.quantity),
          silo: shipment.silo,
          shipmentType: shipment.shipmentType,
          splitGroupId: shipment.splitGroupId,
        })),
        input,
      );
      return {
        fileName: `Expeditions_${new Date().toISOString().slice(0, 10)}.xlsx`,
        fileBase64: workbook.toString("base64"),
      };
    }),
  }),
  production: router({
    list: publicProcedure.query(() => listProductionRecords()),
    initialize: publicProcedure.mutation(() => initializeSynchronizedExcel()),
    importExcel: publicProcedure.input(z.object({ fileName: z.string().trim().min(1).max(255), fileBase64: z.string().min(1).max(8_000_000), applyModifications: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      if (!/\.xlsx$/i.test(input.fileName)) throw new TRPCError({ code: "BAD_REQUEST", message: "Importez un fichier Excel au format .xlsx." });
      assertAdminSession(ctx);
      return importWorkbookBuffer(Buffer.from(input.fileBase64, "base64"), input.applyModifications ?? false);
    }),
    prepareExcelUpload: publicProcedure.input(z.object({ fileName: importFileNameInput })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
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
    /**
     * Aperçu de l'import sans rien écrire : combien de lignes seraient
     * ajoutées, combien correspondent à une modification d'une ligne
     * existante (avec le détail des champs) et combien sont déjà identiques.
     * Le registre demande la confirmation de l'utilisateur avant d'appeler
     * importExcelFromStorage avec applyModifications s'il y a des lignes à
     * modifier (voir Registry.tsx) — les lignes nouvelles, elles, s'ajoutent
     * toujours sans confirmation supplémentaire.
     */
    previewExcelFromStorage: publicProcedure.input(z.object({ storageKey: importSourceInput })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return previewWorkbookBuffer(await fetchImportBuffer(input.storageKey, "Excel"));
    }),
    importExcelFromStorage: publicProcedure.input(z.object({ storageKey: importSourceInput, applyModifications: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return importWorkbookBuffer(await fetchImportBuffer(input.storageKey, "Excel"), input.applyModifications ?? false);
    }),
    syncFile: publicProcedure.query(() => getSynchronizedExcelFile()),
    /** Export Excel du registre filtré (page Rapports) : même recherche/période que le Registre. */
    exportFilteredExcel: publicProcedure.input(registryFilterInput).query(async ({ input }) => {
      const queryLower = input.query?.toLowerCase();
      const rows: FilteredRegistryRow[] = (await listProductionRecords())
        .map((record) => ({ ...record, productionDate: record.productionDate.slice(0, 10) }))
        .filter((record) =>
          (!queryLower || record.article.toLowerCase().includes(queryLower) || record.productionDate.includes(queryLower) || record.comment?.toLowerCase().includes(queryLower))
          && (!input.dateFrom || record.productionDate >= input.dateFrom)
          && (!input.dateTo || record.productionDate <= input.dateTo))
        .sort((a, b) => b.productionDate.localeCompare(a.productionDate) || b.id - a.id)
        .map((record) => ({
          productionDate: record.productionDate,
          article: record.article,
          productionTons: Number(record.productionTons),
          wasteTons: Number(record.wasteTons),
          availability: Number(record.availability),
          trs: Number(record.trs),
          comment: record.comment,
        }));
      const workbook = await buildFilteredRegistryWorkbook(rows, input);
      return {
        fileName: `Registre_Filtre_${new Date().toISOString().slice(0, 10)}.xlsx`,
        fileBase64: workbook.toString("base64"),
      };
    }),
    create: publicProcedure.input(recordWithCommentInput).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { comment, ...record } = input;
      const created = await createProductionRecord({ ...calculateRecord(record), comment: comment || null, source: "manual" });
      await syncExcelFromRecords();
      return created;
    }),
    update: publicProcedure.input(recordWithCommentInput.safeExtend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { id, comment, ...record } = input;
      const updated = await updateProductionRecord(id, { ...calculateRecord(record), ...(comment !== undefined ? { comment } : {}) });
      await syncExcelFromRecords();
      return updated;
    }),
    delete: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const deleted = await deleteProductionRecord(input.id);
      await syncExcelFromRecords();
      return deleted;
    }),
  }),
  sms: router({
    /** Envoi via TextBee (voir server/smsSend.ts) : les numéros viennent des contacts enregistrés (settings.listSmsContacts), jamais d'une saisie libre côté client. */
    send: publicProcedure.input(z.object({
      contactIds: z.array(z.number().int().positive()).min(1, "Choisissez au moins un contact."),
      message: z.string().trim().min(1, "Saisissez un message.").max(480),
    })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const contacts = await getSmsContactsByIds(input.contactIds);
      if (contacts.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Aucun contact valide sélectionné." });
      const results = await sendSmsToMany(contacts.map((contact) => contact.phone), input.message);
      const withNames = results.map((result, index) => ({ ...result, name: contacts[index].name }));
      return {
        sent: withNames.filter((result) => result.success).length,
        failed: withNames.filter((result) => !result.success).length,
        results: withNames,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
