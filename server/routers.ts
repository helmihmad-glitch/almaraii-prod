import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { createProductionRecord, deleteProductionRecord, listProductionRecords, updateProductionRecord } from "./db";
import { getSynchronizedExcelFile, initializeSynchronizedExcel, syncExcelFromRecords } from "./excelSync";

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

export function isCommentPasswordValid(password: string) {
  return Boolean(process.env.COMMENT_EDIT_PASSWORD) && password === process.env.COMMENT_EDIT_PASSWORD;
}

export function assertCommentWriteAuthorized(password: string | undefined) {
  if (!password || !isCommentPasswordValid(password)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Le mot de passe est requis pour ajouter ou modifier un commentaire." });
  }
}

const recordWithCommentInput = recordInput.safeExtend({
  comment: z.string().trim().max(1000, "Le commentaire ne peut pas dépasser 1 000 caractères.").optional(),
  commentPassword: z.string().optional(),
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
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  production: router({
    list: publicProcedure.query(() => listProductionRecords()),
    initialize: publicProcedure.mutation(() => initializeSynchronizedExcel()),
    syncFile: publicProcedure.query(() => getSynchronizedExcelFile()),
    verifyCommentPassword: publicProcedure.input(z.object({ password: z.string() })).mutation(({ input }) => ({
      authorized: isCommentPasswordValid(input.password),
    })),
    create: publicProcedure.input(recordWithCommentInput).mutation(async ({ input }) => {
      const { comment, commentPassword, ...record } = input;
      if (comment) assertCommentWriteAuthorized(commentPassword);
      const created = await createProductionRecord({ ...calculateRecord(record), comment: comment || null, source: "manual" });
      await syncExcelFromRecords();
      return created;
    }),
    update: publicProcedure.input(recordWithCommentInput.safeExtend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const { id, comment, commentPassword, ...record } = input;
      if (comment !== undefined) assertCommentWriteAuthorized(commentPassword);
      const updated = await updateProductionRecord(id, { ...calculateRecord(record), ...(comment !== undefined ? { comment } : {}) });
      await syncExcelFromRecords();
      return updated;
    }),
    delete: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const deleted = await deleteProductionRecord(input.id);
      await syncExcelFromRecords();
      return deleted;
    }),
  }),
});

export type AppRouter = typeof appRouter;
