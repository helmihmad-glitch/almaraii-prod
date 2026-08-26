import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  addProductionArticle,
  archiveProductionArticle,
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
  if (settings?.actionPasswordHash && settings.actionPasswordSalt) {
    return verifyActionPasswordDigest(password, { hash: settings.actionPasswordHash, salt: settings.actionPasswordSalt });
  }
  return Boolean(process.env.COMMENT_EDIT_PASSWORD) && password === process.env.COMMENT_EDIT_PASSWORD;
}

export async function assertProductionActionAuthorized(password: string | undefined) {
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
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  settings: router({
    listArticles: publicProcedure.query(async () => {
      await initializeProductionArticles();
      return listActiveProductionArticles();
    }),
    addArticle: publicProcedure.input(z.object({ code: z.string().trim().min(1, "Saisissez un article.").max(64), actionPassword: z.string().min(1) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return addProductionArticle(input.code);
    }),
    archiveArticle: publicProcedure.input(z.object({ id: z.number().int().positive(), actionPassword: z.string().min(1) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return archiveProductionArticle(input.id);
    }),
    changeActionPassword: publicProcedure.input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6, "Le nouveau mot de passe doit contenir au moins 6 caractères.").max(128) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.currentPassword);
      await saveActionPasswordDigest(createActionPasswordDigest(input.newPassword));
      return { success: true } as const;
    }),
  }),
  dailyProgram: router({
    list: publicProcedure.query(() => listDailyPrograms()),
    byDate: publicProcedure.input(z.object({ programDate: dateInput })).query(({ input }) => getDailyProgramByDate(input.programDate)),
    create: publicProcedure.input(dailyProgramInput.safeExtend({ actionPassword: z.string().min(1) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { actionPassword, ...program } = input;
      return createDailyProgram(program);
    }),
    update: publicProcedure.input(dailyProgramInput.safeExtend({ id: z.number().int().positive(), actionPassword: z.string().min(1) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { id, actionPassword, ...program } = input;
      return updateDailyProgram(id, program);
    }),
    delete: publicProcedure.input(z.object({ id: z.number().int().positive(), actionPassword: z.string().min(1) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return deleteDailyProgram(input.id);
    }),
    createLine: publicProcedure.input(dailyProgramLineInput.safeExtend({ actionPassword: z.string().min(1) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { actionPassword, ...line } = input;
      return createDailyProgramLine(line);
    }),
    updateLine: publicProcedure.input(dailyProgramLineInput.safeExtend({ id: z.number().int().positive(), actionPassword: z.string().min(1) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { id, actionPassword, ...line } = input;
      return updateDailyProgramLine(id, line);
    }),
    deleteLine: publicProcedure.input(z.object({ id: z.number().int().positive(), actionPassword: z.string().min(1) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return deleteDailyProgramLine(input.id);
    }),
  }),
  production: router({
    list: publicProcedure.query(() => listProductionRecords()),
    initialize: publicProcedure.mutation(() => initializeSynchronizedExcel()),
    importExcel: publicProcedure.input(z.object({ fileName: z.string().trim().min(1).max(255), fileBase64: z.string().min(1).max(8_000_000), actionPassword: z.string().min(1) })).mutation(async ({ input }) => {
      if (!/\.xlsx$/i.test(input.fileName)) throw new TRPCError({ code: "BAD_REQUEST", message: "Importez un fichier Excel au format .xlsx." });
      await assertProductionActionAuthorized(input.actionPassword);
      const parsed = await parseImportedWorkbook(Buffer.from(input.fileBase64, "base64"));
      if (parsed.rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Aucune ligne de production valide n’a été trouvée dans le fichier. ${parsed.errors.slice(0, 5).join(" ")}`.trim() });
      const result = await importProductionRows(parsed.rows);
      await syncExcelFromRecords();
      return { ...result, rejected: parsed.errors.length, rejectedLines: parsed.errors.slice(0, 5) };
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
