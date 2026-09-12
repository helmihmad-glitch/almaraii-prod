// server/_core/app.ts
import express2 from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/_core/blobUpload.ts
import { issueSignedToken as issueSignedToken2 } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";

// server/routers.ts
import { z as z2 } from "zod";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
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
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
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
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
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
  actionPasswordHash: varchar("actionPasswordHash", { length: 128 }),
  actionPasswordSalt: varchar("actionPasswordSalt", { length: 64 }),
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

// server/db.ts
var _db = null;
var fallbackDataPath = path.resolve(process.cwd(), ".local-production-store.json");
function loadFallbackStore() {
  if (!existsSync(fallbackDataPath)) {
    return {
      articles: [],
      operators: [],
      records: [],
      settings: void 0,
      synchronizedFile: void 0,
      nextArticleId: 1,
      nextOperatorId: 1,
      nextRecordId: 1
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
      nextArticleId: parsed.nextArticleId ?? 1,
      nextOperatorId: parsed.nextOperatorId ?? 1,
      nextRecordId: parsed.nextRecordId ?? 1
    };
  } catch {
    return {
      articles: [],
      operators: [],
      records: [],
      settings: void 0,
      synchronizedFile: void 0,
      nextArticleId: 1,
      nextOperatorId: 1,
      nextRecordId: 1
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
    nextArticleId: nextFallbackArticleId,
    nextOperatorId: nextFallbackOperatorId,
    nextRecordId: nextFallbackRecordId
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
var nextFallbackArticleId = persistedFallback.nextArticleId;
var nextFallbackOperatorId = persistedFallback.nextOperatorId;
var nextFallbackRecordId = persistedFallback.nextRecordId;
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
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "email", "loginMethod"];
  textFields.forEach((field) => {
    if (user[field] !== void 0) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  if (user.lastSignedIn !== void 0) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== void 0) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
  updateSet.updatedAt = /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
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
  if (!db) return [];
  return db.select().from(dailyPrograms).orderBy(desc(dailyPrograms.programDate));
}
async function getDailyProgramByDate(programDate) {
  const db = await getDb();
  if (!db) return null;
  const programs = await db.select().from(dailyPrograms).where(eq(dailyPrograms.programDate, programDate)).limit(1);
  const program = programs[0];
  if (!program) return null;
  const lines = await db.select().from(dailyProgramLines).where(eq(dailyProgramLines.programId, program.id)).orderBy(asc(dailyProgramLines.sequence), asc(dailyProgramLines.id));
  return { ...program, lines };
}
async function createDailyProgram(program) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(dailyPrograms).values(program).returning();
  return created;
}
async function updateDailyProgram(id, program) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [updated] = await db.update(dailyPrograms).set({ ...program, updatedAt: /* @__PURE__ */ new Date() }).where(eq(dailyPrograms.id, id)).returning();
  return updated;
}
async function deleteDailyProgram(id) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(dailyProgramLines).where(eq(dailyProgramLines.programId, id));
  await db.delete(dailyPrograms).where(eq(dailyPrograms.id, id));
  return { success: true };
}
async function createDailyProgramLine(line) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(dailyProgramLines).values(line).returning();
  return created;
}
async function updateDailyProgramLine(id, line) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [updated] = await db.update(dailyProgramLines).set({ ...line, updatedAt: /* @__PURE__ */ new Date() }).where(eq(dailyProgramLines.id, id)).returning();
  return updated;
}
async function deleteDailyProgramLine(id) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(dailyProgramLines).where(eq(dailyProgramLines.id, id));
  return { success: true };
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
  const rows = await db.select().from(productionSettings).where(eq(productionSettings.id, 1)).limit(1);
  return rows[0];
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
async function saveActionPasswordDigest(digest) {
  const db = await getDb();
  if (!db) {
    fallbackSettings = {
      id: 1,
      actionPasswordHash: digest.hash,
      actionPasswordSalt: digest.salt,
      updatedAt: /* @__PURE__ */ new Date()
    };
    persistFallbackStore();
    return fallbackSettings;
  }
  await db.insert(productionSettings).values({ id: 1, actionPasswordHash: digest.hash, actionPasswordSalt: digest.salt }).onConflictDoUpdate({
    target: productionSettings.id,
    set: { actionPasswordHash: digest.hash, actionPasswordSalt: digest.salt, updatedAt: /* @__PURE__ */ new Date() }
  });
  return getProductionSettings();
}

// server/excelSync.ts
import ExcelJS from "exceljs";
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

// server/storage.ts
import { issueSignedToken, presignUrl as blobPresignUrl, put as blobPut } from "@vercel/blob";
function isVercelBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}
function hasForgeStorageConfig() {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
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
  return `${getLocalStorageBaseUrl()}/manus-storage/${normalizeKey(relKey)}`;
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
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: localStorageUrlForKey(key) };
}
async function storageCreatePresignedUpload(relKey) {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (!hasForgeStorageConfig()) {
    return { key, uploadUrl: localStorageUrlForKey(key) };
  }
  const { forgeUrl, forgeKey } = getForgeConfig();
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: uploadUrl } = await presignResp.json();
  if (!uploadUrl) throw new Error("Forge returned empty presign URL");
  return { key, uploadUrl };
}
async function storageGetSignedUrl(relKey) {
  const key = normalizeKey(relKey);
  if (isVercelBlobConfigured()) {
    const token = await issueSignedToken({ pathname: key, operations: ["get"], validUntil: Date.now() + 5 * 60 * 1e3 });
    const { presignedUrl } = await blobPresignUrl(token, { operation: "get", pathname: key, access: "private" });
    return presignedUrl;
  }
  if (!hasForgeStorageConfig()) {
    return localStorageUrlForKey(key);
  }
  const { forgeUrl, forgeKey } = getForgeConfig();
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = await resp.json();
  return url;
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
  const workbook = new ExcelJS.Workbook();
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
      date: /* @__PURE__ */ new Date(`${record.productionDate}T00:00:00`),
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
import ExcelJS2 from "exceljs";
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
function normalizeHeader(value) {
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
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
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
function findHeaderRow(worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(100, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rowValues = Array.isArray(row.values) ? row.values : [];
    const headers = rowValues.map((value) => normalizeHeader(String(value ?? "")));
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
  const workbook = new ExcelJS2.Workbook();
  await workbook.xlsx.load(buffer);
  if (workbook.worksheets.length === 0) return { rows: [], errors: ["Le fichier Excel ne contient aucune feuille."] };
  const rows = [];
  const errors = [];
  let foundRegistrySheet = false;
  for (const worksheet of workbook.worksheets) {
    const headerRow = findHeaderRow(worksheet);
    if (!headerRow) continue;
    foundRegistrySheet = true;
    const sheetYear = findSheetYear(worksheet);
    const headerIndexes = /* @__PURE__ */ new Map();
    headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => headerIndexes.set(normalizeHeader(readCellText(cell)), columnNumber));
    const findColumn = (aliases) => Array.from(headerIndexes.entries()).find(([header]) => matchesHeader(header, aliases))?.[1];
    const columns = Object.fromEntries(Object.entries(requiredHeaders).map(([key, aliases]) => [key, findColumn(aliases)]));
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
async function importProductionRows(rows) {
  const db = await getDb();
  const existing = db ? await db.select().from(productionRecords) : await listProductionRecords();
  const byId = new Map(existing.map((record) => [record.id, record]));
  const existingFingerprints = new Set(existing.map((record) => productionRowFingerprint(record)));
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const values = calculateRow(row);
    const existingRecord = row.id ? byId.get(row.id) : void 0;
    const fingerprint = productionRowFingerprint(values);
    if (existingRecord) {
      if (productionRowFingerprint(existingRecord) === fingerprint) {
        skipped += 1;
        continue;
      }
      if (db) {
        await db.update(productionRecords).set({ ...values, updatedAt: /* @__PURE__ */ new Date() }).where(eq3(productionRecords.id, existingRecord.id));
      } else {
        await updateProductionRecord(existingRecord.id, values);
      }
      existingFingerprints.delete(productionRowFingerprint(existingRecord));
      existingFingerprints.add(fingerprint);
      updated += 1;
    } else if (existingFingerprints.has(fingerprint)) {
      skipped += 1;
      continue;
    } else {
      if (db) {
        const [createdRow] = await db.insert(productionRecords).values(values).returning();
        byId.set(createdRow.id, createdRow);
      } else {
        const createdRecord = await createProductionRecord(values);
        byId.set(createdRecord.id, createdRecord);
      }
      existingFingerprints.add(fingerprint);
      created += 1;
    }
    await addProductionArticle(row.article);
  }
  return { created, updated, skipped, total: rows.length };
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
async function isActionPasswordValid(password) {
  const settings = await getProductionSettings();
  console.log("Checking action password validity:", { password, settings });
  if (settings?.actionPasswordHash && settings.actionPasswordSalt) {
    return verifyActionPasswordDigest(password, { hash: settings.actionPasswordHash, salt: settings.actionPasswordSalt });
  }
  return Boolean(process.env.COMMENT_EDIT_PASSWORD) && password === process.env.COMMENT_EDIT_PASSWORD;
}
async function assertProductionActionAuthorized(password) {
  const settings = await getProductionSettings();
  const hasStoredActionPassword = Boolean(settings?.actionPasswordHash && settings.actionPasswordSalt);
  const hasLegacyEnvPassword = Boolean(process.env.COMMENT_EDIT_PASSWORD);
  if (!hasStoredActionPassword && !hasLegacyEnvPassword) {
    return;
  }
  if (!password || !await isActionPasswordValid(password)) {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Le mot de passe est requis pour modifier, supprimer ou g\xE9rer les param\xE8tres." });
  }
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
var EXCEL_IMPORT_MAX_BYTES = 57e5;
var importFileNameInput = z2.string().trim().min(1).max(255).refine((fileName) => /\.xlsx$/i.test(fileName), "Importez un fichier Excel au format .xlsx.");
var importSourceInput = z2.string().startsWith("production-import/");
async function importWorkbookBuffer(buffer) {
  const parsed = await parseImportedWorkbook(buffer);
  if (parsed.rows.length === 0) throw new TRPCError3({ code: "BAD_REQUEST", message: `Aucune ligne de production valide n\u2019a \xE9t\xE9 trouv\xE9e dans le fichier. ${parsed.errors.slice(0, 5).join(" ")}`.trim() });
  const result = await importProductionRows(parsed.rows);
  await syncExcelFromRecords();
  return { ...result, rejected: parsed.errors.length, rejectedLines: parsed.errors.slice(0, 5) };
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
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  settings: router({
    listArticles: publicProcedure.query(async () => {
      await initializeProductionArticles();
      return listActiveProductionArticles();
    }),
    addArticle: publicProcedure.input(z2.object({ code: z2.string().trim().min(1, "Saisissez un article.").max(64), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return addProductionArticle(input.code);
    }),
    archiveArticle: publicProcedure.input(z2.object({ id: z2.number().int().positive(), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return archiveProductionArticle(input.id);
    }),
    listOperators: publicProcedure.query(() => listActiveProductionOperators()),
    addOperator: publicProcedure.input(z2.object({ name: z2.string().trim().min(1, "Saisissez un pupitreur.").max(128), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return addProductionOperator(input.name);
    }),
    archiveOperator: publicProcedure.input(z2.object({ id: z2.number().int().positive(), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return archiveProductionOperator(input.id);
    }),
    changeActionPassword: publicProcedure.input(z2.object({ currentPassword: z2.string().optional(), newPassword: z2.string().min(6, "Le nouveau mot de passe doit contenir au moins 6 caract\xE8res.").max(128) })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.currentPassword);
      await saveActionPasswordDigest(createActionPasswordDigest(input.newPassword));
      return { success: true };
    })
  }),
  dailyProgram: router({
    list: publicProcedure.query(() => listDailyPrograms()),
    byDate: publicProcedure.input(z2.object({ programDate: dateInput })).query(({ input }) => getDailyProgramByDate(input.programDate)),
    create: publicProcedure.input(dailyProgramInput.safeExtend({ actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { actionPassword, ...program } = input;
      return createDailyProgram(program);
    }),
    update: publicProcedure.input(dailyProgramInput.safeExtend({ id: z2.number().int().positive(), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { id, actionPassword, ...program } = input;
      return updateDailyProgram(id, program);
    }),
    delete: publicProcedure.input(z2.object({ id: z2.number().int().positive(), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return deleteDailyProgram(input.id);
    }),
    createLine: publicProcedure.input(dailyProgramLineInput.safeExtend({ actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { actionPassword, ...line } = input;
      return createDailyProgramLine(line);
    }),
    updateLine: publicProcedure.input(dailyProgramLineInput.safeExtend({ id: z2.number().int().positive(), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const { id, actionPassword, ...line } = input;
      return updateDailyProgramLine(id, line);
    }),
    deleteLine: publicProcedure.input(z2.object({ id: z2.number().int().positive(), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      return deleteDailyProgramLine(input.id);
    })
  }),
  production: router({
    list: publicProcedure.query(() => listProductionRecords()),
    initialize: publicProcedure.mutation(() => initializeSynchronizedExcel()),
    importExcel: publicProcedure.input(z2.object({ fileName: z2.string().trim().min(1).max(255), fileBase64: z2.string().min(1).max(8e6), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      if (!/\.xlsx$/i.test(input.fileName)) throw new TRPCError3({ code: "BAD_REQUEST", message: "Importez un fichier Excel au format .xlsx." });
      await assertProductionActionAuthorized(input.actionPassword);
      return importWorkbookBuffer(Buffer.from(input.fileBase64, "base64"));
    }),
    prepareExcelUpload: publicProcedure.input(z2.object({ fileName: importFileNameInput, actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const relKey = `production-import/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      if (isVercelBlobConfigured()) {
        return { mode: "vercel-blob", key: relKey };
      }
      const prepared = await storageCreatePresignedUpload(relKey);
      return { mode: "put", key: prepared.key, uploadUrl: prepared.uploadUrl };
    }),
    importExcelFromStorage: publicProcedure.input(z2.object({ storageKey: importSourceInput, actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const sourceUrl = await storageGetSignedUrl(input.storageKey);
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[ImportExcel] \xC9chec de la r\xE9cup\xE9ration du fichier t\xE9l\xE9vers\xE9 (${response.status} ${response.statusText}) depuis ${sourceUrl}: ${body}`);
        throw new TRPCError3({ code: "BAD_REQUEST", message: `Le fichier Excel t\xE9l\xE9vers\xE9 est indisponible (${response.status}). R\xE9essayez l\u2019import.` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > EXCEL_IMPORT_MAX_BYTES) throw new TRPCError3({ code: "PAYLOAD_TOO_LARGE", message: "Le fichier Excel d\xE9passe la limite de 5,7 Mo." });
      return importWorkbookBuffer(buffer);
    }),
    syncFile: publicProcedure.query(() => getSynchronizedExcelFile()),
    verifyActionPassword: publicProcedure.input(z2.object({ password: z2.string() })).mutation(async ({ input }) => ({
      authorized: await isActionPasswordValid(input.password)
    })),
    create: publicProcedure.input(recordWithCommentInput).mutation(async ({ input }) => {
      const { comment, ...record } = input;
      const created = await createProductionRecord({ ...calculateRecord(record), comment: comment || null, source: "manual" });
      await syncExcelFromRecords();
      return created;
    }),
    update: publicProcedure.input(recordWithCommentInput.safeExtend({ id: z2.number().int().positive(), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      const { id, comment, actionPassword, ...record } = input;
      await assertProductionActionAuthorized(actionPassword);
      const updated = await updateProductionRecord(id, { ...calculateRecord(record), ...comment !== void 0 ? { comment } : {} });
      await syncExcelFromRecords();
      return updated;
    }),
    delete: publicProcedure.input(z2.object({ id: z2.number().int().positive(), actionPassword: z2.string().optional() })).mutation(async ({ input }) => {
      await assertProductionActionAuthorized(input.actionPassword);
      const deleted = await deleteProductionRecord(input.id);
      await syncExcelFromRecords();
      return deleted;
    })
  })
});

// server/_core/blobUpload.ts
var EXCEL_MIME2 = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
function registerBlobUploadRoute(app2) {
  app2.post("/api/blob-upload", async (req, res) => {
    try {
      const jsonResponse = await handleUploadPresigned({
        body: req.body,
        request: req,
        getSignedToken: async (pathname, clientPayload) => {
          let actionPassword;
          if (clientPayload) {
            try {
              actionPassword = JSON.parse(clientPayload).actionPassword;
            } catch {
            }
          }
          await assertProductionActionAuthorized(actionPassword);
          const token = await issueSignedToken2({
            pathname,
            operations: ["put"],
            allowedContentTypes: [EXCEL_MIME2],
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

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
import express from "express";
import { existsSync as existsSync2, mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "node:fs";
import path2 from "node:path";
var localStorageRoot = path2.resolve(process.cwd(), ".local-storage");
function localStorageFilePath(key) {
  return path2.resolve(localStorageRoot, key.replace(/^\/+/, ""));
}
function registerStorageProxy(app2) {
  app2.put("/manus-storage/*", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      try {
        const filePath = localStorageFilePath(key);
        mkdirSync2(path2.dirname(filePath), { recursive: true });
        writeFileSync2(filePath, Buffer.from(req.body ?? []));
        res.status(200).send("OK");
      } catch (error) {
        console.error("[StorageProxy] local upload failed:", error);
        res.status(500).send("Storage upload failed");
      }
      return;
    }
    res.status(500).send("Storage proxy not configured for upload");
  });
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      const filePath = localStorageFilePath(key);
      if (!existsSync2(filePath)) {
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
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/context.ts
async function createContext(opts) {
  return {
    req: opts.req,
    res: opts.res,
    user: null
  };
}

// server/_core/app.ts
function createApp() {
  const app2 = express2();
  app2.use(express2.json({ limit: "50mb" }));
  app2.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app2);
  registerOAuthRoutes(app2);
  registerBlobUploadRoute(app2);
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ path: path3, error }) {
        console.error(`[tRPC] ${path3 ?? "<unknown>"} failed:`, error);
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
  if (req.url?.startsWith("/api/manus-storage/")) {
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
