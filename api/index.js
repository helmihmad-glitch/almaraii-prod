// server/_core/app.ts
import express2 from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/_core/blobUpload.ts
import { issueSignedToken as issueSignedToken2 } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";

// server/routers.ts
import { z as z2 } from "zod";
import { TRPCError as TRPCError2 } from "@trpc/server";

// server/_core/systemRouter.ts
import { z } from "zod";

// shared/const.ts
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  }))
});

// server/db.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

// drizzle/schema.ts
import { boolean, decimal, index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
var userRole = pgEnum("role", ["user", "admin"]);
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var productionRecords = pgTable("production_records", {
  id: serial("id").primaryKey(),
  productionDate: varchar("productionDate", { length: 10 }).notNull(),
  article: varchar("article", { length: 64 }).notNull(),
  totalProductionHours: decimal("totalProductionHours", { precision: 10, scale: 2 }).notNull(),
  plannedStopsHours: decimal("plannedStopsHours", { precision: 10, scale: 2 }).notNull().default("0"),
  unplannedStopsHours: decimal("unplannedStopsHours", { precision: 10, scale: 2 }).notNull().default("0"),
  productionTons: decimal("productionTons", { precision: 10, scale: 2 }).notNull(),
  wasteTons: decimal("wasteTons", { precision: 10, scale: 2 }).notNull().default("0"),
  standardRate: decimal("standardRate", { precision: 10, scale: 2 }).notNull(),
  availability: decimal("availability", { precision: 8, scale: 6 }).notNull(),
  performance: decimal("performance", { precision: 8, scale: 6 }).notNull(),
  quality: decimal("quality", { precision: 8, scale: 6 }).notNull(),
  trs: decimal("trs", { precision: 8, scale: 6 }).notNull(),
  realHours: decimal("realHours", { precision: 10, scale: 2 }).notNull(),
  comment: text("comment"),
  source: varchar("source", { length: 16 }).notNull().default("manual"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var synchronizedExcelFiles = pgTable("synchronized_excel_files", {
  id: integer("id").primaryKey(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  downloadUrl: varchar("downloadUrl", { length: 1024 }).notNull(),
  recordCount: integer("recordCount").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var productionArticles = pgTable("production_articles", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 64 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
}, (table) => [uniqueIndex("production_articles_code_unique").on(table.code)]);
var productionOperators = pgTable("production_operators", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
}, (table) => [uniqueIndex("production_operators_name_unique").on(table.name)]);
var productionSettings = pgTable("production_settings", {
  id: integer("id").primaryKey(),
  /** Identifiants admin (rôle admin/visiteur) — sans ligne stockée, "admin" / "123456" fait office de valeur par défaut. La session admin qu'ils ouvrent est désormais la seule autorisation exigée pour saisir, modifier, supprimer ou importer (l'ancien mot de passe d'action séparé a été retiré). */
  adminUsername: varchar("adminUsername", { length: 64 }),
  adminPasswordHash: varchar("adminPasswordHash", { length: 128 }),
  adminPasswordSalt: varchar("adminPasswordSalt", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var dailyPrograms = pgTable("daily_programs", {
  id: serial("id").primaryKey(),
  programDate: varchar("programDate", { length: 10 }).notNull(),
  operatorName: text("operatorName").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
}, (table) => [uniqueIndex("daily_programs_date_unique").on(table.programDate)]);
var dailyProgramLines = pgTable("daily_program_lines", {
  id: serial("id").primaryKey(),
  programId: integer("programId").notNull(),
  sequence: integer("sequence").notNull().default(1),
  article: varchar("article", { length: 64 }),
  version: varchar("version", { length: 64 }),
  bagQuantity: varchar("bagQuantity", { length: 128 }),
  bulkQuantity: varchar("bulkQuantity", { length: 128 }),
  plannedStart: varchar("plannedStart", { length: 5 }).notNull(),
  plannedEnd: varchar("plannedEnd", { length: 5 }).notNull(),
  observation: text("observation"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
}, (table) => [index("daily_program_lines_program_sequence_index").on(table.programId, table.sequence)]);
var silos = pgTable("silos", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 16 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
}, (table) => [uniqueIndex("silos_code_unique").on(table.code)]);
var siloProductionEntries = pgTable("silo_production_entries", {
  id: serial("id").primaryKey(),
  entryDate: varchar("entryDate", { length: 10 }),
  article: varchar("article", { length: 64 }).notNull(),
  lotNumber: varchar("lotNumber", { length: 64 }),
  totalQuantity: decimal("totalQuantity", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
}, (table) => [index("silo_production_entries_date_index").on(table.entryDate)]);
var siloProductionAllocations = pgTable("silo_production_allocations", {
  id: serial("id").primaryKey(),
  entryId: integer("entryId").notNull(),
  silo: varchar("silo", { length: 16 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  // Ferme manuellement ce lot (silo par silo) indépendamment de ce que le
  // grand livre FIFO calcule à partir des sorties enregistrées — voir
  // computeLotLedger dans server/siloLots.ts. La quantité produite d'origine
  // et les sorties réelles restent inchangées ; seuls le statut affiché et la
  // quantité restante sont forcés, pour garder un historique honnête.
  manuallyDepleted: boolean("manuallyDepleted").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
}, (table) => [index("silo_production_allocations_entry_index").on(table.entryId, table.silo)]);
var siloShipments = pgTable("silo_shipments", {
  id: serial("id").primaryKey(),
  shipmentDate: varchar("shipmentDate", { length: 10 }),
  article: varchar("article", { length: 64 }).notNull(),
  lotNumber: varchar("lotNumber", { length: 64 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  silo: varchar("silo", { length: 16 }).notNull(),
  shipmentType: varchar("shipmentType", { length: 8 }).notNull(),
  // Identifiant partagé par les lignes créées ensemble par une même saisie
  // répartie automatiquement sur plusieurs lots (voir allocateFifoShipment,
  // createSiloShipmentGroup) — l'id de la première ligne du groupe. Nul pour
  // une expédition saisie seule : deux expéditions distinctes qui partagent
  // par ailleurs la même date, le même article, le même silo et le même type
  // (des sorties du même jour sans rapport entre elles) ne doivent jamais être
  // affichées comme une seule expédition repartie sur plusieurs lots.
  splitGroupId: integer("splitGroupId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
}, (table) => [index("silo_shipments_date_index").on(table.shipmentDate)]);

// server/_core/env.ts
var ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production"
};

// server/db.ts
var _db = null;
var fallbackDataPath = path.resolve(process.cwd(), process.env.VITEST ? ".local-production-store.test.json" : ".local-production-store.json");
function loadFallbackStore() {
  if (!existsSync(fallbackDataPath)) {
    return {
      articles: [],
      operators: [],
      records: [],
      settings: void 0,
      synchronizedFile: void 0,
      dailyPrograms: [],
      dailyProgramLines: [],
      nextArticleId: 1,
      nextOperatorId: 1,
      nextRecordId: 1,
      nextDailyProgramId: 1,
      nextDailyProgramLineId: 1
    };
  }
  try {
    const raw = readFileSync(fallbackDataPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      articles: parsed.articles ?? [],
      operators: parsed.operators ?? [],
      records: parsed.records ?? [],
      settings: parsed.settings,
      synchronizedFile: parsed.synchronizedFile,
      dailyPrograms: parsed.dailyPrograms ?? [],
      dailyProgramLines: parsed.dailyProgramLines ?? [],
      nextArticleId: parsed.nextArticleId ?? 1,
      nextOperatorId: parsed.nextOperatorId ?? 1,
      nextRecordId: parsed.nextRecordId ?? 1,
      nextDailyProgramId: parsed.nextDailyProgramId ?? 1,
      nextDailyProgramLineId: parsed.nextDailyProgramLineId ?? 1
    };
  } catch {
    return {
      articles: [],
      operators: [],
      records: [],
      settings: void 0,
      synchronizedFile: void 0,
      dailyPrograms: [],
      dailyProgramLines: [],
      nextArticleId: 1,
      nextOperatorId: 1,
      nextRecordId: 1,
      nextDailyProgramId: 1,
      nextDailyProgramLineId: 1
    };
  }
}
var fallbackPersistenceWarned = false;
function persistFallbackStore() {
  const directory = path.dirname(fallbackDataPath);
  const payload = JSON.stringify({
    articles: fallbackArticles,
    operators: fallbackOperators,
    records: fallbackRecords,
    settings: fallbackSettings,
    synchronizedFile: fallbackSynchronizedFile,
    dailyPrograms: fallbackDailyPrograms,
    dailyProgramLines: fallbackDailyProgramLines,
    nextArticleId: nextFallbackArticleId,
    nextOperatorId: nextFallbackOperatorId,
    nextRecordId: nextFallbackRecordId,
    nextDailyProgramId: nextFallbackDailyProgramId,
    nextDailyProgramLineId: nextFallbackDailyProgramLineId
  }, null, 2);
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(fallbackDataPath, payload, "utf8");
  } catch (error) {
    if (!fallbackPersistenceWarned) {
      fallbackPersistenceWarned = true;
      console.warn("[Database] Stockage de secours non persistable (syst\xE8me de fichiers en lecture seule). Configurez DATABASE_URL pour conserver les donn\xE9es :", error);
    }
  }
}
var persistedFallback = loadFallbackStore();
var fallbackArticles = persistedFallback.articles;
var fallbackOperators = persistedFallback.operators;
var fallbackRecords = persistedFallback.records;
var fallbackSettings = persistedFallback.settings;
var fallbackSynchronizedFile = persistedFallback.synchronizedFile;
var fallbackDailyPrograms = persistedFallback.dailyPrograms;
var fallbackDailyProgramLines = persistedFallback.dailyProgramLines;
var nextFallbackArticleId = persistedFallback.nextArticleId;
var nextFallbackOperatorId = persistedFallback.nextOperatorId;
var nextFallbackRecordId = persistedFallback.nextRecordId;
var nextFallbackDailyProgramId = persistedFallback.nextDailyProgramId;
var nextFallbackDailyProgramLineId = persistedFallback.nextDailyProgramLineId;
function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}
async function getDb() {
  const databaseUrl = getDatabaseUrl();
  if (!_db && databaseUrl) {
    try {
      _db = drizzle(neon(databaseUrl));
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function listProductionRecords() {
  const db = await getDb();
  if (!db) {
    return [...fallbackRecords].sort((a, b) => b.productionDate.localeCompare(a.productionDate) || b.id - a.id);
  }
  return db.select().from(productionRecords).orderBy(desc(productionRecords.productionDate), desc(productionRecords.id));
}
async function createProductionRecord(record) {
  const db = await getDb();
  if (!db) {
    const created2 = {
      id: nextFallbackRecordId++,
      productionDate: String(record.productionDate),
      article: String(record.article),
      totalProductionHours: String(record.totalProductionHours),
      plannedStopsHours: String(record.plannedStopsHours),
      unplannedStopsHours: String(record.unplannedStopsHours),
      productionTons: String(record.productionTons),
      wasteTons: String(record.wasteTons),
      standardRate: String(record.standardRate),
      availability: String(record.availability ?? "0"),
      performance: String(record.performance ?? "0"),
      quality: String(record.quality ?? "1"),
      trs: String(record.trs ?? "0"),
      realHours: String(record.realHours ?? "0"),
      comment: record.comment ?? null,
      source: String(record.source ?? "manual"),
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    fallbackRecords.push(created2);
    persistFallbackStore();
    return created2;
  }
  const [created] = await db.insert(productionRecords).values(record).returning();
  return created;
}
async function updateProductionRecord(id, record) {
  const db = await getDb();
  if (!db) {
    const existing = fallbackRecords.find((item) => item.id === id);
    if (!existing) return void 0;
    Object.assign(existing, {
      ...existing,
      ...record,
      productionDate: record.productionDate ?? existing.productionDate,
      article: record.article ?? existing.article,
      totalProductionHours: record.totalProductionHours ? String(record.totalProductionHours) : existing.totalProductionHours,
      plannedStopsHours: record.plannedStopsHours ? String(record.plannedStopsHours) : existing.plannedStopsHours,
      unplannedStopsHours: record.unplannedStopsHours ? String(record.unplannedStopsHours) : existing.unplannedStopsHours,
      productionTons: record.productionTons ? String(record.productionTons) : existing.productionTons,
      wasteTons: record.wasteTons ? String(record.wasteTons) : existing.wasteTons,
      standardRate: record.standardRate ? String(record.standardRate) : existing.standardRate,
      availability: record.availability ? String(record.availability) : existing.availability,
      performance: record.performance ? String(record.performance) : existing.performance,
      quality: record.quality ? String(record.quality) : existing.quality,
      trs: record.trs ? String(record.trs) : existing.trs,
      realHours: record.realHours ? String(record.realHours) : existing.realHours,
      comment: record.comment ?? existing.comment,
      source: record.source ?? existing.source,
      updatedAt: /* @__PURE__ */ new Date()
    });
    persistFallbackStore();
    return existing;
  }
  const [updated] = await db.update(productionRecords).set({ ...record, updatedAt: /* @__PURE__ */ new Date() }).where(eq(productionRecords.id, id)).returning();
  return updated;
}
async function deleteProductionRecord(id) {
  const db = await getDb();
  if (!db) {
    const index2 = fallbackRecords.findIndex((item) => item.id === id);
    if (index2 >= 0) {
      fallbackRecords.splice(index2, 1);
      persistFallbackStore();
    }
    return { success: true };
  }
  await db.delete(productionRecords).where(eq(productionRecords.id, id));
  return { success: true };
}
async function listDailyPrograms() {
  const db = await getDb();
  if (!db) return [...fallbackDailyPrograms].sort((a, b) => b.programDate.localeCompare(a.programDate));
  return db.select().from(dailyPrograms).orderBy(desc(dailyPrograms.programDate));
}
async function getDailyProgramByDate(programDate) {
  const db = await getDb();
  if (!db) {
    const program2 = fallbackDailyPrograms.find((item) => item.programDate === programDate);
    if (!program2) return null;
    const lines2 = fallbackDailyProgramLines.filter((line) => line.programId === program2.id).sort((a, b) => a.sequence - b.sequence || a.id - b.id);
    return { ...program2, lines: lines2 };
  }
  const programs = await db.select().from(dailyPrograms).where(eq(dailyPrograms.programDate, programDate)).limit(1);
  const program = programs[0];
  if (!program) return null;
  const lines = await db.select().from(dailyProgramLines).where(eq(dailyProgramLines.programId, program.id)).orderBy(asc(dailyProgramLines.sequence), asc(dailyProgramLines.id));
  return { ...program, lines };
}
async function createDailyProgram(program) {
  const db = await getDb();
  if (!db) {
    const created2 = {
      id: nextFallbackDailyProgramId++,
      programDate: String(program.programDate),
      operatorName: String(program.operatorName ?? ""),
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    fallbackDailyPrograms.push(created2);
    persistFallbackStore();
    return created2;
  }
  const [created] = await db.insert(dailyPrograms).values(program).returning();
  return created;
}
async function updateDailyProgram(id, program) {
  const db = await getDb();
  if (!db) {
    const existing = fallbackDailyPrograms.find((item) => item.id === id);
    if (!existing) return void 0;
    if (program.programDate !== void 0) existing.programDate = String(program.programDate);
    if (program.operatorName !== void 0) existing.operatorName = String(program.operatorName);
    existing.updatedAt = /* @__PURE__ */ new Date();
    persistFallbackStore();
    return existing;
  }
  const [updated] = await db.update(dailyPrograms).set({ ...program, updatedAt: /* @__PURE__ */ new Date() }).where(eq(dailyPrograms.id, id)).returning();
  return updated;
}
async function deleteDailyProgram(id) {
  const db = await getDb();
  if (!db) {
    for (let index2 = fallbackDailyProgramLines.length - 1; index2 >= 0; index2 -= 1) {
      if (fallbackDailyProgramLines[index2].programId === id) fallbackDailyProgramLines.splice(index2, 1);
    }
    const programIndex = fallbackDailyPrograms.findIndex((item) => item.id === id);
    if (programIndex >= 0) fallbackDailyPrograms.splice(programIndex, 1);
    persistFallbackStore();
    return { success: true };
  }
  await db.delete(dailyProgramLines).where(eq(dailyProgramLines.programId, id));
  await db.delete(dailyPrograms).where(eq(dailyPrograms.id, id));
  return { success: true };
}
async function createDailyProgramLine(line) {
  const db = await getDb();
  if (!db) {
    const created2 = {
      id: nextFallbackDailyProgramLineId++,
      programId: Number(line.programId),
      sequence: Number(line.sequence ?? 1),
      article: line.article ?? null,
      version: line.version ?? null,
      bagQuantity: line.bagQuantity ?? null,
      bulkQuantity: line.bulkQuantity ?? null,
      plannedStart: String(line.plannedStart),
      plannedEnd: String(line.plannedEnd),
      observation: line.observation ?? null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    fallbackDailyProgramLines.push(created2);
    persistFallbackStore();
    return created2;
  }
  const [created] = await db.insert(dailyProgramLines).values(line).returning();
  return created;
}
async function updateDailyProgramLine(id, line) {
  const db = await getDb();
  if (!db) {
    const existing = fallbackDailyProgramLines.find((item) => item.id === id);
    if (!existing) return void 0;
    if (line.sequence !== void 0) existing.sequence = Number(line.sequence);
    if (line.article !== void 0) existing.article = line.article;
    if (line.version !== void 0) existing.version = line.version;
    if (line.bagQuantity !== void 0) existing.bagQuantity = line.bagQuantity;
    if (line.bulkQuantity !== void 0) existing.bulkQuantity = line.bulkQuantity;
    if (line.plannedStart !== void 0) existing.plannedStart = String(line.plannedStart);
    if (line.plannedEnd !== void 0) existing.plannedEnd = String(line.plannedEnd);
    if (line.observation !== void 0) existing.observation = line.observation;
    existing.updatedAt = /* @__PURE__ */ new Date();
    persistFallbackStore();
    return existing;
  }
  const [updated] = await db.update(dailyProgramLines).set({ ...line, updatedAt: /* @__PURE__ */ new Date() }).where(eq(dailyProgramLines.id, id)).returning();
  return updated;
}
async function deleteDailyProgramLine(id) {
  const db = await getDb();
  if (!db) {
    const index2 = fallbackDailyProgramLines.findIndex((item) => item.id === id);
    if (index2 >= 0) {
      fallbackDailyProgramLines.splice(index2, 1);
      persistFallbackStore();
    }
    return { success: true };
  }
  await db.delete(dailyProgramLines).where(eq(dailyProgramLines.id, id));
  return { success: true };
}
async function importDailyProgramDay(day) {
  const existing = await getDailyProgramByDate(day.programDate);
  const program = existing ? await updateDailyProgram(existing.id, { operatorName: day.operatorName }) : await createDailyProgram({ programDate: day.programDate, operatorName: day.operatorName });
  if (!program) throw new Error(`Impossible d\u2019enregistrer le programme du ${day.programDate}.`);
  if (existing) {
    for (const line of existing.lines) await deleteDailyProgramLine(line.id);
  }
  for (const line of day.lines) {
    await createDailyProgramLine({ ...line, programId: program.id });
  }
  return program;
}
async function initializeProductionArticles() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: productionArticles.id }).from(productionArticles).limit(1);
  if (existing.length > 0) return;
  const rows = await db.select({ article: productionRecords.article }).from(productionRecords);
  const codes = Array.from(new Set(rows.map((row) => row.article.trim()).filter(Boolean)));
  if (codes.length === 0) return;
  await db.insert(productionArticles).values(codes.map((code) => ({ code, isActive: true }))).onConflictDoUpdate({
    target: productionArticles.code,
    set: { updatedAt: /* @__PURE__ */ new Date() }
  });
}
async function listActiveProductionArticles() {
  const db = await getDb();
  if (!db) {
    return fallbackArticles.filter((article) => article.isActive).sort((a, b) => a.code.localeCompare(b.code));
  }
  return db.select().from(productionArticles).where(eq(productionArticles.isActive, true)).orderBy(asc(productionArticles.code));
}
async function addProductionArticle(code) {
  const db = await getDb();
  if (!db) {
    const normalizedCode2 = code.trim().toUpperCase();
    const existing = fallbackArticles.find((article3) => article3.code === normalizedCode2);
    if (existing) {
      existing.isActive = true;
      existing.updatedAt = /* @__PURE__ */ new Date();
      persistFallbackStore();
      return existing;
    }
    const article2 = {
      id: nextFallbackArticleId++,
      code: normalizedCode2,
      isActive: true,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    fallbackArticles.push(article2);
    persistFallbackStore();
    return article2;
  }
  const normalizedCode = code.trim().toUpperCase();
  const [article] = await db.insert(productionArticles).values({ code: normalizedCode, isActive: true }).onConflictDoUpdate({
    target: productionArticles.code,
    set: { isActive: true, updatedAt: /* @__PURE__ */ new Date() }
  }).returning();
  return article;
}
async function archiveProductionArticle(id) {
  const db = await getDb();
  if (!db) {
    const article = fallbackArticles.find((item) => item.id === id);
    if (article) {
      article.isActive = false;
      article.updatedAt = /* @__PURE__ */ new Date();
      persistFallbackStore();
    }
    return { success: true };
  }
  await db.update(productionArticles).set({ isActive: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(productionArticles.id, id));
  return { success: true };
}
async function listActiveProductionOperators() {
  const db = await getDb();
  if (!db) {
    return fallbackOperators.filter((operator) => operator.isActive).sort((a, b) => a.name.localeCompare(b.name));
  }
  return db.select().from(productionOperators).where(eq(productionOperators.isActive, true)).orderBy(asc(productionOperators.name));
}
async function addProductionOperator(name) {
  const db = await getDb();
  if (!db) {
    const normalizedName2 = name.trim();
    const existing = fallbackOperators.find((operator3) => operator3.name === normalizedName2);
    if (existing) {
      existing.isActive = true;
      existing.updatedAt = /* @__PURE__ */ new Date();
      persistFallbackStore();
      return existing;
    }
    const operator2 = {
      id: nextFallbackOperatorId++,
      name: normalizedName2,
      isActive: true,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    fallbackOperators.push(operator2);
    persistFallbackStore();
    return operator2;
  }
  const normalizedName = name.trim();
  const [operator] = await db.insert(productionOperators).values({ name: normalizedName, isActive: true }).onConflictDoUpdate({
    target: productionOperators.name,
    set: { isActive: true, updatedAt: /* @__PURE__ */ new Date() }
  }).returning();
  return operator;
}
async function archiveProductionOperator(id) {
  const db = await getDb();
  if (!db) {
    const operator = fallbackOperators.find((item) => item.id === id);
    if (operator) {
      operator.isActive = false;
      operator.updatedAt = /* @__PURE__ */ new Date();
      persistFallbackStore();
    }
    return { success: true };
  }
  await db.update(productionOperators).set({ isActive: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(productionOperators.id, id));
  return { success: true };
}
async function getProductionSettings() {
  const db = await getDb();
  if (!db) return fallbackSettings;
  try {
    const rows = await db.select().from(productionSettings).where(eq(productionSettings.id, 1)).limit(1);
    return rows[0];
  } catch (error) {
    console.error("[Database] Lecture de production_settings impossible (sch\xE9ma d\xE9synchronis\xE9 avec une migration en attente ?) :", error);
    return void 0;
  }
}
async function getSynchronizedExcelFileFallback() {
  return fallbackSynchronizedFile;
}
async function saveSynchronizedExcelFileFallback(file) {
  fallbackSynchronizedFile = {
    id: file.id,
    fileName: file.fileName,
    storageKey: file.storageKey,
    downloadUrl: file.downloadUrl,
    recordCount: file.recordCount,
    updatedAt: /* @__PURE__ */ new Date()
  };
  persistFallbackStore();
  return fallbackSynchronizedFile;
}
async function saveAdminCredentials(username, digest) {
  const db = await getDb();
  if (!db) {
    fallbackSettings = {
      id: 1,
      ...fallbackSettings,
      adminUsername: username,
      adminPasswordHash: digest.hash,
      adminPasswordSalt: digest.salt,
      updatedAt: /* @__PURE__ */ new Date()
    };
    persistFallbackStore();
    return fallbackSettings;
  }
  await db.insert(productionSettings).values({ id: 1, adminUsername: username, adminPasswordHash: digest.hash, adminPasswordSalt: digest.salt }).onConflictDoUpdate({
    target: productionSettings.id,
    set: { adminUsername: username, adminPasswordHash: digest.hash, adminPasswordSalt: digest.salt, updatedAt: /* @__PURE__ */ new Date() }
  });
  return getProductionSettings();
}

// server/excelSync.ts
import ExcelJS2 from "exceljs";
import { asc as asc2, eq as eq2 } from "drizzle-orm";

// client/src/data/app-data.json
var app_data_default = {
  source: "Dashboard_Production.xlsx",
  months: [
    {
      key: "avril-2026",
      name: "Avril 2026",
      label: "Avril 2026",
      target: 2500,
      progress: 0.865,
      availability: 0.9074265903941688,
      performance: 0.7211389848187015,
      quality: 1,
      trs: 0.6543225843903627,
      totalProduction: 2162.5,
      waste: 0,
      activeHours: 221.35,
      articles: [],
      daily: [
        {
          date: "2026-04-01",
          article: "CG3",
          hours: 4,
          plannedStops: 0.5,
          unplannedStops: 0.43,
          production: 40,
          waste: 0,
          availability: 0.8925,
          performance: 0.8686210640608035,
          quality: 1,
          trs: 0.7752442996742671
        },
        {
          date: "2026-04-01",
          article: "CM1",
          hours: 3,
          plannedStops: 0,
          unplannedStops: 0.35,
          production: 30,
          waste: 0,
          availability: 0.8833333333333333,
          performance: 1.1320754716981132,
          quality: 1,
          trs: 0.9999999999999999
        },
        {
          date: "2026-04-02",
          article: "CG25",
          hours: 11,
          plannedStops: 0,
          unplannedStops: 0.6,
          production: 120,
          waste: 0,
          availability: 0.9454545454545454,
          performance: 0.7692307692307693,
          quality: 1,
          trs: 0.7272727272727273
        },
        {
          date: "2026-04-03",
          article: "CG25",
          hours: 10,
          plannedStops: 0,
          unplannedStops: 1.4,
          production: 100,
          waste: 0,
          availability: 0.86,
          performance: 0.7751937984496124,
          quality: 1,
          trs: 0.6666666666666667
        },
        {
          date: "2026-04-04",
          article: "CM1",
          hours: 4,
          plannedStops: 0,
          unplannedStops: 0.4,
          production: 30,
          waste: 0,
          availability: 0.9,
          performance: 0.8333333333333334,
          quality: 1,
          trs: 0.75
        },
        {
          date: "2026-04-06",
          article: "CM1",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 1,
          production: 70,
          waste: 0,
          availability: 0.9166666666666666,
          performance: 0.6363636363636364,
          quality: 1,
          trs: 0.5833333333333333
        },
        {
          date: "2026-04-07",
          article: "CG3",
          hours: 11,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 120,
          waste: 0,
          availability: 0.9545454545454546,
          performance: 0.7619047619047619,
          quality: 1,
          trs: 0.7272727272727273
        },
        {
          date: "2026-04-08",
          article: "DG3",
          hours: 0,
          plannedStops: 0,
          unplannedStops: 0,
          production: 30,
          waste: 0,
          availability: 0,
          performance: 0,
          quality: 1,
          trs: 0
        },
        {
          date: "2026-04-09",
          article: "CG3",
          hours: 11.6,
          plannedStops: 0,
          unplannedStops: 1.6,
          production: 120,
          waste: 0,
          availability: 0.8620689655172414,
          performance: 0.8,
          quality: 1,
          trs: 0.6896551724137931
        },
        {
          date: "2026-04-10",
          article: "CM1",
          hours: 11.5,
          plannedStops: 0,
          unplannedStops: 1.1,
          production: 60,
          waste: 0,
          availability: 0.9043478260869565,
          performance: 0.5769230769230769,
          quality: 1,
          trs: 0.5217391304347826
        },
        {
          date: "2026-04-11",
          article: "CM1",
          hours: 3,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.6666666666666666,
          quality: 1,
          trs: 0.6666666666666666
        },
        {
          date: "2026-04-13",
          article: "CG25",
          hours: 9,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 125,
          waste: 0,
          availability: 0.9444444444444444,
          performance: 0.9803921568627451,
          quality: 1,
          trs: 0.9259259259259258
        },
        {
          date: "2026-04-14",
          article: "CG25",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 3.5,
          production: 100,
          waste: 0,
          availability: 0.7083333333333334,
          performance: 0.7843137254901961,
          quality: 1,
          trs: 0.5555555555555556
        },
        {
          date: "2026-04-15",
          article: "CG25",
          hours: 15,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 130,
          waste: 0,
          availability: 0.9,
          performance: 0.6419753086419753,
          quality: 1,
          trs: 0.5777777777777777
        },
        {
          date: "2026-04-16",
          article: "CG3",
          hours: 11,
          plannedStops: 0,
          unplannedStops: 0.8,
          production: 110,
          waste: 0,
          availability: 0.9272727272727272,
          performance: 0.7189542483660131,
          quality: 1,
          trs: 0.6666666666666666
        },
        {
          date: "2026-04-17",
          article: "CM1",
          hours: 13,
          plannedStops: 0,
          unplannedStops: 1,
          production: 70,
          waste: 0,
          availability: 0.9230769230769231,
          performance: 0.5833333333333334,
          quality: 1,
          trs: 0.5384615384615385
        },
        {
          date: "2026-04-20",
          article: "CM1",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 1,
          production: 80,
          waste: 0,
          availability: 0.9166666666666666,
          performance: 0.7272727272727273,
          quality: 1,
          trs: 0.6666666666666666
        },
        {
          date: "2026-04-21",
          article: "CG3",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 0.3,
          production: 120,
          waste: 0,
          availability: 0.975,
          performance: 0.6837606837606838,
          quality: 1,
          trs: 0.6666666666666666
        },
        {
          date: "2026-04-22",
          article: "CG3",
          hours: 13,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 135,
          waste: 0,
          availability: 0.9615384615384616,
          performance: 0.72,
          quality: 1,
          trs: 0.6923076923076923
        },
        {
          date: "2026-04-23",
          article: "CM1",
          hours: 13,
          plannedStops: 0,
          unplannedStops: 0.8,
          production: 70,
          waste: 0,
          availability: 0.9384615384615385,
          performance: 0.5737704918032787,
          quality: 1,
          trs: 0.5384615384615384
        },
        {
          date: "2026-04-24",
          article: "CG3",
          hours: 3,
          plannedStops: 0,
          unplannedStops: 0,
          production: 30,
          waste: 0,
          availability: 1,
          performance: 0.6666666666666666,
          quality: 1,
          trs: 0.6666666666666666
        },
        {
          date: "2026-04-24",
          article: "DG4",
          hours: 0,
          plannedStops: 0,
          unplannedStops: 0,
          production: 30,
          waste: 0,
          availability: 0,
          performance: 0,
          quality: 1,
          trs: 0
        },
        {
          date: "2026-04-25",
          article: "CM1",
          hours: 8.7,
          plannedStops: 0,
          unplannedStops: 2.1,
          production: 40,
          waste: 0,
          availability: 0.7586206896551725,
          performance: 0.6060606060606061,
          quality: 1,
          trs: 0.4597701149425288
        },
        {
          date: "2026-04-27",
          article: "CG25",
          hours: 11.2,
          plannedStops: 0,
          unplannedStops: 1,
          production: 120,
          waste: 0,
          availability: 0.9107142857142857,
          performance: 0.7843137254901961,
          quality: 1,
          trs: 0.7142857142857143
        },
        {
          date: "2026-04-28",
          article: "CG25",
          hours: 13,
          plannedStops: 0,
          unplannedStops: 2.5,
          production: 80,
          waste: 0,
          availability: 0.8076923076923077,
          performance: 0.5079365079365079,
          quality: 1,
          trs: 0.41025641025641024
        },
        {
          date: "2026-04-29",
          article: "CM1",
          hours: 10,
          plannedStops: 0,
          unplannedStops: 1.2,
          production: 62.5,
          waste: 0,
          availability: 0.8800000000000001,
          performance: 0.7102272727272727,
          quality: 1,
          trs: 0.6250000000000001
        },
        {
          date: "2026-04-30",
          article: "CG3",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 0,
          production: 120,
          waste: 0,
          availability: 1,
          performance: 0.6666666666666666,
          quality: 1,
          trs: 0.6666666666666666
        }
      ]
    },
    {
      key: "mai-2026",
      name: "Mai 2026",
      label: "Mai 2026",
      target: 2500,
      progress: 0.853,
      availability: 0.8727546524367641,
      performance: 0.6334954029698995,
      quality: 0.9947260961800988,
      trs: 0.5531906650244626,
      totalProduction: 2132.5,
      waste: 11,
      activeHours: 242.31999999999996,
      articles: [],
      daily: [
        {
          date: "2026-05-04",
          article: "CM1",
          hours: 10.85,
          plannedStops: 0,
          unplannedStops: 1,
          production: 65,
          waste: 0,
          availability: 0.9078341013824884,
          performance: 0.6598984771573604,
          quality: 1,
          trs: 0.5990783410138248
        },
        {
          date: "2026-05-05",
          article: "CG25",
          hours: 13.6,
          plannedStops: 0,
          unplannedStops: 0.25,
          production: 150,
          waste: 0,
          availability: 0.9816176470588235,
          performance: 0.7490636704119851,
          quality: 1,
          trs: 0.7352941176470589
        },
        {
          date: "2026-05-06",
          article: "DG4",
          hours: 13,
          plannedStops: 0,
          unplannedStops: 0.3,
          production: 110,
          waste: 3,
          availability: 0.9769230769230769,
          performance: 0.5774278215223098,
          quality: 0.9727272727272728,
          trs: 0.5487179487179488
        },
        {
          date: "2026-05-07",
          article: "DG4",
          hours: 7,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 60,
          waste: 0,
          availability: 0.9285714285714286,
          performance: 0.6153846153846154,
          quality: 1,
          trs: 0.5714285714285715
        },
        {
          date: "2026-05-07",
          article: "CG3",
          hours: 5,
          plannedStops: 0.5,
          unplannedStops: 1,
          production: 40,
          waste: 0,
          availability: 0.8,
          performance: 0.7619047619047619,
          quality: 1,
          trs: 0.6095238095238096
        },
        {
          date: "2026-05-08",
          article: "CG3",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 0,
          production: 150,
          waste: 0,
          availability: 1,
          performance: 0.8333333333333334,
          quality: 1,
          trs: 0.8333333333333334
        },
        {
          date: "2026-05-09",
          article: "DG4",
          hours: 6,
          plannedStops: 0,
          unplannedStops: 1,
          production: 60,
          waste: 2,
          availability: 0.8333333333333334,
          performance: 0.8,
          quality: 0.9666666666666667,
          trs: 0.6444444444444445
        },
        {
          date: "2026-05-11",
          article: "CG25",
          hours: 16,
          plannedStops: 0,
          unplannedStops: 2,
          production: 140,
          waste: 1,
          availability: 0.875,
          performance: 0.6666666666666666,
          quality: 0.9928571428571429,
          trs: 0.5791666666666666
        },
        {
          date: "2026-05-12",
          article: "CM1",
          hours: 16,
          plannedStops: 0,
          unplannedStops: 3,
          production: 75,
          waste: 0,
          availability: 0.8125,
          performance: 0.5769230769230769,
          quality: 1,
          trs: 0.46874999999999994
        },
        {
          date: "2026-05-13",
          article: "CM1",
          hours: 14,
          plannedStops: 0,
          unplannedStops: 3,
          production: 75,
          waste: 0,
          availability: 0.7857142857142857,
          performance: 0.6818181818181818,
          quality: 1,
          trs: 0.5357142857142857
        },
        {
          date: "2026-05-14",
          article: "CG3",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 2,
          production: 120,
          waste: 0,
          availability: 0.8333333333333334,
          performance: 0.8,
          quality: 1,
          trs: 0.6666666666666667
        },
        {
          date: "2026-05-15",
          article: "CM1",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 6,
          production: 35,
          waste: 0,
          availability: 0.5,
          performance: 0.5833333333333334,
          quality: 1,
          trs: 0.2916666666666667
        },
        {
          date: "2026-05-16",
          article: "DG4",
          hours: 7,
          plannedStops: 0,
          unplannedStops: 2.2,
          production: 30,
          waste: 0,
          availability: 0.6857142857142857,
          performance: 0.4166666666666667,
          quality: 1,
          trs: 0.28571428571428575
        },
        {
          date: "2026-05-18",
          article: "CM1",
          hours: 9,
          plannedStops: 0,
          unplannedStops: 2,
          production: 30,
          waste: 0,
          availability: 0.7777777777777778,
          performance: 0.42857142857142855,
          quality: 1,
          trs: 0.3333333333333333
        },
        {
          date: "2026-05-18",
          article: "CG3",
          hours: 5,
          plannedStops: 0,
          unplannedStops: 0.3,
          production: 40,
          waste: 0,
          availability: 0.9400000000000001,
          performance: 0.5673758865248227,
          quality: 1,
          trs: 0.5333333333333334
        },
        {
          date: "2026-05-19",
          article: "CG25",
          hours: 16,
          plannedStops: 0,
          unplannedStops: 1,
          production: 140,
          waste: 0,
          availability: 0.9375,
          performance: 0.6222222222222222,
          quality: 1,
          trs: 0.5833333333333334
        },
        {
          date: "2026-05-20",
          article: "DG4",
          hours: 8,
          plannedStops: 0,
          unplannedStops: 1.7,
          production: 47.5,
          waste: 2,
          availability: 0.7875,
          performance: 0.5026455026455027,
          quality: 0.9578947368421052,
          trs: 0.3791666666666667
        },
        {
          date: "2026-05-20",
          article: "CG3",
          hours: 6,
          plannedStops: 0,
          unplannedStops: 0,
          production: 40,
          waste: 0,
          availability: 1,
          performance: 0.4444444444444444,
          quality: 1,
          trs: 0.4444444444444444
        },
        {
          date: "2026-05-21",
          article: "CM1",
          hours: 14,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 90,
          waste: 0,
          availability: 0.9642857142857143,
          performance: 0.6666666666666666,
          quality: 1,
          trs: 0.6428571428571428
        },
        {
          date: "2026-05-22",
          article: "CG3",
          hours: 15,
          plannedStops: 0,
          unplannedStops: 0.4,
          production: 150,
          waste: 0,
          availability: 0.9733333333333333,
          performance: 0.684931506849315,
          quality: 1,
          trs: 0.6666666666666666
        },
        {
          date: "2026-05-23",
          article: "DG4",
          hours: 7.8,
          plannedStops: 0,
          unplannedStops: 0.85,
          production: 85,
          waste: 2,
          availability: 0.8910256410256411,
          performance: 0.815347721822542,
          quality: 0.9764705882352941,
          trs: 0.7094017094017094
        },
        {
          date: "2026-05-24",
          article: "CG25",
          hours: 13.2,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 135,
          waste: 0,
          availability: 0.9621212121212122,
          performance: 0.7086614173228346,
          quality: 1,
          trs: 0.6818181818181818
        },
        {
          date: "2026-05-25",
          article: "CG3",
          hours: 4.5,
          plannedStops: 0,
          unplannedStops: 0.67,
          production: 30,
          waste: 0,
          availability: 0.8511111111111112,
          performance: 0.5221932114882506,
          quality: 1,
          trs: 0.4444444444444444
        },
        {
          date: "2026-05-25",
          article: "DG4",
          hours: 8.8,
          plannedStops: 0.5,
          unplannedStops: 0.5,
          production: 70,
          waste: 1,
          availability: 0.9431818181818182,
          performance: 0.5982905982905982,
          quality: 0.9857142857142858,
          trs: 0.5562354312354312
        },
        {
          date: "2026-05-26",
          article: "CM1",
          hours: 5,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 30,
          waste: 0,
          availability: 0.9,
          performance: 0.6666666666666666,
          quality: 1,
          trs: 0.6
        },
        {
          date: "2026-05-29",
          article: "CG3",
          hours: 9.38,
          plannedStops: 0,
          unplannedStops: 1.4,
          production: 60,
          waste: 0,
          availability: 0.8507462686567164,
          performance: 0.5012531328320802,
          quality: 1,
          trs: 0.42643923240938164
        },
        {
          date: "2026-05-29",
          article: "DG4",
          hours: 5,
          plannedStops: 0.5,
          unplannedStops: 0.72,
          production: 35,
          waste: 0,
          availability: 0.8560000000000001,
          performance: 0.6172839506172839,
          quality: 1,
          trs: 0.5283950617283951
        },
        {
          date: "2026-05-30",
          article: "CM1",
          hours: 6.78,
          plannedStops: 0,
          unplannedStops: 0.8,
          production: 40,
          waste: 0,
          availability: 0.8820058997050148,
          performance: 0.6688963210702341,
          quality: 1,
          trs: 0.5899705014749262
        }
      ]
    },
    {
      key: "juin-2026",
      name: "juin 2026",
      label: "JUIN 2026",
      target: 2500,
      progress: 1.161,
      availability: 0.9141270491516615,
      performance: 0.6096834910104697,
      quality: 0.975677028218695,
      trs: 0.5440859125570436,
      totalProduction: 2902.5,
      waste: 49.5,
      activeHours: 296.15,
      articles: [],
      daily: [
        {
          date: "2026-06-01",
          article: "CG3",
          hours: 7,
          plannedStops: 0,
          unplannedStops: 1,
          production: 50,
          waste: 0,
          availability: 0.8571428571428571,
          performance: 0.5555555555555556,
          quality: 1,
          trs: 0.47619047619047616
        },
        {
          date: "2026-06-01",
          article: "CG25",
          hours: 8,
          plannedStops: 1,
          unplannedStops: 0.5,
          production: 50,
          waste: 0,
          availability: 0.9375,
          performance: 0.5128205128205128,
          quality: 1,
          trs: 0.4807692307692307
        },
        {
          date: "2026-06-02",
          article: "CG25",
          hours: 13,
          plannedStops: 0,
          unplannedStops: 0.3,
          production: 115,
          waste: 0,
          availability: 0.9769230769230769,
          performance: 0.6036745406824147,
          quality: 1,
          trs: 0.5897435897435896
        },
        {
          date: "2026-06-03",
          article: "CG3",
          hours: 16,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 120,
          waste: 0,
          availability: 0.90625,
          performance: 0.5517241379310345,
          quality: 1,
          trs: 0.5
        },
        {
          date: "2026-06-04",
          article: "CM1",
          hours: 17,
          plannedStops: 0,
          unplannedStops: 2,
          production: 90,
          waste: 0,
          availability: 0.8823529411764706,
          performance: 0.6,
          quality: 1,
          trs: 0.5294117647058824
        },
        {
          date: "2026-06-05",
          article: "DG4",
          hours: 9,
          plannedStops: 0.5,
          unplannedStops: 0,
          production: 80,
          waste: 2,
          availability: 1,
          performance: 0.6274509803921569,
          quality: 0.975,
          trs: 0.6117647058823529
        },
        {
          date: "2026-06-05",
          article: "CG3",
          hours: 5,
          plannedStops: 0.5,
          unplannedStops: 1,
          production: 35,
          waste: 0,
          availability: 0.8,
          performance: 0.6666666666666666,
          quality: 1,
          trs: 0.5333333333333333
        },
        {
          date: "2026-06-06",
          article: "CG3",
          hours: 15,
          plannedStops: 0,
          unplannedStops: 1,
          production: 125,
          waste: 0,
          availability: 0.9333333333333333,
          performance: 0.5952380952380952,
          quality: 1,
          trs: 0.5555555555555556
        },
        {
          date: "2026-06-07",
          article: "CG25",
          hours: 14,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 110,
          waste: 0,
          availability: 0.9642857142857143,
          performance: 0.5432098765432098,
          quality: 1,
          trs: 0.5238095238095238
        },
        {
          date: "2026-06-08",
          article: "CM1",
          hours: 16,
          plannedStops: 0,
          unplannedStops: 3,
          production: 67.5,
          waste: 0.5,
          availability: 0.8125,
          performance: 0.5192307692307693,
          quality: 0.9925925925925926,
          trs: 0.41875000000000007
        },
        {
          date: "2026-06-09",
          article: "CM1",
          hours: 4,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 20,
          waste: 0,
          availability: 0.875,
          performance: 0.5714285714285714,
          quality: 1,
          trs: 0.5
        },
        {
          date: "2026-06-09",
          article: "DG4",
          hours: 6,
          plannedStops: 0,
          unplannedStops: 0,
          production: 50,
          waste: 2,
          availability: 1,
          performance: 0.5555555555555556,
          quality: 0.96,
          trs: 0.5333333333333333
        },
        {
          date: "2026-06-10",
          article: "CG3",
          hours: 14.5,
          plannedStops: 0,
          unplannedStops: 2,
          production: 150,
          waste: 0,
          availability: 0.8620689655172413,
          performance: 0.8,
          quality: 1,
          trs: 0.6896551724137931
        },
        {
          date: "2026-06-11",
          article: "CM1",
          hours: 10,
          plannedStops: 0,
          unplannedStops: 0.7,
          production: 60,
          waste: 0.5,
          availability: 0.93,
          performance: 0.6451612903225806,
          quality: 0.9916666666666667,
          trs: 0.595
        },
        {
          date: "2026-06-11",
          article: "DG4",
          hours: 8,
          plannedStops: 0.5,
          unplannedStops: 0,
          production: 70,
          waste: 2,
          availability: 1,
          performance: 0.6222222222222222,
          quality: 0.9714285714285714,
          trs: 0.6044444444444445
        },
        {
          date: "2026-06-12",
          article: "CG25",
          hours: 16,
          plannedStops: 0,
          unplannedStops: 0.7,
          production: 140,
          waste: 0.5,
          availability: 0.95625,
          performance: 0.6100217864923747,
          quality: 0.9964285714285714,
          trs: 0.58125
        },
        {
          date: "2026-06-13",
          article: "CG3",
          hours: 7,
          plannedStops: 0,
          unplannedStops: 0.25,
          production: 60,
          waste: 0,
          availability: 0.9642857142857143,
          performance: 0.5925925925925926,
          quality: 1,
          trs: 0.5714285714285714
        },
        {
          date: "2026-06-15",
          article: "CG3",
          hours: 7,
          plannedStops: 0,
          unplannedStops: 0.6,
          production: 50,
          waste: 0,
          availability: 0.9142857142857144,
          performance: 0.5208333333333334,
          quality: 1,
          trs: 0.4761904761904763
        },
        {
          date: "2026-06-15",
          article: "CM1",
          hours: 8.9,
          plannedStops: 0,
          unplannedStops: 3,
          production: 30,
          waste: 0.5,
          availability: 0.6629213483146068,
          performance: 0.5084745762711864,
          quality: 0.9833333333333333,
          trs: 0.33146067415730335
        },
        {
          date: "2026-06-16",
          article: "CM1",
          hours: 5,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 30,
          waste: 0.5,
          availability: 0.9,
          performance: 0.6666666666666666,
          quality: 0.9833333333333333,
          trs: 0.59
        },
        {
          date: "2026-06-16",
          article: "DG4",
          hours: 10,
          plannedStops: 0,
          unplannedStops: 0.8,
          production: 90,
          waste: 2,
          availability: 0.9199999999999999,
          performance: 0.6521739130434783,
          quality: 0.9777777777777777,
          trs: 0.5866666666666667
        },
        {
          date: "2026-06-17",
          article: "CG3",
          hours: 16,
          plannedStops: 0,
          unplannedStops: 2.3,
          production: 135,
          waste: 0,
          availability: 0.85625,
          performance: 0.656934306569343,
          quality: 1,
          trs: 0.5625
        },
        {
          date: "2026-06-18",
          article: "CG25",
          hours: 15,
          plannedStops: 0,
          unplannedStops: 1.3,
          production: 140,
          waste: 0,
          availability: 0.9133333333333333,
          performance: 0.681265206812652,
          quality: 1,
          trs: 0.6222222222222221
        },
        {
          date: "2026-06-19",
          article: "CM1",
          hours: 13.5,
          plannedStops: 0,
          unplannedStops: 0.3,
          production: 80,
          waste: 0.5,
          availability: 0.9777777777777777,
          performance: 0.6060606060606061,
          quality: 0.99375,
          trs: 0.5888888888888889
        },
        {
          date: "2026-06-20",
          article: "DG4",
          hours: 7.5,
          plannedStops: 0,
          unplannedStops: 0.3,
          production: 65,
          waste: 32,
          availability: 0.9600000000000001,
          performance: 0.6018518518518519,
          quality: 0.5,
          trs: 0.2888888888888889
        },
        {
          date: "2026-06-22",
          article: "CG3",
          hours: 16,
          plannedStops: 0,
          unplannedStops: 2.2,
          production: 120,
          waste: 0,
          availability: 0.8625,
          performance: 0.5797101449275363,
          quality: 1,
          trs: 0.5
        },
        {
          date: "2026-06-23",
          article: "CM1",
          hours: 15,
          plannedStops: 0,
          unplannedStops: 0.3,
          production: 100,
          waste: 0.5,
          availability: 0.98,
          performance: 0.6802721088435374,
          quality: 0.995,
          trs: 0.6633333333333333
        },
        {
          date: "2026-06-24",
          article: "DG4",
          hours: 4.9,
          plannedStops: 0,
          unplannedStops: 0.3,
          production: 40,
          waste: 2,
          availability: 0.9387755102040817,
          performance: 0.5797101449275361,
          quality: 0.95,
          trs: 0.5170068027210883
        },
        {
          date: "2026-06-24",
          article: "CG25",
          hours: 9.5,
          plannedStops: 1,
          unplannedStops: 0.8,
          production: 80,
          waste: 0,
          availability: 0.9157894736842105,
          performance: 0.6926406926406926,
          quality: 1,
          trs: 0.6343130553656869
        },
        {
          date: "2026-06-25",
          article: "CG25",
          hours: 14,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 140,
          waste: 0,
          availability: 0.9642857142857143,
          performance: 0.691358024691358,
          quality: 1,
          trs: 0.6666666666666666
        },
        {
          date: "1900-06-26",
          article: "CG3",
          hours: 13.8,
          plannedStops: 0,
          unplannedStops: 0.6,
          production: 135,
          waste: 0,
          availability: 0.9565217391304348,
          performance: 0.6818181818181818,
          quality: 1,
          trs: 0.6521739130434783
        },
        {
          date: "2026-06-27",
          article: "CM1",
          hours: 8,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 40,
          waste: 4,
          availability: 0.8125,
          performance: 0.6153846153846154,
          quality: 0.9,
          trs: 0.45
        },
        {
          date: "2026-06-29",
          article: "CM1",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 2.5,
          production: 60,
          waste: 0,
          availability: 0.7916666666666666,
          performance: 0.631578947368421,
          quality: 1,
          trs: 0.49999999999999994
        },
        {
          date: "2026-06-29",
          article: "DG4",
          hours: 4,
          plannedStops: 0,
          unplannedStops: 0,
          production: 40,
          waste: 0,
          availability: 1,
          performance: 0.6666666666666666,
          quality: 1,
          trs: 0.6666666666666666
        },
        {
          date: "2026-06-30",
          article: "CG3",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 0,
          production: 135,
          waste: 0,
          availability: 1,
          performance: 0.75,
          quality: 1,
          trs: 0.75
        }
      ]
    },
    {
      key: "juillet-2026",
      name: "juillet 2026",
      label: "JUILLET 2026",
      target: 2500,
      progress: 0.98,
      availability: 0.8657580812362085,
      performance: 0.5308832243808174,
      quality: 1,
      trs: 0.4574858672328808,
      totalProduction: 2450,
      waste: 0,
      activeHours: 322.7,
      articles: [],
      daily: [
        {
          date: "2026-07-01",
          article: "CM1",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 70,
          waste: 0,
          availability: 0.9583333333333334,
          performance: 0.6086956521739131,
          quality: 1,
          trs: 0.5833333333333334
        },
        {
          date: "2026-07-02",
          article: "DG3",
          hours: 8.7,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 50,
          waste: 0,
          availability: 0.8275862068965517,
          performance: 0.462962962962963,
          quality: 1,
          trs: 0.38314176245210735
        },
        {
          date: "2026-07-02",
          article: "DG4",
          hours: 2.3,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.5797101449275363,
          quality: 1,
          trs: 0.5797101449275363
        },
        {
          date: "2026-07-03",
          article: "CG25",
          hours: 14.9,
          plannedStops: 0,
          unplannedStops: 0.1,
          production: 145,
          waste: 0,
          availability: 0.9932885906040269,
          performance: 0.6531531531531531,
          quality: 1,
          trs: 0.6487695749440716
        },
        {
          date: "2026-07-04",
          article: "CG25",
          hours: 5.7,
          plannedStops: 0,
          unplannedStops: 0,
          production: 55,
          waste: 0,
          availability: 1,
          performance: 0.6432748538011696,
          quality: 1,
          trs: 0.6432748538011696
        },
        {
          date: "2026-07-06",
          article: "DG4",
          hours: 5,
          plannedStops: 0,
          unplannedStops: 0,
          production: 40,
          waste: 0,
          availability: 1,
          performance: 0.5333333333333333,
          quality: 1,
          trs: 0.5333333333333333
        },
        {
          date: "2026-07-06",
          article: "CG3",
          hours: 10,
          plannedStops: 0,
          unplannedStops: 0,
          production: 80,
          waste: 0,
          availability: 1,
          performance: 0.5333333333333333,
          quality: 1,
          trs: 0.5333333333333333
        },
        {
          date: "2026-07-07",
          article: "CM1",
          hours: 15,
          plannedStops: 0,
          unplannedStops: 0.3,
          production: 90,
          waste: 0,
          availability: 0.98,
          performance: 0.6122448979591837,
          quality: 1,
          trs: 0.6
        },
        {
          date: "2026-07-08",
          article: "CM1",
          hours: 12.2,
          plannedStops: 0,
          unplannedStops: 1.2,
          production: 70,
          waste: 0,
          availability: 0.9016393442622951,
          performance: 0.6363636363636364,
          quality: 1,
          trs: 0.5737704918032787
        },
        {
          date: "2026-07-08",
          article: "DG4",
          hours: 2.5,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.5333333333333333,
          quality: 1,
          trs: 0.5333333333333333
        },
        {
          date: "2026-07-09",
          article: "DG4",
          hours: 3.8,
          plannedStops: 0,
          unplannedStops: 0,
          production: 30,
          waste: 0,
          availability: 1,
          performance: 0.5263157894736842,
          quality: 1,
          trs: 0.5263157894736842
        },
        {
          date: "2026-07-09",
          article: "CG3",
          hours: 11.4,
          plannedStops: 0,
          unplannedStops: 0,
          production: 90,
          waste: 0,
          availability: 1,
          performance: 0.5263157894736842,
          quality: 1,
          trs: 0.5263157894736842
        },
        {
          date: "2026-07-10",
          article: "CG25",
          hours: 15.1,
          plannedStops: 0,
          unplannedStops: 1.2,
          production: 140,
          waste: 0,
          availability: 0.9205298013245033,
          performance: 0.6714628297362111,
          quality: 1,
          trs: 0.6181015452538632
        },
        {
          date: "2026-07-11",
          article: "CG25",
          hours: 10.3,
          plannedStops: 0,
          unplannedStops: 3.5,
          production: 60,
          waste: 0,
          availability: 0.6601941747572816,
          performance: 0.588235294117647,
          quality: 1,
          trs: 0.38834951456310673
        },
        {
          date: "2026-07-13",
          article: "CM1",
          hours: 14.3,
          plannedStops: 0,
          unplannedStops: 2.5,
          production: 65,
          waste: 0,
          availability: 0.8251748251748252,
          performance: 0.5508474576271186,
          quality: 1,
          trs: 0.45454545454545453
        },
        {
          date: "2026-07-14",
          article: "CM1",
          hours: 3.9,
          plannedStops: 0,
          unplannedStops: 0,
          production: 25,
          waste: 0,
          availability: 1,
          performance: 0.6410256410256411,
          quality: 1,
          trs: 0.6410256410256411
        },
        {
          date: "2026-07-14",
          article: "DG4",
          hours: 10.8,
          plannedStops: 0,
          unplannedStops: 5,
          production: 50,
          waste: 0,
          availability: 0.5370370370370371,
          performance: 0.5747126436781608,
          quality: 1,
          trs: 0.3086419753086419
        },
        {
          date: "2026-07-15",
          article: "DG3",
          hours: 3.2,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.4166666666666667,
          quality: 1,
          trs: 0.4166666666666667
        },
        {
          date: "2026-07-15",
          article: "CG3",
          hours: 13.7,
          plannedStops: 0,
          unplannedStops: 10.5,
          production: 20,
          waste: 0,
          availability: 0.2335766423357664,
          performance: 0.4166666666666668,
          quality: 1,
          trs: 0.09732360097323603
        },
        {
          date: "2026-07-16",
          article: "CG3",
          hours: 8,
          plannedStops: 0,
          unplannedStops: 0.1,
          production: 60,
          waste: 0,
          availability: 0.9875,
          performance: 0.5063291139240507,
          quality: 1,
          trs: 0.5000000000000001
        },
        {
          date: "2026-07-17",
          article: "CG3",
          hours: 12.6,
          plannedStops: 0,
          unplannedStops: 6.5,
          production: 40,
          waste: 0,
          availability: 0.48412698412698413,
          performance: 0.4371584699453552,
          quality: 1,
          trs: 0.21164021164021163
        },
        {
          date: "2026-07-18",
          article: "CG3",
          hours: 3.6,
          plannedStops: 0,
          unplannedStops: 0,
          production: 25,
          waste: 0,
          availability: 1,
          performance: 0.46296296296296297,
          quality: 1,
          trs: 0.46296296296296297
        },
        {
          date: "2026-07-18",
          article: "CM1",
          hours: 4.2,
          plannedStops: 0,
          unplannedStops: 0,
          production: 25,
          waste: 0,
          availability: 1,
          performance: 0.5952380952380952,
          quality: 1,
          trs: 0.5952380952380952
        },
        {
          date: "2026-07-18",
          article: "DG3",
          hours: 1.2,
          plannedStops: 0,
          unplannedStops: 0,
          production: 10,
          waste: 0,
          availability: 1,
          performance: 0.5555555555555556,
          quality: 1,
          trs: 0.5555555555555556
        },
        {
          date: "2026-07-19",
          article: "DG3",
          hours: 5.6,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 40,
          waste: 0,
          availability: 0.9107142857142857,
          performance: 0.5228758169934641,
          quality: 1,
          trs: 0.4761904761904762
        },
        {
          date: "2026-07-19",
          article: "DG4",
          hours: 2.7,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.49382716049382713,
          quality: 1,
          trs: 0.49382716049382713
        },
        {
          date: "2026-07-20",
          article: "DG4",
          hours: 7.6,
          plannedStops: 0,
          unplannedStops: 2.8,
          production: 30,
          waste: 0,
          availability: 0.631578947368421,
          performance: 0.4166666666666667,
          quality: 1,
          trs: 0.2631578947368421
        },
        {
          date: "2026-07-20",
          article: "DG3",
          hours: 2.5,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.5333333333333333,
          quality: 1,
          trs: 0.5333333333333333
        },
        {
          date: "2026-07-21",
          article: "DG3",
          hours: 4.8,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 20,
          waste: 0,
          availability: 0.6875,
          performance: 0.40404040404040403,
          quality: 1,
          trs: 0.2777777777777778
        },
        {
          date: "2026-07-21",
          article: "CG3",
          hours: 5.3,
          plannedStops: 0,
          unplannedStops: 3,
          production: 10,
          waste: 0,
          availability: 0.43396226415094336,
          performance: 0.2898550724637681,
          quality: 1,
          trs: 0.12578616352201258
        },
        {
          date: "2026-07-22",
          article: "CG3",
          hours: 5.7,
          plannedStops: 0,
          unplannedStops: 2.75,
          production: 25,
          waste: 0,
          availability: 0.5175438596491229,
          performance: 0.847457627118644,
          quality: 1,
          trs: 0.4385964912280702
        },
        {
          date: "1900-01-23",
          article: "CG3",
          hours: 16.7,
          plannedStops: 0,
          unplannedStops: 7,
          production: 75,
          waste: 0,
          availability: 0.5808383233532934,
          performance: 0.5154639175257731,
          quality: 1,
          trs: 0.2994011976047904
        },
        {
          date: "2026-07-24",
          article: "CG3",
          hours: 6.3,
          plannedStops: 0,
          unplannedStops: 3.5,
          production: 20,
          waste: 0,
          availability: 0.4444444444444444,
          performance: 0.47619047619047616,
          quality: 1,
          trs: 0.21164021164021163
        },
        {
          date: "2026-07-24",
          article: "CG25",
          hours: 15.9,
          plannedStops: 0,
          unplannedStops: 7,
          production: 95,
          waste: 0,
          availability: 0.559748427672956,
          performance: 0.7116104868913857,
          quality: 1,
          trs: 0.3983228511530398
        },
        {
          date: "2026-07-25",
          article: "CG25",
          hours: 7.8,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 90,
          waste: 0,
          availability: 0.9358974358974359,
          performance: 0.821917808219178,
          quality: 1,
          trs: 0.7692307692307692
        },
        {
          date: "2026-07-25",
          article: "CG3",
          hours: 11.8,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 75,
          waste: 0,
          availability: 0.8728813559322034,
          performance: 0.4854368932038835,
          quality: 1,
          trs: 0.423728813559322
        },
        {
          date: "2026-07-26",
          article: "CM1",
          hours: 19.6,
          plannedStops: 0,
          unplannedStops: 6.5,
          production: 70,
          waste: 0,
          availability: 0.6683673469387755,
          performance: 0.3562340966921119,
          quality: 1,
          trs: 0.23809523809523808
        },
        {
          date: "2026-07-26",
          article: "DG4",
          hours: 2.2,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 15,
          waste: 0,
          availability: 0.7727272727272727,
          performance: 0.588235294117647,
          quality: 1,
          trs: 0.4545454545454545
        },
        {
          date: "2026-07-27",
          article: "DG4",
          hours: 4.6,
          plannedStops: 0,
          unplannedStops: 0,
          production: 35,
          waste: 0,
          availability: 1,
          performance: 0.5072463768115942,
          quality: 1,
          trs: 0.5072463768115942
        },
        {
          date: "2026-07-27",
          article: "DG3",
          hours: 8.2,
          plannedStops: 0,
          unplannedStops: 2.25,
          production: 50,
          waste: 0,
          availability: 0.725609756097561,
          performance: 0.5602240896358545,
          quality: 1,
          trs: 0.4065040650406505
        },
        {
          date: "2026-07-27",
          article: "CG3",
          hours: 7,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 50,
          waste: 0,
          availability: 0.9285714285714286,
          performance: 0.5128205128205128,
          quality: 1,
          trs: 0.47619047619047616
        },
        {
          date: "2026-07-28",
          article: "CM1",
          hours: 15.8,
          plannedStops: 0,
          unplannedStops: 0,
          production: 100,
          waste: 0,
          availability: 1,
          performance: 0.6329113924050633,
          quality: 1,
          trs: 0.6329113924050633
        },
        {
          date: "2026-07-29",
          article: "CG25",
          hours: 15.1,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 120,
          waste: 0,
          availability: 0.9006622516556292,
          performance: 0.5882352941176471,
          quality: 1,
          trs: 0.5298013245033113
        },
        {
          date: "2026-07-30",
          article: "DG4",
          hours: 7.4,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 50,
          waste: 0,
          availability: 0.9324324324324325,
          performance: 0.4830917874396135,
          quality: 1,
          trs: 0.45045045045045046
        },
        {
          date: "2026-07-30",
          article: "DG3",
          hours: 7.9,
          plannedStops: 0,
          unplannedStops: 1.6,
          production: 45,
          waste: 0,
          availability: 0.7974683544303798,
          performance: 0.4761904761904761,
          quality: 1,
          trs: 0.37974683544303794
        },
        {
          date: "2026-07-31",
          article: "DG3",
          hours: 2.9,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 15,
          waste: 0,
          availability: 0.8275862068965517,
          performance: 0.4166666666666667,
          quality: 1,
          trs: 0.3448275862068966
        },
        {
          date: "2026-07-31",
          article: "CG3",
          hours: 11.7,
          plannedStops: 0,
          unplannedStops: 0,
          production: 80,
          waste: 0,
          availability: 1,
          performance: 0.45584045584045585,
          quality: 1,
          trs: 0.45584045584045585
        }
      ]
    },
    {
      key: "aout2026",
      name: "Aout2026",
      label: "JUILLET 2026",
      target: 2500,
      progress: 0.98,
      availability: 0.8657580812362085,
      performance: 0.5308832243808174,
      quality: 1,
      trs: 0.4574858672328808,
      totalProduction: 2450,
      waste: 0,
      activeHours: 322.7,
      articles: [],
      daily: [
        {
          date: "2026-07-01",
          article: "CM1",
          hours: 12,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 70,
          waste: 0,
          availability: 0.9583333333333334,
          performance: 0.6086956521739131,
          quality: 1,
          trs: 0.5833333333333334
        },
        {
          date: "2026-07-02",
          article: "DG3",
          hours: 8.7,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 50,
          waste: 0,
          availability: 0.8275862068965517,
          performance: 0.462962962962963,
          quality: 1,
          trs: 0.38314176245210735
        },
        {
          date: "2026-07-02",
          article: "DG4",
          hours: 2.3,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.5797101449275363,
          quality: 1,
          trs: 0.5797101449275363
        },
        {
          date: "2026-07-03",
          article: "CG25",
          hours: 14.9,
          plannedStops: 0,
          unplannedStops: 0.1,
          production: 145,
          waste: 0,
          availability: 0.9932885906040269,
          performance: 0.6531531531531531,
          quality: 1,
          trs: 0.6487695749440716
        },
        {
          date: "2026-07-04",
          article: "CG25",
          hours: 5.7,
          plannedStops: 0,
          unplannedStops: 0,
          production: 55,
          waste: 0,
          availability: 1,
          performance: 0.6432748538011696,
          quality: 1,
          trs: 0.6432748538011696
        },
        {
          date: "2026-07-06",
          article: "DG4",
          hours: 5,
          plannedStops: 0,
          unplannedStops: 0,
          production: 40,
          waste: 0,
          availability: 1,
          performance: 0.5333333333333333,
          quality: 1,
          trs: 0.5333333333333333
        },
        {
          date: "2026-07-06",
          article: "CG3",
          hours: 10,
          plannedStops: 0,
          unplannedStops: 0,
          production: 80,
          waste: 0,
          availability: 1,
          performance: 0.5333333333333333,
          quality: 1,
          trs: 0.5333333333333333
        },
        {
          date: "2026-07-07",
          article: "CM1",
          hours: 15,
          plannedStops: 0,
          unplannedStops: 0.3,
          production: 90,
          waste: 0,
          availability: 0.98,
          performance: 0.6122448979591837,
          quality: 1,
          trs: 0.6
        },
        {
          date: "2026-07-08",
          article: "CM1",
          hours: 12.2,
          plannedStops: 0,
          unplannedStops: 1.2,
          production: 70,
          waste: 0,
          availability: 0.9016393442622951,
          performance: 0.6363636363636364,
          quality: 1,
          trs: 0.5737704918032787
        },
        {
          date: "2026-07-08",
          article: "DG4",
          hours: 2.5,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.5333333333333333,
          quality: 1,
          trs: 0.5333333333333333
        },
        {
          date: "2026-07-09",
          article: "DG4",
          hours: 3.8,
          plannedStops: 0,
          unplannedStops: 0,
          production: 30,
          waste: 0,
          availability: 1,
          performance: 0.5263157894736842,
          quality: 1,
          trs: 0.5263157894736842
        },
        {
          date: "2026-07-09",
          article: "CG3",
          hours: 11.4,
          plannedStops: 0,
          unplannedStops: 0,
          production: 90,
          waste: 0,
          availability: 1,
          performance: 0.5263157894736842,
          quality: 1,
          trs: 0.5263157894736842
        },
        {
          date: "2026-07-10",
          article: "CG25",
          hours: 15.1,
          plannedStops: 0,
          unplannedStops: 1.2,
          production: 140,
          waste: 0,
          availability: 0.9205298013245033,
          performance: 0.6714628297362111,
          quality: 1,
          trs: 0.6181015452538632
        },
        {
          date: "2026-07-11",
          article: "CG25",
          hours: 10.3,
          plannedStops: 0,
          unplannedStops: 3.5,
          production: 60,
          waste: 0,
          availability: 0.6601941747572816,
          performance: 0.588235294117647,
          quality: 1,
          trs: 0.38834951456310673
        },
        {
          date: "2026-07-13",
          article: "CM1",
          hours: 14.3,
          plannedStops: 0,
          unplannedStops: 2.5,
          production: 65,
          waste: 0,
          availability: 0.8251748251748252,
          performance: 0.5508474576271186,
          quality: 1,
          trs: 0.45454545454545453
        },
        {
          date: "2026-07-14",
          article: "CM1",
          hours: 3.9,
          plannedStops: 0,
          unplannedStops: 0,
          production: 25,
          waste: 0,
          availability: 1,
          performance: 0.6410256410256411,
          quality: 1,
          trs: 0.6410256410256411
        },
        {
          date: "2026-07-14",
          article: "DG4",
          hours: 10.8,
          plannedStops: 0,
          unplannedStops: 5,
          production: 50,
          waste: 0,
          availability: 0.5370370370370371,
          performance: 0.5747126436781608,
          quality: 1,
          trs: 0.3086419753086419
        },
        {
          date: "2026-07-15",
          article: "DG3",
          hours: 3.2,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.4166666666666667,
          quality: 1,
          trs: 0.4166666666666667
        },
        {
          date: "2026-07-15",
          article: "CG3",
          hours: 13.7,
          plannedStops: 0,
          unplannedStops: 10.5,
          production: 20,
          waste: 0,
          availability: 0.2335766423357664,
          performance: 0.4166666666666668,
          quality: 1,
          trs: 0.09732360097323603
        },
        {
          date: "2026-07-16",
          article: "CG3",
          hours: 8,
          plannedStops: 0,
          unplannedStops: 0.1,
          production: 60,
          waste: 0,
          availability: 0.9875,
          performance: 0.5063291139240507,
          quality: 1,
          trs: 0.5000000000000001
        },
        {
          date: "2026-07-17",
          article: "CG3",
          hours: 12.6,
          plannedStops: 0,
          unplannedStops: 6.5,
          production: 40,
          waste: 0,
          availability: 0.48412698412698413,
          performance: 0.4371584699453552,
          quality: 1,
          trs: 0.21164021164021163
        },
        {
          date: "2026-07-18",
          article: "CG3",
          hours: 3.6,
          plannedStops: 0,
          unplannedStops: 0,
          production: 25,
          waste: 0,
          availability: 1,
          performance: 0.46296296296296297,
          quality: 1,
          trs: 0.46296296296296297
        },
        {
          date: "2026-07-18",
          article: "CM1",
          hours: 4.2,
          plannedStops: 0,
          unplannedStops: 0,
          production: 25,
          waste: 0,
          availability: 1,
          performance: 0.5952380952380952,
          quality: 1,
          trs: 0.5952380952380952
        },
        {
          date: "2026-07-18",
          article: "DG3",
          hours: 1.2,
          plannedStops: 0,
          unplannedStops: 0,
          production: 10,
          waste: 0,
          availability: 1,
          performance: 0.5555555555555556,
          quality: 1,
          trs: 0.5555555555555556
        },
        {
          date: "2026-07-19",
          article: "DG3",
          hours: 5.6,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 40,
          waste: 0,
          availability: 0.9107142857142857,
          performance: 0.5228758169934641,
          quality: 1,
          trs: 0.4761904761904762
        },
        {
          date: "2026-07-19",
          article: "DG4",
          hours: 2.7,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.49382716049382713,
          quality: 1,
          trs: 0.49382716049382713
        },
        {
          date: "2026-07-20",
          article: "DG4",
          hours: 7.6,
          plannedStops: 0,
          unplannedStops: 2.8,
          production: 30,
          waste: 0,
          availability: 0.631578947368421,
          performance: 0.4166666666666667,
          quality: 1,
          trs: 0.2631578947368421
        },
        {
          date: "2026-07-20",
          article: "DG3",
          hours: 2.5,
          plannedStops: 0,
          unplannedStops: 0,
          production: 20,
          waste: 0,
          availability: 1,
          performance: 0.5333333333333333,
          quality: 1,
          trs: 0.5333333333333333
        },
        {
          date: "2026-07-21",
          article: "DG3",
          hours: 4.8,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 20,
          waste: 0,
          availability: 0.6875,
          performance: 0.40404040404040403,
          quality: 1,
          trs: 0.2777777777777778
        },
        {
          date: "2026-07-21",
          article: "CG3",
          hours: 5.3,
          plannedStops: 0,
          unplannedStops: 3,
          production: 10,
          waste: 0,
          availability: 0.43396226415094336,
          performance: 0.2898550724637681,
          quality: 1,
          trs: 0.12578616352201258
        },
        {
          date: "2026-07-22",
          article: "CG3",
          hours: 5.7,
          plannedStops: 0,
          unplannedStops: 2.75,
          production: 25,
          waste: 0,
          availability: 0.5175438596491229,
          performance: 0.847457627118644,
          quality: 1,
          trs: 0.4385964912280702
        },
        {
          date: "1900-01-23",
          article: "CG3",
          hours: 16.7,
          plannedStops: 0,
          unplannedStops: 7,
          production: 75,
          waste: 0,
          availability: 0.5808383233532934,
          performance: 0.5154639175257731,
          quality: 1,
          trs: 0.2994011976047904
        },
        {
          date: "2026-07-24",
          article: "CG3",
          hours: 6.3,
          plannedStops: 0,
          unplannedStops: 3.5,
          production: 20,
          waste: 0,
          availability: 0.4444444444444444,
          performance: 0.47619047619047616,
          quality: 1,
          trs: 0.21164021164021163
        },
        {
          date: "2026-07-24",
          article: "CG25",
          hours: 15.9,
          plannedStops: 0,
          unplannedStops: 7,
          production: 95,
          waste: 0,
          availability: 0.559748427672956,
          performance: 0.7116104868913857,
          quality: 1,
          trs: 0.3983228511530398
        },
        {
          date: "2026-07-25",
          article: "CG25",
          hours: 7.8,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 90,
          waste: 0,
          availability: 0.9358974358974359,
          performance: 0.821917808219178,
          quality: 1,
          trs: 0.7692307692307692
        },
        {
          date: "2026-07-25",
          article: "CG3",
          hours: 11.8,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 75,
          waste: 0,
          availability: 0.8728813559322034,
          performance: 0.4854368932038835,
          quality: 1,
          trs: 0.423728813559322
        },
        {
          date: "2026-07-26",
          article: "CM1",
          hours: 19.6,
          plannedStops: 0,
          unplannedStops: 6.5,
          production: 70,
          waste: 0,
          availability: 0.6683673469387755,
          performance: 0.3562340966921119,
          quality: 1,
          trs: 0.23809523809523808
        },
        {
          date: "2026-07-26",
          article: "DG4",
          hours: 2.2,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 15,
          waste: 0,
          availability: 0.7727272727272727,
          performance: 0.588235294117647,
          quality: 1,
          trs: 0.4545454545454545
        },
        {
          date: "2026-07-27",
          article: "DG4",
          hours: 4.6,
          plannedStops: 0,
          unplannedStops: 0,
          production: 35,
          waste: 0,
          availability: 1,
          performance: 0.5072463768115942,
          quality: 1,
          trs: 0.5072463768115942
        },
        {
          date: "2026-07-27",
          article: "DG3",
          hours: 8.2,
          plannedStops: 0,
          unplannedStops: 2.25,
          production: 50,
          waste: 0,
          availability: 0.725609756097561,
          performance: 0.5602240896358545,
          quality: 1,
          trs: 0.4065040650406505
        },
        {
          date: "2026-07-27",
          article: "CG3",
          hours: 7,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 50,
          waste: 0,
          availability: 0.9285714285714286,
          performance: 0.5128205128205128,
          quality: 1,
          trs: 0.47619047619047616
        },
        {
          date: "2026-07-28",
          article: "CM1",
          hours: 15.8,
          plannedStops: 0,
          unplannedStops: 0,
          production: 100,
          waste: 0,
          availability: 1,
          performance: 0.6329113924050633,
          quality: 1,
          trs: 0.6329113924050633
        },
        {
          date: "2026-07-29",
          article: "CG25",
          hours: 15.1,
          plannedStops: 0,
          unplannedStops: 1.5,
          production: 120,
          waste: 0,
          availability: 0.9006622516556292,
          performance: 0.5882352941176471,
          quality: 1,
          trs: 0.5298013245033113
        },
        {
          date: "2026-07-30",
          article: "DG4",
          hours: 7.4,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 50,
          waste: 0,
          availability: 0.9324324324324325,
          performance: 0.4830917874396135,
          quality: 1,
          trs: 0.45045045045045046
        },
        {
          date: "2026-07-30",
          article: "DG3",
          hours: 7.9,
          plannedStops: 0,
          unplannedStops: 1.6,
          production: 45,
          waste: 0,
          availability: 0.7974683544303798,
          performance: 0.4761904761904761,
          quality: 1,
          trs: 0.37974683544303794
        },
        {
          date: "2026-07-31",
          article: "DG3",
          hours: 2.9,
          plannedStops: 0,
          unplannedStops: 0.5,
          production: 15,
          waste: 0,
          availability: 0.8275862068965517,
          performance: 0.4166666666666667,
          quality: 1,
          trs: 0.3448275862068966
        },
        {
          date: "2026-07-31",
          article: "CG3",
          hours: 11.7,
          plannedStops: 0,
          unplannedStops: 0,
          production: 80,
          waste: 0,
          availability: 1,
          performance: 0.45584045584045585,
          quality: 1,
          trs: 0.45584045584045585
        }
      ]
    }
  ]
};

// server/siloExcel.ts
import ExcelJS from "exceljs";

// shared/silo.ts
var SILOS = ["SPF1", "SPF2", "SPF3", "SPF4", "SPF5", "SPF6", "SPF7", "SPF8", "SPF9", "SPF10", "SPF11", "SPF12"];
var SHIPMENT_TYPES = ["Sac", "Vrac"];

// server/siloExcel.ts
var PRODUCTION_SHEET = "Production ";
var SHIPMENT_SHEET = "Expidition Vrac-Sac";
var PRODUCTION_FIRST_ROW = 6;
var SHIPMENT_FIRST_ROW = 7;
var STATE_FIRST_ROW = 9;
var OCCUPANCY_FIRST_ROW = 6;
var PRODUCTION_DATE_COL = 3;
var PRODUCTION_SILO_FIRST_COL = 7;
var STATE_ARTICLE_FIRST_COL = 4;
function excelDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
function columnLetter(index2) {
  let letter = "";
  let current = index2;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    current = Math.floor((current - remainder - 1) / 26);
  }
  return letter;
}
function normalizeHeader(value) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function readText(cell) {
  if (!cell) return "";
  try {
    return cell.text?.trim() ?? "";
  } catch {
    const value = cell.value;
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  }
}
function readNumber(cell) {
  if (!cell) return void 0;
  const value = cell.value;
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "result" in value && typeof value.result === "number") return value.result;
  const text2 = readText(cell).replace(/\s/g, "").replace(",", ".");
  if (!text2) return void 0;
  const parsed = Number(text2);
  return Number.isFinite(parsed) ? parsed : void 0;
}
function readDate(cell) {
  if (!cell) return void 0;
  const value = cell.value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 864e5);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const text2 = readText(cell);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text2)) return text2;
  const french = text2.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (french) return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`;
  return void 0;
}
function findHeaderRow(worksheet, isMatch) {
  for (let rowNumber = 1; rowNumber <= Math.min(40, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = /* @__PURE__ */ new Map();
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = normalizeHeader(readText(cell));
      if (header && !columns.has(header)) columns.set(header, colNumber);
    });
    if (isMatch(columns)) return { rowNumber, columns };
  }
  return void 0;
}
function findColumn(columns, aliases) {
  for (const alias of aliases) {
    const found = columns.get(alias);
    if (found !== void 0) return found;
  }
  return void 0;
}
var DATE_ALIASES = ["DATE"];
var ARTICLE_ALIASES = ["ARTICLE", "ARTICLES", "PRODUIT"];
var LOT_ALIASES = ["NLOT", "NOLOT", "LOT", "NUMEROLOT"];
var QUANTITY_ALIASES = ["QTET", "QTE", "QUANTITET", "QUANTITE", "QTETOTALET", "QTETOTALE"];
var SILO_ALIASES = ["SILO"];
var SHIPMENT_TYPE_ALIASES = ["EXPEDITION", "TYPE", "TYPEEXPEDITION"];
var IGNORED_ROW_LABELS = ["ARTICLE", "TOTAL", "TOTAUX", "TOTALGENERAL"];
async function parseSiloWorkbook(buffer, knownSilos = SILOS) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const entries = [];
  const shipments = [];
  const errors = [];
  const productionSheet = workbook.worksheets.find((worksheet) => findHeaderRow(worksheet, (columns) => findColumn(columns, ARTICLE_ALIASES) !== void 0 && Array.from(columns.keys()).filter((header) => /^SPF\d+$/.test(header)).length >= 2));
  const shipmentSheet = workbook.worksheets.find((worksheet) => findHeaderRow(worksheet, (columns) => findColumn(columns, ARTICLE_ALIASES) !== void 0 && findColumn(columns, SILO_ALIASES) !== void 0 && findColumn(columns, QUANTITY_ALIASES) !== void 0 && Array.from(columns.keys()).every((header) => !/^SPF\d+$/.test(header))));
  if (productionSheet) {
    const header = findHeaderRow(productionSheet, (columns) => findColumn(columns, ARTICLE_ALIASES) !== void 0 && Array.from(columns.keys()).filter((key) => /^SPF\d+$/.test(key)).length >= 2);
    const articleCol = findColumn(header.columns, ARTICLE_ALIASES);
    const dateCol = findColumn(header.columns, DATE_ALIASES);
    const lotCol = findColumn(header.columns, LOT_ALIASES);
    const totalCol = findColumn(header.columns, QUANTITY_ALIASES);
    const siloColumns = [];
    knownSilos.forEach((silo) => {
      const column = header.columns.get(normalizeHeader(silo));
      if (column !== void 0) siloColumns.push({ silo, column });
    });
    let lastDate;
    for (let rowNumber = header.rowNumber + 1; rowNumber <= productionSheet.rowCount; rowNumber += 1) {
      const row = productionSheet.getRow(rowNumber);
      const article = readText(row.getCell(articleCol));
      if (!article || IGNORED_ROW_LABELS.includes(normalizeHeader(article))) continue;
      const rowDate = dateCol ? readDate(row.getCell(dateCol)) : void 0;
      if (rowDate) lastDate = rowDate;
      const allocations = [];
      siloColumns.forEach(({ silo, column }) => {
        const quantity = readNumber(row.getCell(column));
        if (quantity !== void 0 && quantity !== 0) allocations.push({ silo, quantity });
      });
      if (allocations.length === 0) continue;
      entries.push({
        entryDate: rowDate ?? lastDate,
        article,
        lotNumber: lotCol ? readText(row.getCell(lotCol)) || void 0 : void 0,
        totalQuantity: totalCol ? readNumber(row.getCell(totalCol)) : void 0,
        allocations
      });
    }
  } else {
    errors.push("Feuille des entr\xE9es de production introuvable : une ligne d\u2019en-t\xEAte avec \xAB Article \xBB et les colonnes SPF est attendue.");
  }
  if (shipmentSheet) {
    const header = findHeaderRow(shipmentSheet, (columns) => findColumn(columns, ARTICLE_ALIASES) !== void 0 && findColumn(columns, SILO_ALIASES) !== void 0 && findColumn(columns, QUANTITY_ALIASES) !== void 0 && Array.from(columns.keys()).every((key) => !/^SPF\d+$/.test(key)));
    const articleCol = findColumn(header.columns, ARTICLE_ALIASES);
    const siloCol = findColumn(header.columns, SILO_ALIASES);
    const quantityCol = findColumn(header.columns, QUANTITY_ALIASES);
    const dateCol = findColumn(header.columns, DATE_ALIASES);
    const lotCol = findColumn(header.columns, LOT_ALIASES);
    const typeCol = findColumn(header.columns, SHIPMENT_TYPE_ALIASES);
    let lastDate;
    let lastArticle;
    let lastSilo;
    let lastType;
    for (let rowNumber = header.rowNumber + 1; rowNumber <= shipmentSheet.rowCount; rowNumber += 1) {
      const row = shipmentSheet.getRow(rowNumber);
      const rawArticle = readText(row.getCell(articleCol));
      const rawSilo = readText(row.getCell(siloCol)).toUpperCase();
      const quantity = readNumber(row.getCell(quantityCol));
      if (rawArticle && IGNORED_ROW_LABELS.includes(normalizeHeader(rawArticle))) continue;
      if (!rawArticle && !rawSilo && quantity === void 0) continue;
      const article = rawArticle || lastArticle;
      const silo = rawSilo || lastSilo;
      if (!article) continue;
      if (rawArticle) lastArticle = rawArticle;
      if (rawSilo) lastSilo = rawSilo;
      const rowDate = dateCol ? readDate(row.getCell(dateCol)) : void 0;
      if (rowDate) lastDate = rowDate;
      if (quantity === void 0) {
        errors.push(`Feuille ${shipmentSheet.name}, ligne ${rowNumber} : quantit\xE9 exp\xE9di\xE9e illisible.`);
        continue;
      }
      if (!silo || !knownSilos.includes(silo)) {
        errors.push(`Feuille ${shipmentSheet.name}, ligne ${rowNumber} : silo \xAB ${silo || "vide"} \xBB inconnu.`);
        continue;
      }
      const rawType = typeCol ? readText(row.getCell(typeCol)) : "";
      if (rawType) lastType = rawType;
      const shipmentType = SHIPMENT_TYPES.find((type) => normalizeHeader(type) === normalizeHeader(rawType || lastType || "")) ?? SHIPMENT_TYPES[0];
      shipments.push({
        shipmentDate: rowDate ?? lastDate,
        article,
        lotNumber: lotCol ? readText(row.getCell(lotCol)) || void 0 : void 0,
        quantity,
        silo,
        shipmentType
      });
    }
  } else {
    errors.push("Feuille des exp\xE9ditions introuvable : une ligne d\u2019en-t\xEAte avec \xAB Article \xBB, \xAB Qt\xE9 \xBB et \xAB Silo \xBB est attendue.");
  }
  return { entries, shipments, errors };
}
var TITLE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF132B35" } };
var HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4826" } };
function styleHeaderRow(row, firstCol, lastCol) {
  for (let col = firstCol; col <= lastCol; col += 1) {
    const cell = row.getCell(col);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
  row.height = 24;
}
function writeTitle(worksheet, rowNumber, firstCol, lastCol, title) {
  const row = worksheet.getRow(rowNumber);
  row.getCell(firstCol).value = title;
  worksheet.mergeCells(rowNumber, firstCol, rowNumber, lastCol);
  const cell = row.getCell(firstCol);
  cell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  cell.fill = TITLE_FILL;
  cell.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 26;
}
async function buildSiloWorkbook(entries, shipments, articles, silos2 = SILOS) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Almara\xEFi Production Pulse";
  workbook.created = /* @__PURE__ */ new Date();
  workbook.modified = /* @__PURE__ */ new Date();
  const exportedArticles = articles.length > 0 ? [...articles] : ["\u2014"];
  const siloLastCol = PRODUCTION_SILO_FIRST_COL + silos2.length - 1;
  const stateLastArticleCol = STATE_ARTICLE_FIRST_COL + exportedArticles.length - 1;
  const stateLastRow = STATE_FIRST_ROW + silos2.length - 1;
  const occupancyLastRow = OCCUPANCY_FIRST_ROW + silos2.length - 1;
  const production = workbook.addWorksheet(PRODUCTION_SHEET, { views: [{ state: "frozen", ySplit: 5 }] });
  writeTitle(production, 3, PRODUCTION_DATE_COL, siloLastCol, "\u{1F4CA}  SYNTH\xC8SE \u2014 Tra\xE7abilit\xE9 des Lots par Silo");
  const productionHeader = production.getRow(5);
  ["Date", "Article", "N\xB0 Lot", "Qt\xE9 totale (T)", ...silos2].forEach((label, index2) => {
    productionHeader.getCell(PRODUCTION_DATE_COL + index2).value = label;
  });
  styleHeaderRow(productionHeader, PRODUCTION_DATE_COL, siloLastCol);
  production.getColumn(PRODUCTION_DATE_COL).width = 13;
  production.getColumn(PRODUCTION_DATE_COL + 1).width = 11;
  production.getColumn(PRODUCTION_DATE_COL + 2).width = 17;
  production.getColumn(PRODUCTION_DATE_COL + 3).width = 14;
  silos2.forEach((_, index2) => {
    production.getColumn(PRODUCTION_SILO_FIRST_COL + index2).width = 9;
  });
  entries.forEach((entry, index2) => {
    const row = production.getRow(PRODUCTION_FIRST_ROW + index2);
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
      const siloIndex = silos2.indexOf(allocation.silo);
      if (siloIndex === -1) return;
      const cell = row.getCell(PRODUCTION_SILO_FIRST_COL + siloIndex);
      cell.value = Number(allocation.quantity);
      cell.numFmt = "0.00";
    });
  });
  const shipment = workbook.addWorksheet(SHIPMENT_SHEET, { views: [{ state: "frozen", ySplit: 6 }] });
  const shipmentLastCol = PRODUCTION_DATE_COL + 6;
  writeTitle(shipment, 2, PRODUCTION_DATE_COL, shipmentLastCol, "  EXP\xC9DITIONS VRAC / SAC");
  const shipmentLabels = ["Date", "Article", "N\xB0 Lot", "Qt\xE9 (T)", "Qt\xE9 G(T)", "Silo", "Exp\xE9dition"];
  [6].forEach((rowNumber) => {
    const row = shipment.getRow(rowNumber);
    shipmentLabels.forEach((label, index2) => {
      row.getCell(PRODUCTION_DATE_COL + index2).value = label;
    });
    styleHeaderRow(row, PRODUCTION_DATE_COL, shipmentLastCol);
  });
  shipment.getColumn(PRODUCTION_DATE_COL).width = 13;
  shipment.getColumn(PRODUCTION_DATE_COL + 1).width = 11;
  shipment.getColumn(PRODUCTION_DATE_COL + 2).width = 17;
  shipment.getColumn(PRODUCTION_DATE_COL + 3).width = 11;
  shipment.getColumn(PRODUCTION_DATE_COL + 4).width = 11;
  shipment.getColumn(PRODUCTION_DATE_COL + 5).width = 9;
  shipment.getColumn(PRODUCTION_DATE_COL + 6).width = 12;
  shipments.forEach((line, index2) => {
    const row = shipment.getRow(SHIPMENT_FIRST_ROW + index2);
    if (line.lotNumber) row.getCell(PRODUCTION_DATE_COL + 2).value = line.lotNumber;
    row.getCell(PRODUCTION_DATE_COL + 3).value = Number(line.quantity);
    row.getCell(PRODUCTION_DATE_COL + 3).numFmt = "0.00";
  });
  const shipmentGroupKey2 = (line, index2) => line.splitGroupId ? `group:${line.splitGroupId}` : `single:${index2}`;
  const shipmentGroupColumns = [PRODUCTION_DATE_COL, PRODUCTION_DATE_COL + 1, PRODUCTION_DATE_COL + 4, PRODUCTION_DATE_COL + 5, PRODUCTION_DATE_COL + 6];
  let groupStart = 0;
  while (groupStart < shipments.length) {
    let groupEnd = groupStart;
    while (groupEnd + 1 < shipments.length && shipmentGroupKey2(shipments[groupEnd + 1], groupEnd + 1) === shipmentGroupKey2(shipments[groupStart], groupStart)) groupEnd += 1;
    const startRow = SHIPMENT_FIRST_ROW + groupStart;
    const endRow = SHIPMENT_FIRST_ROW + groupEnd;
    const group = shipments.slice(groupStart, groupEnd + 1);
    if (endRow > startRow) shipmentGroupColumns.forEach((col) => shipment.mergeCells(startRow, col, endRow, col));
    const dateCell = shipment.getCell(startRow, PRODUCTION_DATE_COL);
    if (group[0].shipmentDate) {
      dateCell.value = excelDate(group[0].shipmentDate);
      dateCell.numFmt = "dd/mm/yyyy";
    }
    dateCell.alignment = { vertical: "middle", horizontal: "center" };
    const articleCell = shipment.getCell(startRow, PRODUCTION_DATE_COL + 1);
    articleCell.value = group[0].article;
    articleCell.alignment = { vertical: "middle", horizontal: "center" };
    const totalCell = shipment.getCell(startRow, PRODUCTION_DATE_COL + 4);
    totalCell.value = group.reduce((sum, line) => sum + Number(line.quantity), 0);
    totalCell.numFmt = "0.00";
    totalCell.alignment = { vertical: "middle", horizontal: "center" };
    const siloCell = shipment.getCell(startRow, PRODUCTION_DATE_COL + 5);
    siloCell.value = group[0].silo;
    siloCell.alignment = { vertical: "middle", horizontal: "center" };
    const typeCell = shipment.getCell(startRow, PRODUCTION_DATE_COL + 6);
    typeCell.value = group[0].shipmentType;
    typeCell.alignment = { vertical: "middle", horizontal: "center" };
    groupStart = groupEnd + 1;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// server/storage.ts
import { issueSignedToken, presignUrl as blobPresignUrl, put as blobPut } from "@vercel/blob";
function isVercelBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}
function getLocalStorageBaseUrl() {
  const configuredBaseUrl = process.env.PUBLIC_BASE_URL || process.env.VITE_PUBLIC_BASE_URL;
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  }
  return `http://localhost:${process.env.PORT || 3e3}`;
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function localStorageUrlForKey(relKey) {
  return `${getLocalStorageBaseUrl()}/local-storage/${normalizeKey(relKey)}`;
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  if (isVercelBlobConfigured()) {
    const key2 = appendHashSuffix(normalizeKey(relKey));
    const body = typeof data === "string" ? data : Buffer.from(data);
    const blob2 = await blobPut(key2, body, { access: "public", contentType, addRandomSuffix: false });
    return { key: blob2.pathname, url: blob2.url };
  }
  const { key, uploadUrl } = await storageCreatePresignedUpload(relKey);
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload failed (${uploadResp.status})`);
  }
  return { key, url: localStorageUrlForKey(key) };
}
async function storageCreatePresignedUpload(relKey) {
  const key = appendHashSuffix(normalizeKey(relKey));
  return { key, uploadUrl: localStorageUrlForKey(key) };
}
async function storageGetSignedUrl(relKey) {
  const key = normalizeKey(relKey);
  if (isVercelBlobConfigured()) {
    const token = await issueSignedToken({ pathname: key, operations: ["get"], validUntil: Date.now() + 5 * 60 * 1e3 });
    const { presignedUrl } = await blobPresignUrl(token, { operation: "get", pathname: key, access: "private" });
    return presignedUrl;
  }
  return localStorageUrlForKey(key);
}

// server/excelSync.ts
var EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
var EXCEL_FILE_NAME = "Registre_Production_Synchronise.xlsx";
function asNumber(value) {
  return typeof value === "number" ? value : Number(value);
}
var monthNumbers = {
  janvier: "01",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12"
};
function periodPrefix(monthKey) {
  const normalized = monthKey.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const year = normalized.match(/\d{4}/)?.[0];
  const monthName = Object.keys(monthNumbers).find((name) => normalized.startsWith(name));
  if (!year || !monthName) return void 0;
  return `${year}-${monthNumbers[monthName]}`;
}
function normalizeDateForPeriod(date, prefix) {
  if (!prefix || date.startsWith(prefix)) return date;
  const day = date.match(/-(\d{2})$/)?.[1];
  return day ? `${prefix}-${day}` : date;
}
function buildSeedRows() {
  const months = app_data_default.months;
  const rows = months.flatMap((month) => {
    const prefix = periodPrefix(month.key);
    return month.daily.map((day) => ({ ...day, date: normalizeDateForPeriod(day.date, prefix) }));
  }).map((day) => {
    const realHours = Math.max(day.hours - day.plannedStops - day.unplannedStops, 0);
    const standardRate = realHours > 0 && day.performance > 0 ? day.production / (realHours * day.performance) : 15;
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
      comment: null,
      source: "excel"
    };
  });
  const unique = new Map(rows.map((row) => [`${row.productionDate}::${row.article}::${row.totalProductionHours}::${row.productionTons}`, row]));
  return Array.from(unique.values());
}
function shouldSeedExcelRecords(existingRecordCount, hasSynchronizedFile) {
  return existingRecordCount === 0 && !hasSynchronizedFile;
}
async function seedExcelRecordsIfNeeded() {
  const db = await getDb();
  if (!db) {
    return { seeded: false, count: 0 };
  }
  const existingRecords = await db.select({ id: productionRecords.id }).from(productionRecords).limit(1);
  const currentFile = await getSynchronizedExcelFile();
  if (!shouldSeedExcelRecords(existingRecords.length, Boolean(currentFile))) {
    return { seeded: false, count: 0 };
  }
  const rows = buildSeedRows();
  for (let start = 0; start < rows.length; start += 100) {
    await db.insert(productionRecords).values(rows.slice(start, start + 100));
  }
  return { seeded: true, count: rows.length };
}
async function getSynchronizedExcelFile() {
  const db = await getDb();
  if (!db) return getSynchronizedExcelFileFallback();
  const rows = await db.select().from(synchronizedExcelFiles).where(eq2(synchronizedExcelFiles.id, 1)).limit(1);
  return rows[0];
}
async function syncExcelFromRecords() {
  const db = await getDb();
  const records = db ? await db.select().from(productionRecords).orderBy(asc2(productionRecords.productionDate), asc2(productionRecords.article), asc2(productionRecords.id)) : await listProductionRecords();
  const workbook = new ExcelJS2.Workbook();
  workbook.creator = "Almara\xEFi Production Pulse";
  workbook.created = /* @__PURE__ */ new Date();
  workbook.modified = /* @__PURE__ */ new Date();
  const worksheet = workbook.addWorksheet("Registre journalier", {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  worksheet.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "DATE", key: "date", width: 14 },
    { header: "ARTICLE", key: "article", width: 16 },
    { header: "TEMPS TOTAL PROD. (h)", key: "hours", width: 23 },
    { header: "ARR\xCATS PLAN. (h)", key: "plannedStops", width: 19 },
    { header: "ARR\xCATS NON PL. (h)", key: "unplannedStops", width: 21 },
    { header: "PROD. (T)", key: "production", width: 14 },
    { header: "REBUTS (T)", key: "waste", width: 14 },
    { header: "CADENCE STD", key: "standardRate", width: 16 },
    { header: "DISPO. %", key: "availability", width: 13 },
    { header: "PERF. %", key: "performance", width: 13 },
    { header: "QUALIT\xC9 %", key: "quality", width: 14 },
    { header: "TRS %", key: "trs", width: 13 },
    { header: "H. R\xC9ELLES", key: "realHours", width: 16 },
    { header: "COMMENTAIRE", key: "comment", width: 46 },
    { header: "SOURCE", key: "source", width: 14 }
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
      date: excelDate(record.productionDate),
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
      comment: record.comment ?? "",
      source: record.source
    });
  });
  worksheet.getColumn("date").numFmt = "dd/mm/yyyy";
  ["hours", "plannedStops", "unplannedStops", "production", "waste", "standardRate", "realHours"].forEach((key) => {
    worksheet.getColumn(key).numFmt = "0.00";
  });
  ["availability", "performance", "quality", "trs"].forEach((key) => {
    worksheet.getColumn(key).numFmt = "0.0%";
  });
  worksheet.autoFilter = "A1:P1";
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  let uploaded;
  try {
    uploaded = await storagePut(`production-sync/${EXCEL_FILE_NAME}`, buffer, EXCEL_MIME);
  } catch (error) {
    console.error("[ExcelSync] \xC9chec de l\u2019enregistrement du fichier Excel synchronis\xE9 (le registre reste \xE0 jour en base) :", error);
    return db ? getSynchronizedExcelFile() : getSynchronizedExcelFileFallback();
  }
  const fileValues = {
    id: 1,
    fileName: EXCEL_FILE_NAME,
    storageKey: uploaded.key,
    downloadUrl: uploaded.url,
    recordCount: records.length
  };
  if (!db) {
    return saveSynchronizedExcelFileFallback(fileValues);
  }
  await db.insert(synchronizedExcelFiles).values(fileValues).onConflictDoUpdate({
    target: synchronizedExcelFiles.id,
    set: {
      fileName: fileValues.fileName,
      storageKey: fileValues.storageKey,
      downloadUrl: fileValues.downloadUrl,
      recordCount: fileValues.recordCount,
      updatedAt: /* @__PURE__ */ new Date()
    }
  });
  return getSynchronizedExcelFile();
}
async function initializeSynchronizedExcel() {
  const seed = await seedExcelRecordsIfNeeded();
  const currentFile = await getSynchronizedExcelFile();
  const file = seed.seeded || !currentFile ? await syncExcelFromRecords() : currentFile;
  return { ...file, seeded: seed.seeded, seedCount: seed.count };
}

// server/excelImport.ts
import ExcelJS3 from "exceljs";
import { eq as eq3 } from "drizzle-orm";
var requiredHeaders = {
  date: ["DATE", "DATEDEPRODUCTION", "JOUR"],
  article: ["ARTICLE", "ARTICLES", "PRODUIT", "PRODUITS", "CODEARTICLE", "DESIGNATION"],
  totalProductionHours: ["TEMPSTOTALPRODH", "TEMPSTOTALPRODHPARARTICLE", "TEMPSTOTALPRODUCTION", "TEMPSTOTALPRODUCTIONH", "TEMPSTOTALPRODUCTIONPARARTICLE", "TEMPSPRODH", "TEMPSPRODUCTION", "TEMPSPRODUCTIONH", "TEMPSDEPRODUCTION", "TEMPSDEPRODUCTIONH", "DUREEPROD", "DUREEPRODH", "DUREEDEPRODUCTION", "DUREEDEPRODUCTIONH", "HEURESPROD", "HEURESPRODUCTION", "NBHEURESPROD"],
  plannedStopsHours: ["ARRETSPLANH"],
  unplannedStopsHours: ["ARRETSNONPLH"],
  productionTons: ["PRODT", "PRODUCTIONT"],
  wasteTons: ["REBUTST"],
  standardRate: ["CADENCESTD", "CADENCESTDDARTICLE"]
};
var optionalHeaders = {
  realHours: ["HRELLES", "HREELLES", "HEURESRELLES", "HEUREREELLES", "TEMPSREEL", "TEMPSREELH"]
};
var frenchMonthNumbers = {
  janv: "01",
  janvier: "01",
  fev: "02",
  fevr: "02",
  fevrier: "02",
  mars: "03",
  avr: "04",
  avril: "04",
  mai: "05",
  juin: "06",
  juil: "07",
  juillet: "07",
  aout: "08",
  sept: "09",
  septembre: "09",
  oct: "10",
  octobre: "10",
  nov: "11",
  novembre: "11",
  dec: "12",
  decembre: "12"
};
function normalizeHeader2(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function matchesHeader(header, aliases) {
  return aliases.some((alias) => header === alias || header.startsWith(alias) || alias.length >= 5 && header.includes(alias));
}
function readCellText(cell) {
  try {
    return cell.text?.trim() ?? "";
  } catch {
    const value = cell.value;
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  }
}
function parseNumeric(value, text2) {
  if (typeof value === "number") return value;
  const normalized = text2.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
function toIsoDate(value, text2, fallbackYear) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 864e5);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const iso = text2.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text2;
  const french = text2.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (french) return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`;
  const localized = text2.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\./g, "").match(/^(\d{1,2})[-\s]([a-z]+)/);
  const month = localized ? frenchMonthNumbers[localized[2]] : void 0;
  if (localized && month && fallbackYear) return `${fallbackYear}-${month}-${localized[1].padStart(2, "0")}`;
  return void 0;
}
function findSheetYear(worksheet) {
  const firstRows = Array.from({ length: Math.min(8, worksheet.rowCount) }, (_, index2) => {
    const values = worksheet.getRow(index2 + 1).values;
    return Array.isArray(values) ? values.map((value) => String(value ?? "")).join(" ") : "";
  }).join(" ");
  const year = `${firstRows} ${worksheet.name}`.match(/(20\d{2})/)?.[1];
  return year ? Number(year) : void 0;
}
function findHeaderRow2(worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(100, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rowValues = Array.isArray(row.values) ? row.values : [];
    const headers = rowValues.map((value) => normalizeHeader2(String(value ?? "")));
    if (headers.some((header) => matchesHeader(header, requiredHeaders.date)) && headers.some((header) => matchesHeader(header, requiredHeaders.article))) return row;
  }
  return void 0;
}
function calculateRow(row) {
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
    source: "excel-import"
  };
}
function productionRowFingerprint(row) {
  const number = (value) => Number(value).toFixed(2);
  const comment = (row.comment ?? "").trim().replace(/\s+/g, " ");
  return [
    row.productionDate,
    row.article.trim().toUpperCase(),
    number(row.totalProductionHours),
    number(row.plannedStopsHours),
    number(row.unplannedStopsHours),
    number(row.productionTons),
    number(row.wasteTons),
    number(row.standardRate),
    comment
  ].join("|");
}
async function parseImportedWorkbook(buffer) {
  const workbook = new ExcelJS3.Workbook();
  await workbook.xlsx.load(buffer);
  if (workbook.worksheets.length === 0) return { rows: [], errors: ["Le fichier Excel ne contient aucune feuille."] };
  const rows = [];
  const errors = [];
  let foundRegistrySheet = false;
  for (const worksheet of workbook.worksheets) {
    const headerRow = findHeaderRow2(worksheet);
    if (!headerRow) continue;
    foundRegistrySheet = true;
    const sheetYear = findSheetYear(worksheet);
    const headerIndexes = /* @__PURE__ */ new Map();
    headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => headerIndexes.set(normalizeHeader2(readCellText(cell)), columnNumber));
    const findColumn2 = (aliases) => Array.from(headerIndexes.entries()).find(([header]) => matchesHeader(header, aliases))?.[1];
    const columns = Object.fromEntries(Object.entries(requiredHeaders).map(([key, aliases]) => [key, findColumn2(aliases)]));
    const realHoursColumn = findColumn2(optionalHeaders.realHours);
    const missingHeaders = Object.entries(columns).filter(([key, column]) => !column && !(key === "totalProductionHours" && realHoursColumn)).map(([key]) => key);
    if (missingHeaders.length) {
      errors.push(`Feuille ${worksheet.name} : colonnes obligatoires manquantes : ${missingHeaders.join(", ")}.`);
      continue;
    }
    const idColumn = findColumn2(["ID"]);
    const commentColumn = findColumn2(["COMMENTAIRE", "COMMENT"]);
    for (let rowNumber = headerRow.number + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const articleCell = row.getCell(columns.article);
      const article = readCellText(articleCell).toUpperCase();
      const dateCell = row.getCell(columns.date);
      if (!article && !readCellText(dateCell)) continue;
      const productionDate = toIsoDate(dateCell.value, readCellText(dateCell), sheetYear);
      const asZeroWhenBlank = (column) => {
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
        productionTons: parseNumeric(row.getCell(columns.productionTons).value, readCellText(row.getCell(columns.productionTons))),
        wasteTons: asZeroWhenBlank(columns.wasteTons),
        standardRate: parseNumeric(row.getCell(columns.standardRate).value, readCellText(row.getCell(columns.standardRate)))
      };
      if (!productionDate || !article || Object.values(values).some((value) => !Number.isFinite(value))) {
        errors.push(`Feuille ${worksheet.name}, ligne ${rowNumber} : date, article ou valeurs num\xE9riques invalides.`);
        continue;
      }
      if (values.totalProductionHours <= 0 || values.productionTons <= 0 || values.standardRate <= 0 || values.plannedStopsHours < 0 || values.unplannedStopsHours < 0 || values.wasteTons < 0 || values.wasteTons > values.productionTons || values.plannedStopsHours + values.unplannedStopsHours > values.totalProductionHours) {
        errors.push(`Feuille ${worksheet.name}, ligne ${rowNumber} : les temps, la production ou les rebuts ne respectent pas les r\xE8gles du registre.`);
        continue;
      }
      const idValue = idColumn ? parseNumeric(row.getCell(idColumn).value, readCellText(row.getCell(idColumn))) : Number.NaN;
      rows.push({ rowNumber, id: Number.isInteger(idValue) && idValue > 0 ? idValue : void 0, productionDate, article, ...values, comment: commentColumn ? readCellText(row.getCell(commentColumn)) : void 0 });
    }
  }
  if (!foundRegistrySheet) return { rows: [], errors: ["Les en-t\xEAtes de date et d\u2019article sont introuvables dans les cent premi\xE8res lignes de toutes les feuilles du fichier."] };
  return { rows, errors };
}
function naturalKey(productionDate, article, productionTons) {
  return `${productionDate}::${article.trim().toUpperCase()}::${Number(productionTons).toFixed(2)}`;
}
function planImportDecisions(rows, existing) {
  const byId = new Map(existing.map((record) => [record.id, record]));
  const byNaturalKey = /* @__PURE__ */ new Map();
  for (const record of existing) {
    const key = naturalKey(record.productionDate, record.article, record.productionTons);
    const group = byNaturalKey.get(key) ?? [];
    group.push(record);
    byNaturalKey.set(key, group);
  }
  for (const group of Array.from(byNaturalKey.values())) group.sort((a, b) => a.id - b.id);
  const claimedIds = /* @__PURE__ */ new Set();
  const seenNewFingerprints = /* @__PURE__ */ new Set();
  const decisions = [];
  for (const row of rows) {
    const values = calculateRow(row);
    const fingerprint = productionRowFingerprint(values);
    let existingRecord = row.id ? byId.get(row.id) : void 0;
    if (!existingRecord) {
      const key = naturalKey(values.productionDate, values.article, values.productionTons);
      existingRecord = (byNaturalKey.get(key) ?? []).find((candidate) => !claimedIds.has(candidate.id));
    }
    if (existingRecord) {
      claimedIds.add(existingRecord.id);
      if (productionRowFingerprint(existingRecord) === fingerprint) {
        decisions.push({ kind: "unchanged", row });
      } else {
        decisions.push({ kind: "update", row, existingId: existingRecord.id, before: existingRecord, values });
      }
    } else if (seenNewFingerprints.has(fingerprint)) {
      decisions.push({ kind: "unchanged", row });
    } else {
      decisions.push({ kind: "create", row, values });
      seenNewFingerprints.add(fingerprint);
    }
  }
  return decisions;
}
async function loadExistingProductionRecords() {
  const db = await getDb();
  return db ? await db.select().from(productionRecords) : await listProductionRecords();
}
var CHANGE_FIELDS = [
  { field: "productionDate", label: "Date" },
  { field: "article", label: "Article" },
  { field: "totalProductionHours", label: "Temps total prod. (h)" },
  { field: "plannedStopsHours", label: "Arr\xEAts plan. (h)" },
  { field: "unplannedStopsHours", label: "Arr\xEAts non pl. (h)" },
  { field: "productionTons", label: "Production (T)" },
  { field: "wasteTons", label: "Rebuts (T)" },
  { field: "standardRate", label: "Cadence std" },
  { field: "comment", label: "Commentaire" }
];
function formatChangeValue(field, value) {
  if (field === "productionDate" || field === "article") return String(value ?? "");
  if (field === "comment") return String(value ?? "").trim() || "\u2014";
  return Number(value).toFixed(2);
}
function describeChanges(before, after) {
  return CHANGE_FIELDS.map(({ field, label }) => ({ field, label, before: formatChangeValue(field, before[field]), after: formatChangeValue(field, after[field]) })).filter((change) => change.before !== change.after);
}
async function previewProductionImport(rows) {
  const decisions = planImportDecisions(rows, await loadExistingProductionRecords());
  const toUpdate = decisions.filter((decision) => decision.kind === "update").map((decision) => ({ id: decision.existingId, productionDate: decision.values.productionDate, article: decision.values.article, changes: describeChanges(decision.before, decision.values) }));
  return {
    toCreate: decisions.filter((decision) => decision.kind === "create").length,
    toUpdate,
    unchanged: decisions.filter((decision) => decision.kind === "unchanged").length
  };
}
async function importProductionRows(rows, options = {}) {
  const applyModifications = options.applyModifications ?? true;
  const db = await getDb();
  const decisions = planImportDecisions(rows, await loadExistingProductionRecords());
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let pendingModifications = 0;
  for (const decision of decisions) {
    if (decision.kind === "unchanged") {
      skipped += 1;
      continue;
    }
    if (decision.kind === "create") {
      if (db) {
        await db.insert(productionRecords).values(decision.values);
      } else {
        await createProductionRecord(decision.values);
      }
      created += 1;
    } else {
      if (!applyModifications) {
        pendingModifications += 1;
        continue;
      }
      if (db) {
        await db.update(productionRecords).set({ ...decision.values, updatedAt: /* @__PURE__ */ new Date() }).where(eq3(productionRecords.id, decision.existingId));
      } else {
        await updateProductionRecord(decision.existingId, decision.values);
      }
      updated += 1;
    }
    await addProductionArticle(decision.row.article);
  }
  return { created, updated, skipped, pendingModifications, total: rows.length };
}

// server/dailyProgramExcel.ts
import ExcelJS4 from "exceljs";
function normalizeHeader3(value) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function readText2(cell) {
  if (!cell) return "";
  const value = cell.value;
  if (value === null || value === void 0) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  if (value instanceof Date) return "";
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("").trim();
  }
  try {
    return String(cell.text ?? "").trim();
  } catch {
    return "";
  }
}
function readTime(cell) {
  const value = cell?.value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hours = String(value.getUTCHours()).padStart(2, "0");
    const minutes = String(value.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  if (typeof value === "number") {
    const fraction = (value % 1 + 1) % 1;
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  const match = readText2(cell).match(/^(\d{1,2})[:h](\d{2})/i);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : void 0;
}
function findCellTextMatching(row, columnCount, pattern) {
  for (let col = 1; col <= columnCount; col += 1) {
    const text2 = readText2(row.getCell(col));
    if (pattern.test(text2)) return text2;
  }
  return void 0;
}
function isRowEmpty(row, columnCount) {
  for (let col = 1; col <= columnCount; col += 1) {
    if (readText2(row.getCell(col))) return false;
  }
  return true;
}
var DATE_LABEL_RE = /date\s*:/i;
var PUPITREUR_LABEL_RE = /pupitreur\s*:/i;
var DATE_VALUE_RE = /(\d{1,2})\s*\/+\s*(\d{1,2})\s*\/\s*(\d{4})/;
var SHIFT_RANGE_RE = /de\s*\d{1,2}[:h]\d{2}\s*[àa]\s*\d{1,2}[:h]\d{2}/gi;
function parseProgramDate(text2) {
  const match = text2.match(DATE_VALUE_RE);
  if (!match) return void 0;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || day > 31 || month < 1 || month > 12) return void 0;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function parseOperatorNames(text2) {
  return text2.replace(PUPITREUR_LABEL_RE, "").replace(SHIFT_RANGE_RE, " ").split(/[&\n]/).map((part) => part.trim()).filter(Boolean);
}
var HEADER_ALIASES = {
  sequence: ["N"],
  article: ["ARTICLE"],
  version: ["VERSION"],
  bag: ["SAC"],
  bulk: ["VRAC"],
  start: ["HDEBUTPREVUE", "HDEBUT"],
  end: ["HFINPREVUE", "HFIN"],
  observation: ["OBSERVATION"]
};
function findHeaderColumns(row, columnCount) {
  const found = {};
  for (let col = 1; col <= columnCount; col += 1) {
    const header = normalizeHeader3(readText2(row.getCell(col)));
    if (!header) continue;
    for (const key of Object.keys(HEADER_ALIASES)) {
      if (found[key] === void 0 && HEADER_ALIASES[key].includes(header)) found[key] = col;
    }
  }
  if (found.bag === void 0 || found.bulk === void 0 || found.sequence === void 0 || found.start === void 0 || found.end === void 0) return void 0;
  return found;
}
async function parseDailyProgramWorkbook(buffer) {
  const workbook = new ExcelJS4.Workbook();
  await workbook.xlsx.load(buffer);
  const days = [];
  const errors = [];
  for (const worksheet of workbook.worksheets) {
    const columnCount = Math.max(worksheet.columnCount, 9);
    let current = null;
    let columns;
    let awaitingHeader = false;
    const finalizeCurrent = () => {
      if (!current) return;
      if (!columns && current.lines.length === 0) {
        errors.push(`Feuille "${worksheet.name}" : tableau introuvable pour le ${current.programDate} (colonnes Sac/Vrac non trouv\xE9es).`);
      }
      days.push({ programDate: current.programDate, operatorName: current.operatorNames.join(" \xB7 "), lines: current.lines });
      current = null;
      columns = void 0;
      awaitingHeader = false;
    };
    for (let r = 1; r <= worksheet.rowCount; r += 1) {
      const row = worksheet.getRow(r);
      const dateCellText = findCellTextMatching(row, columnCount, DATE_LABEL_RE);
      if (dateCellText) {
        const programDate = parseProgramDate(dateCellText);
        if (programDate) {
          finalizeCurrent();
          current = { programDate, operatorNames: [], lines: [] };
          awaitingHeader = true;
        }
        continue;
      }
      if (!current) continue;
      const pupitreurCellText = findCellTextMatching(row, columnCount, PUPITREUR_LABEL_RE);
      if (pupitreurCellText) {
        current.operatorNames = parseOperatorNames(pupitreurCellText);
        continue;
      }
      if (awaitingHeader) {
        const found = findHeaderColumns(row, columnCount);
        if (found) {
          columns = found;
          awaitingHeader = false;
        }
        continue;
      }
      if (!columns) continue;
      if (isRowEmpty(row, columnCount)) {
        finalizeCurrent();
        continue;
      }
      const sequence = Number(readText2(row.getCell(columns.sequence)));
      const plannedStart = readTime(row.getCell(columns.start));
      const plannedEnd = readTime(row.getCell(columns.end));
      if (!Number.isFinite(sequence) || !plannedStart || !plannedEnd) {
        errors.push(`Feuille "${worksheet.name}", ligne ${r} : ligne de planning illisible (N\xB0, heure de d\xE9but ou de fin manquante), ignor\xE9e.`);
        continue;
      }
      current.lines.push({
        sequence,
        article: readText2(row.getCell(columns.article)) || null,
        version: readText2(row.getCell(columns.version)) || null,
        bagQuantity: readText2(row.getCell(columns.bag)) || null,
        bulkQuantity: readText2(row.getCell(columns.bulk)) || null,
        plannedStart,
        plannedEnd,
        observation: readText2(row.getCell(columns.observation)) || null
      });
    }
    finalizeCurrent();
  }
  const occurrences = /* @__PURE__ */ new Map();
  for (const day of days) occurrences.set(day.programDate, (occurrences.get(day.programDate) ?? 0) + 1);
  Array.from(occurrences.entries()).forEach(([programDate, count]) => {
    if (count > 1) errors.push(`Le ${programDate} appara\xEEt ${count} fois dans le classeur : seule la derni\xE8re occurrence sera conserv\xE9e.`);
  });
  return { days, errors };
}

// server/settingsSecurity.ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
function createActionPasswordDigest(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}
function verifyActionPasswordDigest(password, digest) {
  const candidate = scryptSync(password, digest.salt, 64).toString("hex");
  const expected = Buffer.from(digest.hash, "hex");
  const actual = Buffer.from(candidate, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// server/_core/adminSession.ts
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
var ADMIN_SESSION_COOKIE = "app_admin_session";
var ADMIN_SESSION_DURATION_MS = 1e3 * 60 * 60 * 24 * 30;
function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || "almaraii-production-pulse-default-session-secret";
  return new TextEncoder().encode(secret);
}
async function signAdminSession() {
  const expirationSeconds = Math.floor((Date.now() + ADMIN_SESSION_DURATION_MS) / 1e3);
  return new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(getSessionSecret());
}
async function verifyAdminSession(token) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { algorithms: ["HS256"] });
    return payload.role === "admin";
  } catch {
    return false;
  }
}
async function isAdminRequest(req) {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return verifyAdminSession(cookies[ADMIN_SESSION_COOKIE]);
}
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getAdminSessionCookieOptions(req) {
  return { httpOnly: true, path: "/", sameSite: "lax", secure: isSecureRequest(req) };
}

// server/siloDb.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import path2 from "node:path";
import { and, asc as asc3, desc as desc3, eq as eq4, inArray } from "drizzle-orm";
var fallbackPath = path2.resolve(process.cwd(), process.env.VITEST ? ".local-silo-store.test.json" : ".local-silo-store.json");
var emptyStore = () => ({ entries: [], allocations: [], shipments: [], silos: [], nextId: 1 });
function loadFallbackStore2() {
  if (!existsSync2(fallbackPath)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync2(fallbackPath, "utf8"));
    return {
      entries: parsed.entries ?? [],
      // manuallyDepleted : absent des fichiers de secours écrits avant cette
      // fonctionnalité, donc à défaut "actif" (false) plutôt qu'une erreur.
      allocations: (parsed.allocations ?? []).map((allocation) => ({ ...allocation, manuallyDepleted: allocation.manuallyDepleted ?? false })),
      // splitGroupId : absent des fichiers de secours écrits avant cette fonctionnalité, donc à défaut "saisie seule" (null).
      shipments: (parsed.shipments ?? []).map((shipment) => ({ ...shipment, splitGroupId: shipment.splitGroupId ?? null })),
      // silos : absent des fichiers de secours écrits avant cette fonctionnalité (voir initializeSilos, qui les sème au premier accès).
      silos: parsed.silos ?? [],
      nextId: parsed.nextId ?? 1
    };
  } catch {
    return emptyStore();
  }
}
var store = loadFallbackStore2();
var persistenceWarned = false;
function persist() {
  try {
    mkdirSync2(path2.dirname(fallbackPath), { recursive: true });
    writeFileSync2(fallbackPath, JSON.stringify(store, null, 2), "utf8");
  } catch (error) {
    if (!persistenceWarned) {
      persistenceWarned = true;
      console.warn("[Silo] Stockage de secours non persistable (syst\xE8me de fichiers en lecture seule). Configurez DATABASE_URL pour conserver les donn\xE9es :", error);
    }
  }
}
var nextId = () => store.nextId++;
var now = () => /* @__PURE__ */ new Date();
async function initializeSilos() {
  const db = await getDb();
  if (!db) {
    if (store.silos.length > 0) return;
    SILOS.forEach((code, index2) => {
      store.silos.push({ id: nextId(), code, isActive: true, sortOrder: index2, createdAt: now(), updatedAt: now() });
    });
    persist();
    return;
  }
  const existing = await db.select({ id: silos.id }).from(silos).limit(1);
  if (existing.length > 0) return;
  await db.insert(silos).values(SILOS.map((code, index2) => ({ code, isActive: true, sortOrder: index2 }))).onConflictDoNothing();
}
async function listActiveSilos() {
  const db = await getDb();
  if (!db) return [...store.silos].filter((silo) => silo.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  return db.select().from(silos).where(eq4(silos.isActive, true)).orderBy(asc3(silos.sortOrder));
}
async function addSilo(code) {
  const normalizedCode = code.trim().toUpperCase();
  const db = await getDb();
  if (!db) {
    const existing = store.silos.find((silo) => silo.code === normalizedCode);
    if (existing) {
      existing.isActive = true;
      existing.updatedAt = now();
      persist();
      return existing;
    }
    const maxSortOrder2 = store.silos.reduce((max, silo) => Math.max(max, silo.sortOrder), -1);
    const created2 = { id: nextId(), code: normalizedCode, isActive: true, sortOrder: maxSortOrder2 + 1, createdAt: now(), updatedAt: now() };
    store.silos.push(created2);
    persist();
    return created2;
  }
  const [{ maxSortOrder } = { maxSortOrder: null }] = await db.select({ maxSortOrder: silos.sortOrder }).from(silos).orderBy(desc3(silos.sortOrder)).limit(1);
  const [created] = await db.insert(silos).values({ code: normalizedCode, isActive: true, sortOrder: (maxSortOrder ?? -1) + 1 }).onConflictDoUpdate({
    target: silos.code,
    set: { isActive: true, updatedAt: /* @__PURE__ */ new Date() }
  }).returning();
  return created;
}
async function renameSilo(id, newCode) {
  const normalizedCode = newCode.trim().toUpperCase();
  const db = await getDb();
  if (!db) {
    const existing2 = store.silos.find((silo) => silo.id === id);
    if (!existing2) return void 0;
    const oldCode = existing2.code;
    if (oldCode === normalizedCode) return existing2;
    existing2.code = normalizedCode;
    existing2.updatedAt = now();
    store.allocations.forEach((allocation) => {
      if (allocation.silo === oldCode) {
        allocation.silo = normalizedCode;
        allocation.updatedAt = now();
      }
    });
    store.shipments.forEach((shipment) => {
      if (shipment.silo === oldCode) {
        shipment.silo = normalizedCode;
        shipment.updatedAt = now();
      }
    });
    persist();
    return existing2;
  }
  const [existing] = await db.select().from(silos).where(eq4(silos.id, id)).limit(1);
  if (!existing) return void 0;
  if (existing.code === normalizedCode) return existing;
  const [updated] = await db.update(silos).set({ code: normalizedCode, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(silos.id, id)).returning();
  await db.update(siloProductionAllocations).set({ silo: normalizedCode, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(siloProductionAllocations.silo, existing.code));
  await db.update(siloShipments).set({ silo: normalizedCode, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(siloShipments.silo, existing.code));
  return updated;
}
async function archiveSilo(id) {
  const db = await getDb();
  if (!db) {
    const silo = store.silos.find((item) => item.id === id);
    if (silo) {
      silo.isActive = false;
      silo.updatedAt = now();
      persist();
    }
    return { success: true };
  }
  await db.update(silos).set({ isActive: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(silos.id, id));
  return { success: true };
}
async function listSiloMovementSilos() {
  const db = await getDb();
  if (!db) {
    const codes = /* @__PURE__ */ new Set();
    store.allocations.forEach((allocation) => codes.add(allocation.silo));
    store.shipments.forEach((shipment) => codes.add(shipment.silo));
    return Array.from(codes);
  }
  const [allocationSilos, shipmentSilos] = await Promise.all([
    db.selectDistinct({ silo: siloProductionAllocations.silo }).from(siloProductionAllocations),
    db.selectDistinct({ silo: siloShipments.silo }).from(siloShipments)
  ]);
  return Array.from(/* @__PURE__ */ new Set([...allocationSilos.map((row) => row.silo), ...shipmentSilos.map((row) => row.silo)]));
}
async function listSiloProductionEntries() {
  const db = await getDb();
  if (!db) {
    return [...store.entries].sort((a, b) => (b.entryDate ?? "").localeCompare(a.entryDate ?? "") || b.id - a.id).map((entry) => ({ ...entry, allocations: store.allocations.filter((allocation) => allocation.entryId === entry.id) }));
  }
  const entries = await db.select().from(siloProductionEntries).orderBy(desc3(siloProductionEntries.entryDate), desc3(siloProductionEntries.id));
  if (entries.length === 0) return [];
  const allocations = await db.select().from(siloProductionAllocations).where(inArray(siloProductionAllocations.entryId, entries.map((entry) => entry.id))).orderBy(asc3(siloProductionAllocations.id));
  return entries.map((entry) => ({
    ...entry,
    allocations: allocations.filter((allocation) => allocation.entryId === entry.id)
  }));
}
async function createSiloProductionEntry(entry, allocations) {
  const db = await getDb();
  if (!db) {
    const created2 = {
      id: nextId(),
      entryDate: entry.entryDate ?? null,
      article: entry.article,
      lotNumber: entry.lotNumber ?? null,
      totalQuantity: entry.totalQuantity ?? null,
      createdAt: now(),
      updatedAt: now()
    };
    store.entries.push(created2);
    writeFallbackAllocations(created2.id, allocations);
    persist();
    return created2;
  }
  const [created] = await db.insert(siloProductionEntries).values(entry).returning();
  await replaceAllocations(created.id, allocations);
  return created;
}
async function updateSiloProductionEntry(id, entry, allocations) {
  const db = await getDb();
  if (!db) {
    const existing = store.entries.find((item) => item.id === id);
    if (!existing) return void 0;
    existing.entryDate = entry.entryDate ?? null;
    existing.article = entry.article ?? existing.article;
    existing.lotNumber = entry.lotNumber ?? null;
    existing.totalQuantity = entry.totalQuantity ?? null;
    existing.updatedAt = now();
    writeFallbackAllocations(id, allocations);
    persist();
    return existing;
  }
  const [updated] = await db.update(siloProductionEntries).set({ ...entry, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(siloProductionEntries.id, id)).returning();
  await replaceAllocations(id, allocations);
  return updated;
}
async function deleteSiloProductionEntry(id) {
  const db = await getDb();
  if (!db) {
    store.entries = store.entries.filter((entry) => entry.id !== id);
    store.allocations = store.allocations.filter((allocation) => allocation.entryId !== id);
    persist();
    return { success: true };
  }
  await db.delete(siloProductionAllocations).where(eq4(siloProductionAllocations.entryId, id));
  await db.delete(siloProductionEntries).where(eq4(siloProductionEntries.id, id));
  return { success: true };
}
function writeFallbackAllocations(entryId, allocations) {
  const previouslyDepleted = new Map(store.allocations.filter((allocation) => allocation.entryId === entryId).map((allocation) => [allocation.silo, allocation.manuallyDepleted]));
  store.allocations = store.allocations.filter((allocation) => allocation.entryId !== entryId);
  allocations.filter((allocation) => allocation.quantity !== 0).forEach((allocation) => {
    store.allocations.push({ id: nextId(), entryId, silo: allocation.silo, quantity: allocation.quantity.toFixed(2), manuallyDepleted: previouslyDepleted.get(allocation.silo) ?? false, createdAt: now(), updatedAt: now() });
  });
}
async function replaceAllocations(entryId, allocations) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ silo: siloProductionAllocations.silo, manuallyDepleted: siloProductionAllocations.manuallyDepleted }).from(siloProductionAllocations).where(eq4(siloProductionAllocations.entryId, entryId));
  const previouslyDepleted = new Map(existing.map((row) => [row.silo, row.manuallyDepleted]));
  await db.delete(siloProductionAllocations).where(eq4(siloProductionAllocations.entryId, entryId));
  const rows = allocations.filter((allocation) => allocation.quantity !== 0);
  if (rows.length === 0) return;
  await db.insert(siloProductionAllocations).values(rows.map((allocation) => ({
    entryId,
    silo: allocation.silo,
    quantity: allocation.quantity.toFixed(2),
    manuallyDepleted: previouslyDepleted.get(allocation.silo) ?? false
  })));
}
async function listSiloShipments() {
  const db = await getDb();
  if (!db) return [...store.shipments].sort((a, b) => (b.shipmentDate ?? "").localeCompare(a.shipmentDate ?? "") || b.id - a.id);
  return db.select().from(siloShipments).orderBy(desc3(siloShipments.shipmentDate), desc3(siloShipments.id));
}
async function createSiloShipment(shipment) {
  const db = await getDb();
  if (!db) {
    const created2 = {
      id: nextId(),
      shipmentDate: shipment.shipmentDate ?? null,
      article: shipment.article,
      lotNumber: shipment.lotNumber ?? null,
      quantity: shipment.quantity,
      silo: shipment.silo,
      shipmentType: shipment.shipmentType,
      splitGroupId: shipment.splitGroupId ?? null,
      createdAt: now(),
      updatedAt: now()
    };
    store.shipments.push(created2);
    persist();
    return created2;
  }
  const [created] = await db.insert(siloShipments).values(shipment).returning();
  return created;
}
async function createSiloShipmentGroup(shipments) {
  if (shipments.length <= 1) {
    return shipments.length === 0 ? [] : [await createSiloShipment(shipments[0])];
  }
  const db = await getDb();
  if (!db) {
    const created = shipments.map((shipment) => {
      const row = {
        id: nextId(),
        shipmentDate: shipment.shipmentDate ?? null,
        article: shipment.article,
        lotNumber: shipment.lotNumber ?? null,
        quantity: shipment.quantity,
        silo: shipment.silo,
        shipmentType: shipment.shipmentType,
        splitGroupId: null,
        createdAt: now(),
        updatedAt: now()
      };
      store.shipments.push(row);
      return row;
    });
    const groupId2 = created[0].id;
    created.forEach((row) => {
      row.splitGroupId = groupId2;
    });
    persist();
    return created;
  }
  const createdRows = await db.insert(siloShipments).values(shipments).returning();
  const groupId = createdRows[0].id;
  await db.update(siloShipments).set({ splitGroupId: groupId }).where(inArray(siloShipments.id, createdRows.map((row) => row.id)));
  return createdRows.map((row) => ({ ...row, splitGroupId: groupId }));
}
async function updateSiloShipment(id, shipment) {
  const db = await getDb();
  if (!db) {
    const existing = store.shipments.find((item) => item.id === id);
    if (!existing) return void 0;
    existing.shipmentDate = shipment.shipmentDate ?? null;
    existing.article = shipment.article ?? existing.article;
    existing.lotNumber = shipment.lotNumber ?? null;
    existing.quantity = shipment.quantity ?? existing.quantity;
    existing.silo = shipment.silo ?? existing.silo;
    existing.shipmentType = shipment.shipmentType ?? existing.shipmentType;
    existing.updatedAt = now();
    persist();
    return existing;
  }
  const [updated] = await db.update(siloShipments).set({ ...shipment, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(siloShipments.id, id)).returning();
  return updated;
}
async function deleteSiloShipment(id) {
  const db = await getDb();
  if (!db) {
    store.shipments = store.shipments.filter((shipment) => shipment.id !== id);
    persist();
    return { success: true };
  }
  await db.delete(siloShipments).where(eq4(siloShipments.id, id));
  return { success: true };
}
async function replaceSiloMovements(entries, shipments) {
  const db = await getDb();
  if (!db) {
    store.entries = [];
    store.allocations = [];
    store.shipments = [];
    entries.forEach(({ entry, allocations }) => {
      const created = {
        id: nextId(),
        entryDate: entry.entryDate ?? null,
        article: entry.article,
        lotNumber: entry.lotNumber ?? null,
        totalQuantity: entry.totalQuantity ?? null,
        createdAt: now(),
        updatedAt: now()
      };
      store.entries.push(created);
      writeFallbackAllocations(created.id, allocations);
    });
    shipments.forEach((shipment) => {
      store.shipments.push({
        id: nextId(),
        shipmentDate: shipment.shipmentDate ?? null,
        article: shipment.article,
        lotNumber: shipment.lotNumber ?? null,
        quantity: shipment.quantity,
        silo: shipment.silo,
        shipmentType: shipment.shipmentType,
        splitGroupId: null,
        createdAt: now(),
        updatedAt: now()
      });
    });
    persist();
    return { entries: entries.length, shipments: shipments.length };
  }
  await db.delete(siloProductionAllocations);
  await db.delete(siloProductionEntries);
  await db.delete(siloShipments);
  for (const { entry, allocations } of entries) {
    const [created] = await db.insert(siloProductionEntries).values(entry).returning();
    await replaceAllocations(created.id, allocations);
  }
  if (shipments.length > 0) await db.insert(siloShipments).values(shipments);
  return { entries: entries.length, shipments: shipments.length };
}
async function loadSiloMovements() {
  const db = await getDb();
  if (!db) {
    const articleByEntry2 = new Map(store.entries.map((entry) => [entry.id, entry.article]));
    return {
      allocations: store.allocations.map((allocation) => ({
        article: articleByEntry2.get(allocation.entryId) ?? "",
        silo: allocation.silo,
        quantity: Number(allocation.quantity)
      })).filter((allocation) => allocation.article),
      shipments: store.shipments.map((shipment) => ({ article: shipment.article, silo: shipment.silo, quantity: Number(shipment.quantity) }))
    };
  }
  const [entries, allocationRows, shipments] = await Promise.all([
    db.select({ id: siloProductionEntries.id, article: siloProductionEntries.article }).from(siloProductionEntries),
    db.select({
      entryId: siloProductionAllocations.entryId,
      silo: siloProductionAllocations.silo,
      quantity: siloProductionAllocations.quantity
    }).from(siloProductionAllocations),
    db.select({
      article: siloShipments.article,
      silo: siloShipments.silo,
      quantity: siloShipments.quantity
    }).from(siloShipments)
  ]);
  const articleByEntry = new Map(entries.map((entry) => [entry.id, entry.article]));
  const allocations = allocationRows.map((row) => {
    const article = articleByEntry.get(row.entryId);
    if (article === void 0) return null;
    return { article, silo: row.silo, quantity: Number(row.quantity) };
  }).filter((row) => row !== null);
  return {
    allocations,
    shipments: shipments.map((row) => ({ article: row.article, silo: row.silo, quantity: Number(row.quantity) }))
  };
}
async function loadLotMovements() {
  const db = await getDb();
  if (!db) {
    const entryById2 = new Map(store.entries.map((entry) => [entry.id, entry]));
    return {
      allocations: store.allocations.map((allocation) => {
        const entry = entryById2.get(allocation.entryId);
        if (!entry) return null;
        return {
          entryId: allocation.entryId,
          entryDate: entry.entryDate,
          article: entry.article,
          lotNumber: entry.lotNumber,
          silo: allocation.silo,
          quantity: Number(allocation.quantity),
          manuallyDepleted: allocation.manuallyDepleted
        };
      }).filter((row) => row !== null),
      shipments: store.shipments.map((shipment) => ({
        shipmentId: shipment.id,
        shipmentDate: shipment.shipmentDate,
        article: shipment.article,
        silo: shipment.silo,
        quantity: Number(shipment.quantity),
        shipmentType: shipment.shipmentType
      }))
    };
  }
  const [entries, allocationRows, shipments] = await Promise.all([
    db.select({
      id: siloProductionEntries.id,
      entryDate: siloProductionEntries.entryDate,
      article: siloProductionEntries.article,
      lotNumber: siloProductionEntries.lotNumber
    }).from(siloProductionEntries),
    db.select({
      entryId: siloProductionAllocations.entryId,
      silo: siloProductionAllocations.silo,
      quantity: siloProductionAllocations.quantity,
      manuallyDepleted: siloProductionAllocations.manuallyDepleted
    }).from(siloProductionAllocations).orderBy(asc3(siloProductionAllocations.id)),
    // ordre de saisie : départage les lots entrés à la même date dans le grand livre FIFO (voir computeLotLedger).
    db.select({
      shipmentId: siloShipments.id,
      shipmentDate: siloShipments.shipmentDate,
      article: siloShipments.article,
      silo: siloShipments.silo,
      quantity: siloShipments.quantity,
      shipmentType: siloShipments.shipmentType
    }).from(siloShipments)
  ]);
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const allocations = allocationRows.map((row) => {
    const entry = entryById.get(row.entryId);
    if (!entry) return null;
    return { entryId: row.entryId, entryDate: entry.entryDate, article: entry.article, lotNumber: entry.lotNumber, silo: row.silo, quantity: Number(row.quantity), manuallyDepleted: row.manuallyDepleted };
  }).filter((row) => row !== null);
  return {
    allocations,
    shipments: shipments.map((row) => ({ ...row, quantity: Number(row.quantity) }))
  };
}
async function setLotManualDepletion(entryId, silo, manuallyDepleted) {
  const db = await getDb();
  if (!db) {
    const existing = store.allocations.find((allocation) => allocation.entryId === entryId && allocation.silo === silo);
    if (!existing) return void 0;
    existing.manuallyDepleted = manuallyDepleted;
    existing.updatedAt = now();
    persist();
    return existing;
  }
  const [updated] = await db.update(siloProductionAllocations).set({ manuallyDepleted, updatedAt: /* @__PURE__ */ new Date() }).where(and(eq4(siloProductionAllocations.entryId, entryId), eq4(siloProductionAllocations.silo, silo))).returning();
  return updated;
}
async function listSiloMovementArticles() {
  const db = await getDb();
  if (!db) {
    return Array.from(new Set([...store.entries.map((entry) => entry.article), ...store.shipments.map((shipment) => shipment.article)].map((article) => article.trim()).filter(Boolean)));
  }
  const [entryArticles, shipmentArticles] = await Promise.all([
    db.selectDistinct({ article: siloProductionEntries.article }).from(siloProductionEntries),
    db.selectDistinct({ article: siloShipments.article }).from(siloShipments)
  ]);
  return Array.from(new Set([...entryArticles, ...shipmentArticles].map((row) => row.article.trim()).filter(Boolean)));
}

// server/siloLots.ts
import ExcelJS5 from "exceljs";
var UNDATED_SORT_KEY = "9999-99-99";
function roundTons(value) {
  return Math.round(value * 1e6) / 1e6;
}
function compareLotOrder(a, b) {
  if (a.lotNumber && b.lotNumber) return a.lotNumber.localeCompare(b.lotNumber);
  if (a.lotNumber) return -1;
  if (b.lotNumber) return 1;
  return a.entryId - b.entryId;
}
function computeLotLedger(allocations, shipments) {
  const groups = /* @__PURE__ */ new Map();
  let sequence = 0;
  const pushEvent = (article, silo, event) => {
    const key = article + "::" + silo;
    let group = groups.get(key);
    if (!group) {
      group = { article, silo, events: [] };
      groups.set(key, group);
    }
    group.events.push(event);
  };
  for (const allocation of allocations) {
    if (allocation.quantity === 0) continue;
    const date = allocation.entryDate ?? UNDATED_SORT_KEY;
    sequence += 1;
    if (allocation.quantity > 0) {
      pushEvent(allocation.article, allocation.silo, {
        kind: "produce",
        date,
        sequence,
        entryId: allocation.entryId,
        lotNumber: allocation.lotNumber,
        entryDate: allocation.entryDate,
        quantity: allocation.quantity,
        manuallyDepleted: allocation.manuallyDepleted ?? false
      });
    } else {
      pushEvent(allocation.article, allocation.silo, {
        kind: "consume",
        date,
        sequence,
        quantity: -allocation.quantity,
        source: { type: "correction", entryId: allocation.entryId, date: allocation.entryDate }
      });
    }
  }
  for (const shipment of shipments) {
    if (shipment.quantity <= 0) continue;
    sequence += 1;
    pushEvent(shipment.article, shipment.silo, {
      kind: "consume",
      date: shipment.shipmentDate ?? UNDATED_SORT_KEY,
      sequence,
      quantity: shipment.quantity,
      source: { type: "shipment", shipmentId: shipment.shipmentId, date: shipment.shipmentDate, shipmentType: shipment.shipmentType }
    });
  }
  const lots = [];
  const unattributed = [];
  for (const group of Array.from(groups.values())) {
    const { article, silo, events } = group;
    events.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.kind === "produce" && b.kind === "produce") return compareLotOrder(a, b) || a.sequence - b.sequence;
      return a.sequence - b.sequence;
    });
    const queue = [];
    for (const event of events) {
      if (event.kind === "produce") {
        const lot = {
          entryId: event.entryId,
          article,
          silo,
          lotNumber: event.lotNumber,
          entryDate: event.entryDate,
          producedQuantity: event.quantity,
          consumedQuantity: 0,
          remainingQuantity: event.quantity,
          status: "active",
          manuallyDepleted: event.manuallyDepleted,
          consumptions: []
        };
        lots.push(lot);
        queue.push(lot);
        continue;
      }
      let remainingToConsume = event.quantity;
      while (remainingToConsume > 1e-9 && queue.length > 0) {
        const oldest = queue[0];
        const taken = Math.min(oldest.remainingQuantity, remainingToConsume);
        oldest.remainingQuantity = roundTons(oldest.remainingQuantity - taken);
        oldest.consumedQuantity = roundTons(oldest.consumedQuantity + taken);
        oldest.consumptions.push({ quantity: taken, source: event.source });
        remainingToConsume -= taken;
        if (oldest.remainingQuantity <= 1e-9) {
          oldest.remainingQuantity = 0;
          oldest.status = "depleted";
          queue.shift();
        }
      }
      if (remainingToConsume > 1e-9) {
        unattributed.push({ article, silo, quantity: roundTons(remainingToConsume), source: event.source });
      }
    }
  }
  for (const lot of lots) {
    if (lot.manuallyDepleted) {
      lot.remainingQuantity = 0;
      lot.status = "depleted";
    }
  }
  return { lots, unattributed };
}
function manualDepletionWriteOffs(lots) {
  return lots.filter((lot) => lot.manuallyDepleted).map((lot) => ({ article: lot.article, silo: lot.silo, quantity: roundTons(lot.producedQuantity - lot.consumedQuantity) })).filter((row) => row.quantity > 1e-9);
}
function allocateFifoShipment(lots, article, silo, quantity) {
  const candidates = lots.filter((lot) => lot.article === article && lot.silo === silo && lot.status === "active").sort((a, b) => (a.entryDate ?? "").localeCompare(b.entryDate ?? "") || compareLotOrder(a, b));
  const chunks = [];
  let remaining = quantity;
  for (const lot of candidates) {
    if (remaining <= 1e-9) break;
    const taken = Math.min(lot.remainingQuantity, remaining);
    if (taken <= 1e-9) continue;
    chunks.push({ lotNumber: lot.lotNumber, quantity: roundTons(taken) });
    remaining -= taken;
  }
  if (remaining > 1e-9) chunks.push({ lotNumber: null, quantity: roundTons(remaining) });
  return chunks;
}
var LEDGER_SHEET_NAME = "Tra\xE7abilit\xE9 des lots";
var LEDGER_FIRST_COL = 2;
var LEDGER_LAST_COL = LEDGER_FIRST_COL + 5;
var LEDGER_TITLE_ROW = 2;
var LEDGER_SUMMARY_ROW = 3;
var LEDGER_HEADER_ROW = 5;
var LEDGER_FIRST_DATA_ROW = 6;
var LEDGER_COLUMN_WIDTH = 25;
var LEDGER_ROW_HEIGHT = 30;
var ZEBRA_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FBF4" } };
var GRID_BORDER_SIDE = { style: "thin", color: { argb: "FFC4CEC0" } };
var GRID_BORDER = { top: GRID_BORDER_SIDE, left: GRID_BORDER_SIDE, bottom: GRID_BORDER_SIDE, right: GRID_BORDER_SIDE };
var LEDGER_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
var formatLedgerDate = (value) => value ? LEDGER_DATE_FORMATTER.format(/* @__PURE__ */ new Date(`${value}T00:00:00`)) : "\u2014";
async function buildLotLedgerWorkbook(ledger, silos2 = SILOS) {
  const workbook = new ExcelJS5.Workbook();
  workbook.creator = "Almara\xEFi Production Pulse";
  workbook.created = /* @__PURE__ */ new Date();
  workbook.modified = /* @__PURE__ */ new Date();
  const activeLots = ledger.lots.filter((lot) => lot.status === "active");
  const groups = silos2.map((silo) => ({
    silo,
    lots: activeLots.filter((lot) => lot.silo === silo).sort((a, b) => (a.entryDate ?? "").localeCompare(b.entryDate ?? "") || compareLotOrder(a, b))
  }));
  const totalRemaining = activeLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
  const worksheet = workbook.addWorksheet(LEDGER_SHEET_NAME, { views: [{ state: "frozen", ySplit: LEDGER_HEADER_ROW }] });
  writeTitle(worksheet, LEDGER_TITLE_ROW, LEDGER_FIRST_COL, LEDGER_LAST_COL, "\u{1F33E}  TRA\xC7ABILIT\xC9 DES LOTS \u2014 Almara\xEFi Production");
  const summaryRow = worksheet.getRow(LEDGER_SUMMARY_ROW);
  const summaryCell = summaryRow.getCell(LEDGER_FIRST_COL);
  summaryCell.value = `Le ${LEDGER_DATE_FORMATTER.format(/* @__PURE__ */ new Date())}`;
  worksheet.mergeCells(LEDGER_SUMMARY_ROW, LEDGER_FIRST_COL, LEDGER_SUMMARY_ROW, LEDGER_LAST_COL);
  summaryCell.font = { italic: true, color: { argb: "00000000" } };
  summaryCell.alignment = { vertical: "middle", horizontal: "left" };
  summaryRow.height = 20;
  const headerRow = worksheet.getRow(LEDGER_HEADER_ROW);
  ["Silo", "Article", "Date Fabrication", "N\xB0 Lot", "Quantit\xE9 par lot (T)", "Quantit\xE9 silo (T)"].forEach((label, index2) => {
    const cell = headerRow.getCell(LEDGER_FIRST_COL + index2);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = TITLE_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = GRID_BORDER;
  });
  headerRow.height = LEDGER_ROW_HEIGHT;
  for (let col = LEDGER_FIRST_COL; col <= LEDGER_LAST_COL; col += 1) worksheet.getColumn(col).width = LEDGER_COLUMN_WIDTH;
  const ARTICLE_COL = LEDGER_FIRST_COL + 1;
  let currentRow = LEDGER_FIRST_DATA_ROW;
  groups.forEach((group, groupIndex) => {
    const startRow = currentRow;
    const shouldStripe = groupIndex % 2 === 1;
    if (group.lots.length === 0) {
      const row = worksheet.getRow(currentRow);
      const articleCell = row.getCell(ARTICLE_COL);
      articleCell.value = "Vide";
      articleCell.font = { italic: true, color: { argb: "FF86917F" } };
      articleCell.alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(LEDGER_FIRST_COL + 2).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(LEDGER_FIRST_COL + 3).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(LEDGER_FIRST_COL + 4).alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) articleCell.fill = ZEBRA_FILL;
      row.getCell(LEDGER_FIRST_COL + 2).value = "\u2014";
      row.getCell(LEDGER_FIRST_COL + 3).value = "\u2014";
      row.getCell(LEDGER_FIRST_COL + 4).value = "\u2014";
      const emptyTotalCell = row.getCell(LEDGER_FIRST_COL + 5);
      emptyTotalCell.value = "\u2014";
      emptyTotalCell.alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) emptyTotalCell.fill = ZEBRA_FILL;
      currentRow += 1;
    } else {
      group.lots.forEach((lot) => {
        const row = worksheet.getRow(currentRow);
        row.getCell(LEDGER_FIRST_COL + 2).alignment = { vertical: "middle", horizontal: "center" };
        row.getCell(LEDGER_FIRST_COL + 3).alignment = { vertical: "middle", horizontal: "center" };
        row.getCell(LEDGER_FIRST_COL + 4).alignment = { vertical: "middle", horizontal: "center" };
        row.getCell(LEDGER_FIRST_COL + 2).value = formatLedgerDate(lot.entryDate);
        row.getCell(LEDGER_FIRST_COL + 3).value = lot.lotNumber || "\u2014";
        row.getCell(LEDGER_FIRST_COL + 4).value = lot.remainingQuantity;
        row.getCell(LEDGER_FIRST_COL + 4).numFmt = '0.00" T"';
        currentRow += 1;
      });
    }
    const endRow = currentRow - 1;
    for (let r = startRow; r <= endRow; r += 1) {
      const row = worksheet.getRow(r);
      row.height = LEDGER_ROW_HEIGHT;
      for (let col = LEDGER_FIRST_COL; col <= LEDGER_LAST_COL; col += 1) row.getCell(col).border = GRID_BORDER;
      if (shouldStripe) {
        for (let col = LEDGER_FIRST_COL + 2; col < LEDGER_LAST_COL; col += 1) row.getCell(col).fill = ZEBRA_FILL;
      }
    }
    if (endRow > startRow) worksheet.mergeCells(startRow, LEDGER_FIRST_COL, endRow, LEDGER_FIRST_COL);
    const siloCell = worksheet.getCell(startRow, LEDGER_FIRST_COL);
    siloCell.value = group.silo;
    siloCell.font = { bold: true };
    siloCell.alignment = { vertical: "middle", horizontal: "center" };
    if (shouldStripe) siloCell.fill = ZEBRA_FILL;
    let runStart = startRow;
    group.lots.forEach((lot, lotIndex) => {
      const isLastOfGroup = lotIndex === group.lots.length - 1;
      const sharesNextArticle = !isLastOfGroup && group.lots[lotIndex + 1].article === lot.article;
      if (sharesNextArticle) return;
      const runEnd = startRow + lotIndex;
      if (runEnd > runStart) worksheet.mergeCells(runStart, ARTICLE_COL, runEnd, ARTICLE_COL);
      const articleCell = worksheet.getCell(runStart, ARTICLE_COL);
      articleCell.value = lot.article;
      articleCell.alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) articleCell.fill = ZEBRA_FILL;
      runStart = runEnd + 1;
    });
    if (group.lots.length > 0) {
      const siloRemaining = group.lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
      if (endRow > startRow) worksheet.mergeCells(startRow, LEDGER_FIRST_COL + 5, endRow, LEDGER_FIRST_COL + 5);
      const siloTotalCell = worksheet.getCell(startRow, LEDGER_FIRST_COL + 5);
      siloTotalCell.value = siloRemaining;
      siloTotalCell.numFmt = '0.00" T"';
      siloTotalCell.font = { bold: true };
      siloTotalCell.alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) siloTotalCell.fill = ZEBRA_FILL;
    }
  });
  if (currentRow > LEDGER_FIRST_DATA_ROW) {
    worksheet.autoFilter = {
      from: { row: LEDGER_HEADER_ROW, column: LEDGER_FIRST_COL },
      to: { row: currentRow - 1, column: LEDGER_LAST_COL }
    };
  }
  const totalRowNumber = currentRow;
  const totalRow = worksheet.getRow(totalRowNumber);
  totalRow.getCell(LEDGER_FIRST_COL).value = "Total";
  totalRow.getCell(LEDGER_FIRST_COL).font = { bold: true };
  worksheet.mergeCells(totalRowNumber, LEDGER_FIRST_COL, totalRowNumber, LEDGER_FIRST_COL + 3);
  const totalCell = totalRow.getCell(LEDGER_FIRST_COL + 5);
  if (totalRowNumber > LEDGER_FIRST_DATA_ROW) {
    const remainingColLetter = columnLetter(LEDGER_FIRST_COL + 5);
    const formula = `SUM(${remainingColLetter}${LEDGER_FIRST_DATA_ROW}:${remainingColLetter}${totalRowNumber - 1})`;
    totalCell.value = { formula, result: totalRemaining };
  } else {
    totalCell.value = 0;
  }
  totalCell.numFmt = '0.00" T"';
  totalCell.font = { bold: true };
  totalRow.height = LEDGER_ROW_HEIGHT;
  for (let col = LEDGER_FIRST_COL; col <= LEDGER_LAST_COL; col += 1) totalRow.getCell(col).border = GRID_BORDER;
  const ARTICLE_TABLE_FIRST_COL = LEDGER_LAST_COL + 2;
  const ARTICLE_TABLE_QTY_COL = ARTICLE_TABLE_FIRST_COL + 1;
  const articleTotals = /* @__PURE__ */ new Map();
  activeLots.forEach((lot) => {
    articleTotals.set(lot.article, roundTons((articleTotals.get(lot.article) ?? 0) + lot.remainingQuantity));
  });
  const articleRows = Array.from(articleTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  worksheet.getColumn(ARTICLE_TABLE_FIRST_COL).width = LEDGER_COLUMN_WIDTH;
  worksheet.getColumn(ARTICLE_TABLE_QTY_COL).width = LEDGER_COLUMN_WIDTH;
  writeTitle(worksheet, LEDGER_TITLE_ROW, ARTICLE_TABLE_FIRST_COL, ARTICLE_TABLE_QTY_COL, "QUANTIT\xC9 PAR ARTICLE");
  const articleHeaderRow = worksheet.getRow(LEDGER_HEADER_ROW);
  ["Article", "Quantit\xE9 (T)"].forEach((label, index2) => {
    const cell = articleHeaderRow.getCell(ARTICLE_TABLE_FIRST_COL + index2);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = TITLE_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = GRID_BORDER;
  });
  articleRows.forEach(([article, quantity], index2) => {
    const row = worksheet.getRow(LEDGER_FIRST_DATA_ROW + index2);
    row.height = LEDGER_ROW_HEIGHT;
    const articleCell = row.getCell(ARTICLE_TABLE_FIRST_COL);
    const quantityCell = row.getCell(ARTICLE_TABLE_QTY_COL);
    articleCell.value = article;
    articleCell.font = { bold: true };
    articleCell.alignment = { vertical: "middle", horizontal: "center" };
    quantityCell.value = quantity;
    quantityCell.numFmt = '0.00" T"';
    quantityCell.alignment = { vertical: "middle", horizontal: "center" };
    if (index2 % 2 === 1) {
      articleCell.fill = ZEBRA_FILL;
      quantityCell.fill = ZEBRA_FILL;
    }
    articleCell.border = GRID_BORDER;
    quantityCell.border = GRID_BORDER;
  });
  const articleTotalRowNumber = LEDGER_FIRST_DATA_ROW + articleRows.length;
  const articleTotalRow = worksheet.getRow(articleTotalRowNumber);
  articleTotalRow.height = LEDGER_ROW_HEIGHT;
  const articleTotalLabelCell = articleTotalRow.getCell(ARTICLE_TABLE_FIRST_COL);
  articleTotalLabelCell.value = "Total";
  articleTotalLabelCell.font = { bold: true };
  articleTotalLabelCell.alignment = { vertical: "middle", horizontal: "center" };
  articleTotalLabelCell.border = GRID_BORDER;
  const articleTotalQtyCell = articleTotalRow.getCell(ARTICLE_TABLE_QTY_COL);
  if (articleRows.length > 0) {
    const qtyColLetter = columnLetter(ARTICLE_TABLE_QTY_COL);
    const formula = `SUM(${qtyColLetter}${LEDGER_FIRST_DATA_ROW}:${qtyColLetter}${articleTotalRowNumber - 1})`;
    articleTotalQtyCell.value = { formula, result: totalRemaining };
  } else {
    articleTotalQtyCell.value = 0;
  }
  articleTotalQtyCell.numFmt = '0.00" T"';
  articleTotalQtyCell.font = { bold: true };
  articleTotalQtyCell.alignment = { vertical: "middle", horizontal: "center" };
  articleTotalQtyCell.border = GRID_BORDER;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// server/registryExcel.ts
import ExcelJS6 from "exceljs";
var FIRST_COL = 2;
var LAST_COL = FIRST_COL + 6;
var TITLE_ROW = 2;
var FILTER_ROW = 3;
var HEADER_ROW = 5;
var FIRST_DATA_ROW = 6;
var COLUMN_WIDTHS = [13, 16, 15, 13, 16, 11, 42];
var THIN_BORDER = {
  top: { style: "thin", color: { argb: "FFDADFD5" } },
  left: { style: "thin", color: { argb: "FFDADFD5" } },
  bottom: { style: "thin", color: { argb: "FFDADFD5" } },
  right: { style: "thin", color: { argb: "FFDADFD5" } }
};
function describeFilters(filters) {
  const parts = [];
  if (filters.query) parts.push(`recherche \xAB ${filters.query} \xBB`);
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? (/* @__PURE__ */ new Date(`${filters.dateFrom}T00:00:00`)).toLocaleDateString("fr-FR") : "\u2026";
    const to = filters.dateTo ? (/* @__PURE__ */ new Date(`${filters.dateTo}T00:00:00`)).toLocaleDateString("fr-FR") : "\u2026";
    parts.push(`du ${from} au ${to}`);
  }
  return parts.length ? `Filtres : ${parts.join(" \xB7 ")}` : "Aucun filtre appliqu\xE9 (registre complet)";
}
async function buildFilteredRegistryWorkbook(rows, filters) {
  const workbook = new ExcelJS6.Workbook();
  workbook.creator = "Almara\xEFi Production Pulse";
  workbook.created = /* @__PURE__ */ new Date();
  const worksheet = workbook.addWorksheet("Registre journalier", { views: [{ state: "frozen", ySplit: HEADER_ROW }] });
  COLUMN_WIDTHS.forEach((width, index2) => {
    worksheet.getColumn(FIRST_COL + index2).width = width;
  });
  writeTitle(worksheet, TITLE_ROW, FIRST_COL, LAST_COL, "REGISTRE JOURNALIER \u2014 EXTRAIT FILTR\xC9");
  const filterRow = worksheet.getRow(FILTER_ROW);
  const filterCell = filterRow.getCell(FIRST_COL);
  filterCell.value = `${describeFilters(filters)} \u2014 export\xE9 le ${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")} (${rows.length} ligne${rows.length > 1 ? "s" : ""})`;
  worksheet.mergeCells(FILTER_ROW, FIRST_COL, FILTER_ROW, LAST_COL);
  filterCell.font = { italic: true, color: { argb: "FF4D7B40" } };
  filterCell.alignment = { horizontal: "left" };
  const headerRow = worksheet.getRow(HEADER_ROW);
  ["Date", "Article", "Production (T)", "Rebuts (T)", "Disponibilit\xE9 (%)", "TRS (%)", "Commentaire"].forEach((label, index2) => {
    headerRow.getCell(FIRST_COL + index2).value = label;
  });
  styleHeaderRow(headerRow, FIRST_COL, LAST_COL);
  rows.forEach((row, index2) => {
    const excelRow = worksheet.getRow(FIRST_DATA_ROW + index2);
    const dateCell = excelRow.getCell(FIRST_COL);
    dateCell.value = excelDate(row.productionDate);
    dateCell.numFmt = "dd/mm/yyyy";
    excelRow.getCell(FIRST_COL + 1).value = row.article;
    const productionCell = excelRow.getCell(FIRST_COL + 2);
    productionCell.value = row.productionTons;
    productionCell.numFmt = "0.00";
    const wasteCell = excelRow.getCell(FIRST_COL + 3);
    wasteCell.value = row.wasteTons;
    wasteCell.numFmt = "0.00";
    const availabilityCell = excelRow.getCell(FIRST_COL + 4);
    availabilityCell.value = row.availability;
    availabilityCell.numFmt = "0%";
    const trsCell = excelRow.getCell(FIRST_COL + 5);
    trsCell.value = row.trs;
    trsCell.numFmt = "0%";
    const commentCell = excelRow.getCell(FIRST_COL + 6);
    commentCell.value = row.comment || "";
    commentCell.alignment = { wrapText: true, vertical: "middle" };
    for (let col = FIRST_COL; col <= LAST_COL; col += 1) excelRow.getCell(col).border = THIN_BORDER;
  });
  const totalRowNumber = FIRST_DATA_ROW + rows.length;
  const totalRow = worksheet.getRow(totalRowNumber);
  const totalLabelCell = totalRow.getCell(FIRST_COL);
  totalLabelCell.value = "Total";
  const totalBorder = { top: { style: "thin", color: { argb: "FF4D7B40" } } };
  if (rows.length > 0) {
    const lastDataRow = totalRowNumber - 1;
    const productionRange = `${columnLetter(FIRST_COL + 2)}${FIRST_DATA_ROW}:${columnLetter(FIRST_COL + 2)}${lastDataRow}`;
    const wasteRange = `${columnLetter(FIRST_COL + 3)}${FIRST_DATA_ROW}:${columnLetter(FIRST_COL + 3)}${lastDataRow}`;
    const productionCell = totalRow.getCell(FIRST_COL + 2);
    productionCell.value = { formula: `SUM(${productionRange})`, result: rows.reduce((sum, row) => sum + row.productionTons, 0) };
    productionCell.numFmt = "0.00";
    const wasteCell = totalRow.getCell(FIRST_COL + 3);
    wasteCell.value = { formula: `SUM(${wasteRange})`, result: rows.reduce((sum, row) => sum + row.wasteTons, 0) };
    wasteCell.numFmt = "0.00";
  }
  for (let col = FIRST_COL; col <= LAST_COL; col += 1) {
    const cell = totalRow.getCell(col);
    cell.font = { bold: true };
    cell.border = totalBorder;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// server/shipmentsReport.ts
import ExcelJS7 from "exceljs";
var FIRST_COL2 = 2;
var LAST_COL2 = FIRST_COL2 + 6;
var TITLE_ROW2 = 2;
var FILTER_ROW2 = 3;
var HEADER_ROW2 = 5;
var FIRST_DATA_ROW2 = 6;
var COLUMN_WIDTHS2 = [13, 11, 17, 11, 11, 9, 12];
var THIN_BORDER2 = {
  top: { style: "thin", color: { argb: "FFDADFD5" } },
  left: { style: "thin", color: { argb: "FFDADFD5" } },
  bottom: { style: "thin", color: { argb: "FFDADFD5" } },
  right: { style: "thin", color: { argb: "FFDADFD5" } }
};
function describeFilters2(filters) {
  const parts = [];
  if (filters.shipmentType) parts.push(`type \xAB ${filters.shipmentType} \xBB`);
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? (/* @__PURE__ */ new Date(`${filters.dateFrom}T00:00:00`)).toLocaleDateString("fr-FR") : "\u2026";
    const to = filters.dateTo ? (/* @__PURE__ */ new Date(`${filters.dateTo}T00:00:00`)).toLocaleDateString("fr-FR") : "\u2026";
    parts.push(`du ${from} au ${to}`);
  }
  return parts.length ? `Filtres : ${parts.join(" \xB7 ")}` : "Aucun filtre appliqu\xE9 (toutes les exp\xE9ditions)";
}
var shipmentGroupKey = (line, index2) => line.splitGroupId ? `group:${line.splitGroupId}` : `single:${index2}`;
async function buildShipmentsReportWorkbook(rows, filters) {
  const workbook = new ExcelJS7.Workbook();
  workbook.creator = "Almara\xEFi Production Pulse";
  workbook.created = /* @__PURE__ */ new Date();
  const worksheet = workbook.addWorksheet("Exp\xE9ditions", { views: [{ state: "frozen", ySplit: HEADER_ROW2 }] });
  COLUMN_WIDTHS2.forEach((width, index2) => {
    worksheet.getColumn(FIRST_COL2 + index2).width = width;
  });
  writeTitle(worksheet, TITLE_ROW2, FIRST_COL2, LAST_COL2, "\u{1F69A}  EXP\xC9DITIONS \u2014 Rapport filtr\xE9");
  const filterRow = worksheet.getRow(FILTER_ROW2);
  const filterCell = filterRow.getCell(FIRST_COL2);
  filterCell.value = `${describeFilters2(filters)} \u2014 export\xE9 le ${(/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")} (${rows.length} ligne${rows.length > 1 ? "s" : ""})`;
  worksheet.mergeCells(FILTER_ROW2, FIRST_COL2, FILTER_ROW2, LAST_COL2);
  filterCell.font = { italic: true, color: { argb: "FF4D7B40" } };
  filterCell.alignment = { horizontal: "left" };
  const headerRow = worksheet.getRow(HEADER_ROW2);
  ["Date", "Article", "N\xB0 Lot", "Qt\xE9 (T)", "Qt\xE9 G(T)", "Silo", "Exp\xE9dition"].forEach((label, index2) => {
    headerRow.getCell(FIRST_COL2 + index2).value = label;
  });
  styleHeaderRow(headerRow, FIRST_COL2, LAST_COL2);
  rows.forEach((row, index2) => {
    const excelRow = worksheet.getRow(FIRST_DATA_ROW2 + index2);
    if (row.lotNumber) excelRow.getCell(FIRST_COL2 + 2).value = row.lotNumber;
    const quantityCell = excelRow.getCell(FIRST_COL2 + 3);
    quantityCell.value = row.quantity;
    quantityCell.numFmt = "0.00";
    for (let col = FIRST_COL2; col <= LAST_COL2; col += 1) excelRow.getCell(col).border = THIN_BORDER2;
  });
  const groupColumns = [FIRST_COL2, FIRST_COL2 + 1, FIRST_COL2 + 4, FIRST_COL2 + 5, FIRST_COL2 + 6];
  let groupStart = 0;
  while (groupStart < rows.length) {
    let groupEnd = groupStart;
    while (groupEnd + 1 < rows.length && shipmentGroupKey(rows[groupEnd + 1], groupEnd + 1) === shipmentGroupKey(rows[groupStart], groupStart)) groupEnd += 1;
    const startRow = FIRST_DATA_ROW2 + groupStart;
    const endRow = FIRST_DATA_ROW2 + groupEnd;
    const group = rows.slice(groupStart, groupEnd + 1);
    if (endRow > startRow) groupColumns.forEach((col) => worksheet.mergeCells(startRow, col, endRow, col));
    const dateCell = worksheet.getCell(startRow, FIRST_COL2);
    if (group[0].shipmentDate) {
      dateCell.value = excelDate(group[0].shipmentDate);
      dateCell.numFmt = "dd/mm/yyyy";
    }
    dateCell.alignment = { vertical: "middle", horizontal: "center" };
    const articleCell = worksheet.getCell(startRow, FIRST_COL2 + 1);
    articleCell.value = group[0].article;
    articleCell.alignment = { vertical: "middle", horizontal: "center" };
    const totalCell = worksheet.getCell(startRow, FIRST_COL2 + 4);
    totalCell.value = group.reduce((sum, line) => sum + line.quantity, 0);
    totalCell.numFmt = "0.00";
    totalCell.alignment = { vertical: "middle", horizontal: "center" };
    const siloCell = worksheet.getCell(startRow, FIRST_COL2 + 5);
    siloCell.value = group[0].silo;
    siloCell.alignment = { vertical: "middle", horizontal: "center" };
    const typeCell = worksheet.getCell(startRow, FIRST_COL2 + 6);
    typeCell.value = group[0].shipmentType;
    typeCell.alignment = { vertical: "middle", horizontal: "center" };
    groupStart = groupEnd + 1;
  }
  const totalRowNumber = FIRST_DATA_ROW2 + rows.length;
  const totalRow = worksheet.getRow(totalRowNumber);
  const totalLabelCell = totalRow.getCell(FIRST_COL2);
  totalLabelCell.value = "Total";
  worksheet.mergeCells(totalRowNumber, FIRST_COL2, totalRowNumber, FIRST_COL2 + 2);
  const totalBorder = { top: { style: "thin", color: { argb: "FF4D7B40" } } };
  if (rows.length > 0) {
    const lastDataRow = totalRowNumber - 1;
    const quantityRange = `${columnLetter(FIRST_COL2 + 3)}${FIRST_DATA_ROW2}:${columnLetter(FIRST_COL2 + 3)}${lastDataRow}`;
    const quantityCell = totalRow.getCell(FIRST_COL2 + 3);
    quantityCell.value = { formula: `SUM(${quantityRange})`, result: rows.reduce((sum, row) => sum + row.quantity, 0) };
    quantityCell.numFmt = "0.00";
  }
  for (let col = FIRST_COL2; col <= LAST_COL2; col += 1) {
    const cell = totalRow.getCell(col);
    cell.font = { bold: true };
    cell.border = totalBorder;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// server/expeditionPdfImport.ts
async function extractExpeditionPdfText(buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
var REFERENCE_PATTERN = /\bCOV-[A-Z0-9]+\b/g;
var DATE_BC_PATTERN = /Date\s*BC\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i;
var HEADER_PATTERN = /Code\s+D[ée]signation\s+Qt[ée]\s*th[ée]o\s+Qt[ée]\s*r[ée]elle\s+[ÉE]cart\s+Lots\s+Silo\s*source/i;
var DATA_LINE_PATTERN = /([A-Z]{2,8}\d{1,4})\s+(.+?)\s+([\d.,]+)\s*Kg\s+([\d.,]+)\s*Kg\s+[+-]\s*[\d.,]+\s*Kg/i;
var SILO_PATTERN = /\bSPF\d{1,2}\b/;
function roundTons2(value) {
  return Math.round(value * 100) / 100;
}
function normalizeArticle(designation) {
  return designation.replace(/vrac/gi, "").replace(/\s+/g, "").trim();
}
function parseAmount(text2) {
  return Number(text2.replace(/\s/g, "").replace(",", "."));
}
function parseExpeditionPdfText(text2) {
  const shipments = [];
  const errors = [];
  const matches = Array.from(text2.matchAll(REFERENCE_PATTERN));
  if (matches.length === 0) {
    errors.push("Aucune exp\xE9dition (r\xE9f\xE9rence \xAB COV-... \xBB) trouv\xE9e dans le PDF.");
    return { shipments, errors };
  }
  matches.forEach((match, index2) => {
    const reference = match[0];
    const start = match.index ?? 0;
    const end = index2 + 1 < matches.length ? matches[index2 + 1].index ?? text2.length : text2.length;
    const block = text2.slice(start, end).replace(/\s+/g, " ").trim();
    const dateMatch = block.match(DATE_BC_PATTERN);
    if (!dateMatch) {
      errors.push(`${reference} : date BC introuvable, ligne ignor\xE9e.`);
      return;
    }
    const shipmentDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    const headerMatch = block.match(HEADER_PATTERN);
    const searchArea = headerMatch ? block.slice((headerMatch.index ?? 0) + headerMatch[0].length) : block;
    const dataMatch = searchArea.match(DATA_LINE_PATTERN);
    if (!dataMatch) {
      errors.push(`${reference} : ligne d\u2019article introuvable ou illisible, ligne ignor\xE9e.`);
      return;
    }
    const article = normalizeArticle(dataMatch[2]);
    if (!article) {
      errors.push(`${reference} : d\xE9signation d\u2019article vide apr\xE8s normalisation, ligne ignor\xE9e.`);
      return;
    }
    const quantityKg = parseAmount(dataMatch[4]);
    if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
      errors.push(`${reference} : quantit\xE9 r\xE9elle illisible, ligne ignor\xE9e.`);
      return;
    }
    const tail = searchArea.slice((dataMatch.index ?? 0) + dataMatch[0].length);
    const siloMatch = tail.match(SILO_PATTERN) ?? block.match(SILO_PATTERN);
    if (!siloMatch) {
      errors.push(`${reference} : silo source introuvable, ligne ignor\xE9e.`);
      return;
    }
    shipments.push({ reference, shipmentDate, article, quantity: roundTons2(quantityKg / 1e3), silo: siloMatch[0] });
  });
  return { shipments, errors };
}
async function resolveFifoLot(article, silo, date) {
  const { allocations, shipments } = await loadLotMovements();
  const ledger = computeLotLedger(
    allocations.filter((allocation) => !allocation.entryDate || allocation.entryDate <= date),
    shipments.filter((shipment) => !shipment.shipmentDate || shipment.shipmentDate <= date)
  );
  const candidates = ledger.lots.filter((lot) => lot.article === article && lot.silo === silo && lot.status === "active").sort((a, b) => (a.entryDate ?? "").localeCompare(b.entryDate ?? "") || compareLotOrder(a, b));
  return candidates[0]?.lotNumber ?? null;
}
async function importExpeditionShipments(shipments) {
  const warnings = [];
  const ordered = [...shipments].sort((a, b) => a.shipmentDate.localeCompare(b.shipmentDate));
  for (const shipment of ordered) {
    const lotNumber = await resolveFifoLot(shipment.article, shipment.silo, shipment.shipmentDate);
    if (!lotNumber) {
      warnings.push(`${shipment.reference} : aucun lot actif pour ${shipment.article} dans ${shipment.silo} au ${shipment.shipmentDate} \u2014 exp\xE9dition import\xE9e sans num\xE9ro de lot.`);
    }
    await createSiloShipment({
      shipmentDate: shipment.shipmentDate,
      article: shipment.article,
      lotNumber,
      quantity: shipment.quantity.toFixed(2),
      silo: shipment.silo,
      shipmentType: "Vrac"
    });
  }
  return { imported: ordered.length, warnings };
}

// server/siloStock.ts
function roundQuantity(value) {
  return Math.round(value * 1e6) / 1e6;
}
function computeSiloMatrix(allocations, shipments, silos2, articles) {
  const produced = /* @__PURE__ */ new Map();
  const shipped = /* @__PURE__ */ new Map();
  const key = (silo, article) => `${silo}::${article}`;
  for (const allocation of allocations) {
    const mapKey = key(allocation.silo, allocation.article);
    produced.set(mapKey, (produced.get(mapKey) ?? 0) + allocation.quantity);
  }
  for (const shipment of shipments) {
    const mapKey = key(shipment.silo, shipment.article);
    shipped.set(mapKey, (shipped.get(mapKey) ?? 0) + shipment.quantity);
  }
  const matrix = {};
  for (const silo of silos2) {
    matrix[silo] = {};
    for (const article of articles) {
      const mapKey = key(silo, article);
      const balance = roundQuantity((produced.get(mapKey) ?? 0) - (shipped.get(mapKey) ?? 0));
      matrix[silo][article] = balance <= 0 ? null : balance;
    }
  }
  return matrix;
}
function computeSiloOccupancy(matrix, silos2, articles) {
  return silos2.map((silo) => {
    const row = matrix[silo] ?? {};
    const article = articles.find((candidate) => row[candidate] !== null && row[candidate] !== void 0) ?? null;
    return { silo, article, quantity: article ? row[article] ?? null : null };
  });
}
function computeArticleStock(occupancy, articles) {
  return articles.map((article) => ({
    article,
    quantity: roundQuantity(occupancy.filter((row) => row.article === article).reduce((total, row) => total + (row.quantity ?? 0), 0))
  }));
}
function computeTotalStock(occupancy) {
  return roundQuantity(occupancy.reduce((total, row) => total + (row.quantity ?? 0), 0));
}
function computeShipmentAvailability(allocations, shipments, silo, article, excludeShipmentId) {
  const remainingShipments = excludeShipmentId === void 0 ? shipments : shipments.filter((shipment) => shipment.id !== excludeShipmentId);
  const matrix = computeSiloMatrix(allocations, remainingShipments, [silo], [article]);
  return matrix[silo]?.[article] ?? 0;
}

// server/routers.ts
var recordInput = z2.object({
  productionDate: z2.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit \xEAtre au format AAAA-MM-JJ"),
  article: z2.string().trim().min(1).max(64),
  totalProductionHours: z2.number().positive(),
  plannedStopsHours: z2.number().min(0),
  unplannedStopsHours: z2.number().min(0),
  productionTons: z2.number().positive(),
  wasteTons: z2.number().min(0),
  standardRate: z2.number().positive()
}).superRefine((value, ctx) => {
  if (value.wasteTons > value.productionTons) ctx.addIssue({ code: z2.ZodIssueCode.custom, path: ["wasteTons"], message: "Les rebuts ne peuvent pas d\xE9passer la production." });
  if (value.plannedStopsHours + value.unplannedStopsHours > value.totalProductionHours) ctx.addIssue({ code: z2.ZodIssueCode.custom, path: ["unplannedStopsHours"], message: "Les arr\xEAts cumul\xE9s ne peuvent pas d\xE9passer le temps total." });
});
function assertAdminSession(ctx) {
  if (!ctx.isAdmin) {
    throw new TRPCError2({ code: "FORBIDDEN", message: "Connectez-vous en tant qu\u2019administrateur pour effectuer cette action." });
  }
}
async function assertShipmentWithinStock(silo, article, quantity, excludeShipmentId) {
  const [{ allocations }, shipmentRows, lotMovements] = await Promise.all([loadSiloMovements(), listSiloShipments(), loadLotMovements()]);
  const shipments = shipmentRows.map((shipment) => ({ id: shipment.id, article: shipment.article, silo: shipment.silo, quantity: Number(shipment.quantity) }));
  const writeOffs = manualDepletionWriteOffs(computeLotLedger(lotMovements.allocations, lotMovements.shipments).lots).map((row, index2) => ({ id: -1 - index2, ...row }));
  const available = computeShipmentAvailability(allocations, [...shipments, ...writeOffs], silo, article, excludeShipmentId);
  if (quantity > available + 5e-3) {
    throw new TRPCError2({
      code: "BAD_REQUEST",
      message: `La quantit\xE9 exp\xE9di\xE9e (${quantity.toFixed(2)} T) d\xE9passe le stock disponible de ${article} dans ${silo} (${Math.max(available, 0).toFixed(2)} T).`
    });
  }
}
async function resolveSiloCodes() {
  await initializeSilos();
  const [configured, fromMovements] = await Promise.all([listActiveSilos(), listSiloMovementSilos()]);
  const configuredCodes = configured.map((silo) => silo.code);
  return [...configuredCodes, ...fromMovements.filter((code) => !configuredCodes.includes(code))];
}
var DEFAULT_ADMIN_USERNAME = "admin";
var DEFAULT_ADMIN_PASSWORD = "123456";
async function verifyAdminCredentials(username, password) {
  const settings = await getProductionSettings();
  if (settings?.adminUsername && settings.adminPasswordHash && settings.adminPasswordSalt) {
    return username === settings.adminUsername && verifyActionPasswordDigest(password, { hash: settings.adminPasswordHash, salt: settings.adminPasswordSalt });
  }
  return username === DEFAULT_ADMIN_USERNAME && password === DEFAULT_ADMIN_PASSWORD;
}
var recordWithCommentInput = recordInput.safeExtend({
  comment: z2.string().trim().max(1e3, "Le commentaire ne peut pas d\xE9passer 1 000 caract\xE8res.").optional()
});
var dateInput = z2.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit \xEAtre au format AAAA-MM-JJ");
var optionalProgramText = (maxLength) => z2.string().trim().max(maxLength).optional().transform((value) => value || void 0);
var dailyProgramInput = z2.object({
  programDate: dateInput,
  operatorName: z2.string().trim().min(1, "Indiquez le pupitreur.").max(1e3)
});
var dailyProgramLineInput = z2.object({
  programId: z2.number().int().positive(),
  sequence: z2.number().int().min(1).max(999),
  article: optionalProgramText(64),
  version: optionalProgramText(64),
  bagQuantity: optionalProgramText(128),
  bulkQuantity: optionalProgramText(128),
  plannedStart: z2.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "L\u2019heure de d\xE9but doit \xEAtre au format HH:MM"),
  plannedEnd: z2.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "L\u2019heure de fin doit \xEAtre au format HH:MM"),
  observation: optionalProgramText(4e3)
});
var SILO_IMPORT_PREFIX = "silo-import/";
var PROGRAM_IMPORT_PREFIX = "program-import/";
var EXPEDITION_PDF_IMPORT_PREFIX = "expedition-pdf-import/";
var importPdfFileNameInput = z2.string().trim().min(1).max(255).refine((fileName) => /\.pdf$/i.test(fileName), "Importez un fichier PDF au format .pdf.");
var siloInput = z2.string().trim().min(1, "Choisissez un silo.").max(16);
var optionalDateInput = z2.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La date doit \xEAtre au format AAAA-MM-JJ").optional().or(z2.literal("").transform(() => void 0));
var siloArticleInput = z2.string().trim().min(1, "Indiquez l\u2019article.").max(64);
var lotNumberInput = z2.string().trim().max(64).optional().transform((value) => value || void 0);
var siloQuantityInput = z2.number().finite();
var siloEntryInput = z2.object({
  entryDate: optionalDateInput,
  article: siloArticleInput,
  lotNumber: lotNumberInput,
  totalQuantity: z2.number().finite().optional(),
  allocations: z2.array(z2.object({ silo: siloInput, quantity: siloQuantityInput })).max(64)
});
var siloShipmentInput = z2.object({
  shipmentDate: optionalDateInput,
  article: siloArticleInput,
  lotNumber: lotNumberInput,
  quantity: siloQuantityInput,
  silo: siloInput,
  shipmentType: z2.enum(SHIPMENT_TYPES)
});
var shipmentReportFilterInput = z2.object({
  shipmentType: z2.enum(SHIPMENT_TYPES).optional(),
  dateFrom: optionalDateInput,
  dateTo: optionalDateInput
});
var registryFilterInput = z2.object({
  query: z2.string().trim().max(200).optional(),
  dateFrom: optionalDateInput,
  dateTo: optionalDateInput
});
var EXCEL_IMPORT_MAX_BYTES = 57e5;
var importFileNameInput = z2.string().trim().min(1).max(255).refine((fileName) => /\.xlsx$/i.test(fileName), "Importez un fichier Excel au format .xlsx.");
var importSourceInput = z2.string().startsWith("production-import/");
async function fetchImportBuffer(storageKey, label) {
  const sourceUrl = await storageGetSignedUrl(storageKey);
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[ImportExcel] \xC9chec de la r\xE9cup\xE9ration du fichier t\xE9l\xE9vers\xE9 (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
    throw new TRPCError2({ code: "BAD_REQUEST", message: `Le fichier ${label} t\xE9l\xE9vers\xE9 est indisponible (${response.status}). R\xE9essayez l\u2019import.` });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError2({ code: "PAYLOAD_TOO_LARGE", message: `Le fichier ${label} d\xE9passe la limite de 5,7 Mo.` });
  return buffer;
}
async function importWorkbookBuffer(buffer, applyModifications) {
  const parsed = await parseImportedWorkbook(buffer);
  if (parsed.rows.length === 0) throw new TRPCError2({ code: "BAD_REQUEST", message: `Aucune ligne de production valide n\u2019a \xE9t\xE9 trouv\xE9e dans le fichier. ${parsed.errors.slice(0, 5).join(" ")}`.trim() });
  const result = await importProductionRows(parsed.rows, { applyModifications });
  await syncExcelFromRecords();
  return { ...result, rejected: parsed.errors.length, rejectedLines: parsed.errors.slice(0, 5) };
}
async function previewWorkbookBuffer(buffer) {
  const parsed = await parseImportedWorkbook(buffer);
  if (parsed.rows.length === 0) throw new TRPCError2({ code: "BAD_REQUEST", message: `Aucune ligne de production valide n\u2019a \xE9t\xE9 trouv\xE9e dans le fichier. ${parsed.errors.slice(0, 5).join(" ")}`.trim() });
  const preview = await previewProductionImport(parsed.rows);
  return { ...preview, rejected: parsed.errors.length, rejectedLines: parsed.errors.slice(0, 5) };
}
function calculateRecord(input) {
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
    realHours: realHours.toFixed(2)
  };
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.isAdmin) return { role: "visiteur", username: null };
      const settings = await getProductionSettings();
      return { role: "admin", username: settings?.adminUsername || DEFAULT_ADMIN_USERNAME };
    }),
    login: publicProcedure.input(z2.object({ username: z2.string().trim().min(1, "Indiquez l\u2019identifiant."), password: z2.string().min(1, "Indiquez le mot de passe.") })).mutation(async ({ ctx, input }) => {
      const valid = await verifyAdminCredentials(input.username, input.password);
      if (!valid) throw new TRPCError2({ code: "UNAUTHORIZED", message: "Identifiant ou mot de passe incorrect." });
      const token = await signAdminSession();
      ctx.res.cookie(ADMIN_SESSION_COOKIE, token, { ...getAdminSessionCookieOptions(ctx.req), maxAge: ADMIN_SESSION_DURATION_MS });
      return { success: true };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(ADMIN_SESSION_COOKIE, getAdminSessionCookieOptions(ctx.req));
      return { success: true };
    }),
    changeAdminCredentials: publicProcedure.input(z2.object({
      currentPassword: z2.string().min(1, "Indiquez le mot de passe actuel."),
      newUsername: z2.string().trim().min(1, "Indiquez un identifiant.").max(64),
      newPassword: z2.string().min(6, "Le nouveau mot de passe doit contenir au moins 6 caract\xE8res.").max(128)
    })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const settings = await getProductionSettings();
      const currentValid = settings?.adminUsername && settings.adminPasswordHash && settings.adminPasswordSalt ? verifyActionPasswordDigest(input.currentPassword, { hash: settings.adminPasswordHash, salt: settings.adminPasswordSalt }) : input.currentPassword === DEFAULT_ADMIN_PASSWORD;
      if (!currentValid) throw new TRPCError2({ code: "FORBIDDEN", message: "Mot de passe actuel incorrect." });
      await saveAdminCredentials(input.newUsername, createActionPasswordDigest(input.newPassword));
      return { success: true };
    })
  }),
  settings: router({
    listArticles: publicProcedure.query(async () => {
      await initializeProductionArticles();
      return listActiveProductionArticles();
    }),
    addArticle: publicProcedure.input(z2.object({ code: z2.string().trim().min(1, "Saisissez un article.").max(64) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return addProductionArticle(input.code);
    }),
    archiveArticle: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return archiveProductionArticle(input.id);
    }),
    listOperators: publicProcedure.query(() => listActiveProductionOperators()),
    addOperator: publicProcedure.input(z2.object({ name: z2.string().trim().min(1, "Saisissez un pupitreur.").max(128) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return addProductionOperator(input.name);
    }),
    archiveOperator: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return archiveProductionOperator(input.id);
    }),
    listSilos: publicProcedure.query(async () => {
      await initializeSilos();
      return listActiveSilos();
    }),
    addSilo: publicProcedure.input(z2.object({ code: z2.string().trim().min(1, "Saisissez un silo.").max(16) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return addSilo(input.code);
    }),
    /** Renomme un silo : le nouveau code remplace l'ancien dans les entrées et expéditions déjà enregistrées (voir renameSilo). */
    renameSilo: publicProcedure.input(z2.object({ id: z2.number().int().positive(), code: z2.string().trim().min(1, "Saisissez un silo.").max(16) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const updated = await renameSilo(input.id, input.code);
      if (!updated) throw new TRPCError2({ code: "NOT_FOUND", message: "Ce silo est introuvable." });
      return updated;
    }),
    archiveSilo: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return archiveSilo(input.id);
    })
  }),
  dailyProgram: router({
    list: publicProcedure.query(() => listDailyPrograms()),
    byDate: publicProcedure.input(z2.object({ programDate: dateInput })).query(({ input }) => getDailyProgramByDate(input.programDate)),
    create: publicProcedure.input(dailyProgramInput).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return createDailyProgram(input);
    }),
    update: publicProcedure.input(dailyProgramInput.safeExtend({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { id, ...program } = input;
      return updateDailyProgram(id, program);
    }),
    delete: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return deleteDailyProgram(input.id);
    }),
    createLine: publicProcedure.input(dailyProgramLineInput).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return createDailyProgramLine(input);
    }),
    updateLine: publicProcedure.input(dailyProgramLineInput.safeExtend({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { id, ...line } = input;
      return updateDailyProgramLine(id, line);
    }),
    deleteLine: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return deleteDailyProgramLine(input.id);
    }),
    /** Prépare le téléversement direct du classeur Programme de Production (hors corps de fonction). */
    prepareExcelUpload: publicProcedure.input(z2.object({ fileName: importFileNameInput })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const relKey = `${PROGRAM_IMPORT_PREFIX}${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      if (isVercelBlobConfigured()) return { mode: "vercel-blob", key: relKey };
      const prepared = await storageCreatePresignedUpload(relKey);
      return { mode: "put", key: prepared.key, uploadUrl: prepared.uploadUrl };
    }),
    /** Lit le classeur téléversé : chaque journée trouvée remplace intégralement le programme existant à cette date. */
    importExcelFromStorage: publicProcedure.input(z2.object({ storageKey: z2.string().startsWith(PROGRAM_IMPORT_PREFIX) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const sourceUrl = await storageGetSignedUrl(input.storageKey);
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[ProgramImport] \xC9chec de la r\xE9cup\xE9ration du fichier t\xE9l\xE9vers\xE9 (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
        throw new TRPCError2({ code: "BAD_REQUEST", message: `Le fichier Excel t\xE9l\xE9vers\xE9 est indisponible (${response.status}). R\xE9essayez l\u2019import.` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError2({ code: "PAYLOAD_TOO_LARGE", message: "Le fichier Excel d\xE9passe la limite de 5,7 Mo." });
      const parsed = await parseDailyProgramWorkbook(buffer);
      if (parsed.days.length === 0) {
        throw new TRPCError2({ code: "BAD_REQUEST", message: `Aucune journ\xE9e de programme n\u2019a \xE9t\xE9 trouv\xE9e dans le fichier. ${parsed.errors.slice(0, 3).join(" ")}`.trim() });
      }
      for (const day of parsed.days) {
        await importDailyProgramDay({ programDate: day.programDate, operatorName: day.operatorName, lines: day.lines });
      }
      return {
        days: parsed.days.length,
        lines: parsed.days.reduce((sum, day) => sum + day.lines.length, 0),
        rejected: parsed.errors.length,
        rejectedLines: parsed.errors.slice(0, 8)
      };
    })
  }),
  silo: router({
    /** État courant des silos : matrice, occupation et stock par article. */
    state: publicProcedure.query(async () => {
      const [{ allocations, shipments }, lotMovements, configuredArticles, movementArticles, siloCodes] = await Promise.all([
        loadSiloMovements(),
        loadLotMovements(),
        listActiveProductionArticles(),
        listSiloMovementArticles(),
        resolveSiloCodes()
      ]);
      const configuredCodes = configuredArticles.map((article) => article.code);
      const articles = [...configuredCodes, ...movementArticles.filter((article) => !configuredCodes.includes(article))];
      const writeOffs = manualDepletionWriteOffs(computeLotLedger(lotMovements.allocations, lotMovements.shipments).lots);
      const matrix = computeSiloMatrix(allocations, [...shipments, ...writeOffs], siloCodes, articles);
      const occupancy = computeSiloOccupancy(matrix, siloCodes, articles);
      return {
        silos: siloCodes,
        articles,
        matrix,
        occupancy,
        articleStock: computeArticleStock(occupancy, articles),
        totalStock: computeTotalStock(occupancy)
      };
    }),
    listEntries: publicProcedure.query(() => listSiloProductionEntries()),
    createEntry: publicProcedure.input(siloEntryInput).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { allocations, totalQuantity, ...entry } = input;
      return createSiloProductionEntry({ ...entry, totalQuantity: totalQuantity === void 0 ? null : totalQuantity.toFixed(2) }, allocations);
    }),
    updateEntry: publicProcedure.input(siloEntryInput.safeExtend({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { id, allocations, totalQuantity, ...entry } = input;
      return updateSiloProductionEntry(id, { ...entry, totalQuantity: totalQuantity === void 0 ? null : totalQuantity.toFixed(2) }, allocations);
    }),
    deleteEntry: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
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
        const created2 = await createSiloShipment({ ...shipment, lotNumber, quantity: quantity.toFixed(2) });
        return { shipments: [created2] };
      }
      const date = shipment.shipmentDate ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const lotMovements = await loadLotMovements();
      const ledger = computeLotLedger(
        lotMovements.allocations.filter((allocation) => !allocation.entryDate || allocation.entryDate <= date),
        lotMovements.shipments.filter((movement) => !movement.shipmentDate || movement.shipmentDate <= date)
      );
      const chunks = allocateFifoShipment(ledger.lots, shipment.article, shipment.silo, quantity);
      const created = await createSiloShipmentGroup(chunks.map((chunk) => ({ ...shipment, lotNumber: chunk.lotNumber ?? void 0, quantity: chunk.quantity.toFixed(2) })));
      return { shipments: created };
    }),
    updateShipment: publicProcedure.input(siloShipmentInput.safeExtend({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      await assertShipmentWithinStock(input.silo, input.article, input.quantity, input.id);
      const { id, quantity, ...shipment } = input;
      return updateSiloShipment(id, { ...shipment, quantity: quantity.toFixed(2) });
    }),
    deleteShipment: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return deleteSiloShipment(input.id);
    }),
    /** Prépare le téléversement direct du classeur Silo_PF (hors corps de fonction). */
    prepareExcelUpload: publicProcedure.input(z2.object({ fileName: importFileNameInput })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const relKey = `${SILO_IMPORT_PREFIX}${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      if (isVercelBlobConfigured()) return { mode: "vercel-blob", key: relKey };
      const prepared = await storageCreatePresignedUpload(relKey);
      return { mode: "put", key: prepared.key, uploadUrl: prepared.uploadUrl };
    }),
    importExcelFromStorage: publicProcedure.input(z2.object({ storageKey: z2.string().startsWith(SILO_IMPORT_PREFIX) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const sourceUrl = await storageGetSignedUrl(input.storageKey);
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[SiloImport] \xC9chec de la r\xE9cup\xE9ration du fichier t\xE9l\xE9vers\xE9 (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
        throw new TRPCError2({ code: "BAD_REQUEST", message: `Le fichier Excel t\xE9l\xE9vers\xE9 est indisponible (${response.status}). R\xE9essayez l\u2019import.` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError2({ code: "PAYLOAD_TOO_LARGE", message: "Le fichier Excel d\xE9passe la limite de 5,7 Mo." });
      const parsed = await parseSiloWorkbook(buffer, await resolveSiloCodes());
      if (parsed.entries.length === 0 && parsed.shipments.length === 0) {
        throw new TRPCError2({ code: "BAD_REQUEST", message: `Aucun mouvement de silo n\u2019a \xE9t\xE9 trouv\xE9 dans le fichier. ${parsed.errors.slice(0, 3).join(" ")}`.trim() });
      }
      const result = await replaceSiloMovements(
        parsed.entries.map((entry) => ({
          entry: {
            entryDate: entry.entryDate ?? null,
            article: entry.article,
            lotNumber: entry.lotNumber ?? null,
            totalQuantity: entry.totalQuantity === void 0 ? null : entry.totalQuantity.toFixed(2)
          },
          allocations: entry.allocations
        })),
        parsed.shipments.map((shipment) => ({
          shipmentDate: shipment.shipmentDate ?? null,
          article: shipment.article,
          lotNumber: shipment.lotNumber ?? null,
          quantity: shipment.quantity.toFixed(2),
          silo: shipment.silo,
          shipmentType: shipment.shipmentType
        }))
      );
      return { ...result, rejected: parsed.errors.length, rejectedLines: parsed.errors.slice(0, 5) };
    }),
    /** Prépare le téléversement direct d'un rapport PDF « Traçabilité Expédition » (hors corps de fonction). */
    preparePdfUpload: publicProcedure.input(z2.object({ fileName: importPdfFileNameInput })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const relKey = `${EXPEDITION_PDF_IMPORT_PREFIX}${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      if (isVercelBlobConfigured()) return { mode: "vercel-blob", key: relKey };
      const prepared = await storageCreatePresignedUpload(relKey);
      return { mode: "put", key: prepared.key, uploadUrl: prepared.uploadUrl };
    }),
    /**
     * Lit un rapport PDF « Traçabilité Expédition » (système de pesée externe) :
     * chaque expédition qu'il contient (date, article, quantité, silo) est
     * ajoutée en type Vrac, avec un numéro de lot recalculé depuis le grand
     * livre FIFO de l'application plutôt que repris du PDF — voir
     * expeditionPdfImport.ts.
     */
    importExpeditionPdf: publicProcedure.input(z2.object({ storageKey: z2.string().startsWith(EXPEDITION_PDF_IMPORT_PREFIX) })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const sourceUrl = await storageGetSignedUrl(input.storageKey);
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[ExpeditionPdfImport] \xC9chec de la r\xE9cup\xE9ration du fichier t\xE9l\xE9vers\xE9 (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
        throw new TRPCError2({ code: "BAD_REQUEST", message: `Le fichier PDF t\xE9l\xE9vers\xE9 est indisponible (${response.status}). R\xE9essayez l\u2019import.` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError2({ code: "PAYLOAD_TOO_LARGE", message: "Le fichier PDF d\xE9passe la limite de 5,7 Mo." });
      const text2 = await extractExpeditionPdfText(buffer);
      const parsed = parseExpeditionPdfText(text2);
      if (parsed.shipments.length === 0) {
        throw new TRPCError2({ code: "BAD_REQUEST", message: `Aucune exp\xE9dition n\u2019a \xE9t\xE9 trouv\xE9e dans le PDF. ${parsed.errors.slice(0, 3).join(" ")}`.trim() });
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
        resolveSiloCodes()
      ]);
      const configuredCodes = configuredArticles.map((article) => article.code);
      const articles = [...configuredCodes, ...movementArticles.filter((article) => !configuredCodes.includes(article))];
      const workbook = await buildSiloWorkbook(entries, shipments, articles, siloCodes);
      return {
        fileName: `Silo_PF_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`,
        fileBase64: workbook.toString("base64")
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
    setLotDepletion: publicProcedure.input(z2.object({ entryId: z2.number().int().positive(), silo: siloInput, manuallyDepleted: z2.boolean() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const updated = await setLotManualDepletion(input.entryId, input.silo, input.manuallyDepleted);
      if (!updated) throw new TRPCError2({ code: "NOT_FOUND", message: "Ce lot est introuvable pour ce silo." });
      return updated;
    }),
    /** Export Excel de la traçabilité des lots (une ligne par lot). */
    exportLotLedger: publicProcedure.query(async () => {
      const [{ allocations, shipments }, siloCodes] = await Promise.all([loadLotMovements(), resolveSiloCodes()]);
      const ledger = computeLotLedger(allocations, shipments);
      const workbook = await buildLotLedgerWorkbook(ledger, siloCodes);
      return {
        fileName: `Tracabilite_Lots_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`,
        fileBase64: workbook.toString("base64")
      };
    }),
    /** Export Excel des expéditions filtrées par type (Vrac/Sac) et par période, comme depuis Ajouter une expédition. */
    exportShipmentsReport: publicProcedure.input(shipmentReportFilterInput).query(async ({ input }) => {
      const shipments = await listSiloShipments();
      const filtered = shipments.filter((shipment) => !input.shipmentType || shipment.shipmentType === input.shipmentType).filter((shipment) => !input.dateFrom || (shipment.shipmentDate ?? "") >= input.dateFrom).filter((shipment) => !input.dateTo || (shipment.shipmentDate ?? "") <= input.dateTo);
      const workbook = await buildShipmentsReportWorkbook(
        filtered.map((shipment) => ({
          shipmentDate: shipment.shipmentDate,
          article: shipment.article,
          lotNumber: shipment.lotNumber,
          quantity: Number(shipment.quantity),
          silo: shipment.silo,
          shipmentType: shipment.shipmentType,
          splitGroupId: shipment.splitGroupId
        })),
        input
      );
      return {
        fileName: `Expeditions_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`,
        fileBase64: workbook.toString("base64")
      };
    })
  }),
  production: router({
    list: publicProcedure.query(() => listProductionRecords()),
    initialize: publicProcedure.mutation(() => initializeSynchronizedExcel()),
    importExcel: publicProcedure.input(z2.object({ fileName: z2.string().trim().min(1).max(255), fileBase64: z2.string().min(1).max(8e6), applyModifications: z2.boolean().optional() })).mutation(async ({ ctx, input }) => {
      if (!/\.xlsx$/i.test(input.fileName)) throw new TRPCError2({ code: "BAD_REQUEST", message: "Importez un fichier Excel au format .xlsx." });
      assertAdminSession(ctx);
      return importWorkbookBuffer(Buffer.from(input.fileBase64, "base64"), input.applyModifications ?? false);
    }),
    prepareExcelUpload: publicProcedure.input(z2.object({ fileName: importFileNameInput })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const relKey = `production-import/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      if (isVercelBlobConfigured()) {
        return { mode: "vercel-blob", key: relKey };
      }
      const prepared = await storageCreatePresignedUpload(relKey);
      return { mode: "put", key: prepared.key, uploadUrl: prepared.uploadUrl };
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
    previewExcelFromStorage: publicProcedure.input(z2.object({ storageKey: importSourceInput })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return previewWorkbookBuffer(await fetchImportBuffer(input.storageKey, "Excel"));
    }),
    importExcelFromStorage: publicProcedure.input(z2.object({ storageKey: importSourceInput, applyModifications: z2.boolean().optional() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      return importWorkbookBuffer(await fetchImportBuffer(input.storageKey, "Excel"), input.applyModifications ?? false);
    }),
    syncFile: publicProcedure.query(() => getSynchronizedExcelFile()),
    /** Export Excel du registre filtré (page Rapports) : même recherche/période que le Registre. */
    exportFilteredExcel: publicProcedure.input(registryFilterInput).query(async ({ input }) => {
      const queryLower = input.query?.toLowerCase();
      const rows = (await listProductionRecords()).map((record) => ({ ...record, productionDate: record.productionDate.slice(0, 10) })).filter((record) => (!queryLower || record.article.toLowerCase().includes(queryLower) || record.productionDate.includes(queryLower) || record.comment?.toLowerCase().includes(queryLower)) && (!input.dateFrom || record.productionDate >= input.dateFrom) && (!input.dateTo || record.productionDate <= input.dateTo)).sort((a, b) => b.productionDate.localeCompare(a.productionDate) || b.id - a.id).map((record) => ({
        productionDate: record.productionDate,
        article: record.article,
        productionTons: Number(record.productionTons),
        wasteTons: Number(record.wasteTons),
        availability: Number(record.availability),
        trs: Number(record.trs),
        comment: record.comment
      }));
      const workbook = await buildFilteredRegistryWorkbook(rows, input);
      return {
        fileName: `Registre_Filtre_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`,
        fileBase64: workbook.toString("base64")
      };
    }),
    create: publicProcedure.input(recordWithCommentInput).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { comment, ...record } = input;
      const created = await createProductionRecord({ ...calculateRecord(record), comment: comment || null, source: "manual" });
      await syncExcelFromRecords();
      return created;
    }),
    update: publicProcedure.input(recordWithCommentInput.safeExtend({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const { id, comment, ...record } = input;
      const updated = await updateProductionRecord(id, { ...calculateRecord(record), ...comment !== void 0 ? { comment } : {} });
      await syncExcelFromRecords();
      return updated;
    }),
    delete: publicProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertAdminSession(ctx);
      const deleted = await deleteProductionRecord(input.id);
      await syncExcelFromRecords();
      return deleted;
    })
  })
});

// server/_core/blobUpload.ts
var EXCEL_MIME2 = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
var PDF_MIME = "application/pdf";
function registerBlobUploadRoute(app2) {
  app2.post("/api/blob-upload", async (req, res) => {
    try {
      const jsonResponse = await handleUploadPresigned({
        body: req.body,
        request: req,
        getSignedToken: async (pathname) => {
          if (!await isAdminRequest(req)) {
            throw new Error("Connectez-vous en tant qu\u2019administrateur pour importer ce fichier.");
          }
          const token = await issueSignedToken2({
            pathname,
            operations: ["put"],
            allowedContentTypes: [EXCEL_MIME2, PDF_MIME],
            maximumSizeInBytes: EXCEL_IMPORT_MAX_BYTES,
            validUntil: Date.now() + 5 * 60 * 1e3
          });
          return { token };
        },
        onUploadCompleted: async () => {
        }
      });
      res.json(jsonResponse);
    } catch (error) {
      console.error("[BlobUpload] \xC9chec de la g\xE9n\xE9ration du jeton de t\xE9l\xE9versement:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "\xC9chec de la pr\xE9paration du t\xE9l\xE9versement." });
    }
  });
}

// server/_core/storageProxy.ts
import express from "express";
import { existsSync as existsSync3, mkdirSync as mkdirSync3, writeFileSync as writeFileSync3 } from "node:fs";
import path3 from "node:path";
var localStorageRoot = path3.resolve(process.cwd(), ".local-storage");
function localStorageFilePath(key) {
  return path3.resolve(localStorageRoot, key.replace(/^\/+/, ""));
}
function registerStorageProxy(app2) {
  app2.put("/local-storage/*", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    try {
      const filePath = localStorageFilePath(key);
      mkdirSync3(path3.dirname(filePath), { recursive: true });
      writeFileSync3(filePath, Buffer.from(req.body ?? []));
      res.status(200).send("OK");
    } catch (error) {
      console.error("[StorageProxy] local upload failed:", error);
      res.status(500).send("Storage upload failed");
    }
  });
  app2.get("/local-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    const filePath = localStorageFilePath(key);
    if (!existsSync3(filePath)) {
      res.status(404).send("Storage file not found");
      return;
    }
    try {
      res.set("Cache-Control", "no-store");
      res.sendFile(filePath);
    } catch (error) {
      console.error("[StorageProxy] local serve failed:", error);
      res.status(500).send("Storage serve failed");
    }
  });
}

// server/_core/context.ts
async function createContext(opts) {
  return {
    req: opts.req,
    res: opts.res,
    user: null,
    isAdmin: await isAdminRequest(opts.req)
  };
}

// server/_core/app.ts
function createApp() {
  const app2 = express2();
  app2.use(express2.json({ limit: "50mb" }));
  app2.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app2);
  registerBlobUploadRoute(app2);
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ path: path4, error }) {
        console.error(`[tRPC] ${path4 ?? "<unknown>"} failed:`, error);
      }
    })
  );
  return app2;
}

// server/_core/vercelEntry.ts
var app = createApp();
function sendStartupError(res, error) {
  const message = error instanceof Error ? error.message : "Initialisation de l\u2019API impossible.";
  console.error("[Vercel API] Initialisation \xE9chou\xE9e", error);
  if (res.headersSent) return;
  res.statusCode = 500;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify([{
    error: {
      json: {
        message: `Erreur interne de l\u2019API : ${message}`,
        code: -32603,
        data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 }
      }
    }
  }]));
}
function vercelApiHandler(req, res) {
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  const routedPath = requestUrl.searchParams.get("__path");
  if (routedPath) {
    requestUrl.searchParams.delete("__path");
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${routedPath}${query ? `?${query}` : ""}`;
  }
  if (req.url?.startsWith("/api/local-storage/")) {
    req.url = req.url.replace(/^\/api/, "");
  }
  try {
    return app(req, res);
  } catch (error) {
    return sendStartupError(res, error);
  }
}
export {
  vercelApiHandler as default
};
