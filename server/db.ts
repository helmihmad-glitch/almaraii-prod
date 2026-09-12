import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  dailyProgramLines,
  dailyPrograms,
  InsertDailyProgram,
  InsertDailyProgramLine,
  InsertProductionRecord,
  InsertUser,
  productionArticles,
  productionOperators,
  productionRecords,
  productionSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { ActionPasswordDigest } from "./settingsSecurity";

let _db: ReturnType<typeof drizzle> | null = null;

type FallbackArticle = {
  id: number;
  code: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type FallbackOperator = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type FallbackProductionSettings = {
  id: number;
  actionPasswordHash: string | null;
  actionPasswordSalt: string | null;
  updatedAt: Date;
};

type FallbackRecord = {
  id: number;
  productionDate: string;
  article: string;
  totalProductionHours: string;
  plannedStopsHours: string;
  unplannedStopsHours: string;
  productionTons: string;
  wasteTons: string;
  standardRate: string;
  availability: string;
  performance: string;
  quality: string;
  trs: string;
  realHours: string;
  comment: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

type FallbackSynchronizedFile = {
  id: number;
  fileName: string;
  storageKey: string;
  downloadUrl: string;
  recordCount: number;
  updatedAt: Date;
};

const fallbackDataPath = path.resolve(process.cwd(), ".local-production-store.json");

function loadFallbackStore() {
  if (!existsSync(fallbackDataPath)) {
    return {
      articles: [],
      operators: [],
      records: [],
      settings: undefined,
      synchronizedFile: undefined,
      nextArticleId: 1,
      nextOperatorId: 1,
      nextRecordId: 1,
    };
  }

  try {
    const raw = readFileSync(fallbackDataPath, "utf8");
    const parsed = JSON.parse(raw) as {
      articles?: FallbackArticle[];
      operators?: FallbackOperator[];
      records?: FallbackRecord[];
      settings?: FallbackProductionSettings | undefined;
      synchronizedFile?: FallbackSynchronizedFile | undefined;
      nextArticleId?: number;
      nextOperatorId?: number;
      nextRecordId?: number;
    };

    return {
      articles: parsed.articles ?? [],
      operators: parsed.operators ?? [],
      records: parsed.records ?? [],
      settings: parsed.settings,
      synchronizedFile: parsed.synchronizedFile,
      nextArticleId: parsed.nextArticleId ?? 1,
      nextOperatorId: parsed.nextOperatorId ?? 1,
      nextRecordId: parsed.nextRecordId ?? 1,
    };
  } catch {
    return {
      articles: [],
      operators: [],
      records: [],
      settings: undefined,
      synchronizedFile: undefined,
      nextArticleId: 1,
      nextOperatorId: 1,
      nextRecordId: 1,
    };
  }
}

function persistFallbackStore() {
  const directory = path.dirname(fallbackDataPath);
  mkdirSync(directory, { recursive: true });
  const payload = JSON.stringify({
    articles: fallbackArticles,
    operators: fallbackOperators,
    records: fallbackRecords,
    settings: fallbackSettings,
    synchronizedFile: fallbackSynchronizedFile,
    nextArticleId: nextFallbackArticleId,
    nextOperatorId: nextFallbackOperatorId,
    nextRecordId: nextFallbackRecordId,
  }, null, 2);
  writeFileSync(fallbackDataPath, payload, "utf8");
}

const persistedFallback = loadFallbackStore();
const fallbackArticles: FallbackArticle[] = persistedFallback.articles;
const fallbackOperators: FallbackOperator[] = persistedFallback.operators;
const fallbackRecords: FallbackRecord[] = persistedFallback.records;
let fallbackSettings: FallbackProductionSettings | undefined = persistedFallback.settings;
let fallbackSynchronizedFile: FallbackSynchronizedFile | undefined = persistedFallback.synchronizedFile;
let nextFallbackArticleId = persistedFallback.nextArticleId;
let nextFallbackOperatorId = persistedFallback.nextOperatorId;
let nextFallbackRecordId = persistedFallback.nextRecordId;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const db = drizzle(process.env.DATABASE_URL);
      // mysql2's pool emits "error" on background connection issues (idle
      // timeout, network drop, DB restart). Without a listener, Node treats
      // that as an uncaught exception and crashes the whole serverless
      // function ("FUNCTION_INVOCATION_FAILED" on Vercel) instead of just
      // failing the in-flight query. Logging it here keeps the process
      // alive, and dropping the cached instance forces a fresh pool on the
      // next request instead of reusing a broken connection.
      db.$client.on("error", (error) => {
        console.error("[Database] Pool error:", error);
        _db = null;
      });
      _db = db;
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listProductionRecords() {
  const db = await getDb();
  if (!db) {
    return [...fallbackRecords].sort((a, b) => b.productionDate.localeCompare(a.productionDate) || b.id - a.id);
  }
  return db.select().from(productionRecords).orderBy(desc(productionRecords.productionDate), desc(productionRecords.id));
}

export async function createProductionRecord(record: InsertProductionRecord) {
  const db = await getDb();
  if (!db) {
    const created: FallbackRecord = {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fallbackRecords.push(created);
    persistFallbackStore();
    return created;
  }
  const result = await db.insert(productionRecords).values(record);
  const rows = await db.select().from(productionRecords).where(eq(productionRecords.id, result[0].insertId));
  return rows[0];
}

export async function updateProductionRecord(id: number, record: Partial<InsertProductionRecord>) {
  const db = await getDb();
  if (!db) {
    const existing = fallbackRecords.find((item) => item.id === id);
    if (!existing) return undefined;
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
      updatedAt: new Date(),
    });
    persistFallbackStore();
    return existing;
  }
  await db.update(productionRecords).set(record).where(eq(productionRecords.id, id));
  const rows = await db.select().from(productionRecords).where(eq(productionRecords.id, id));
  return rows[0];
}

export async function deleteProductionRecord(id: number) {
  const db = await getDb();
  if (!db) {
    const index = fallbackRecords.findIndex((item) => item.id === id);
    if (index >= 0) {
      fallbackRecords.splice(index, 1);
      persistFallbackStore();
    }
    return { success: true } as const;
  }
  await db.delete(productionRecords).where(eq(productionRecords.id, id));
  return { success: true } as const;
}

export async function listDailyPrograms() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dailyPrograms).orderBy(desc(dailyPrograms.programDate));
}

export async function getDailyProgramByDate(programDate: string) {
  const db = await getDb();
  if (!db) return null;
  const programs = await db.select().from(dailyPrograms).where(eq(dailyPrograms.programDate, programDate)).limit(1);
  const program = programs[0];
  if (!program) return null;
  const lines = await db.select().from(dailyProgramLines).where(eq(dailyProgramLines.programId, program.id)).orderBy(asc(dailyProgramLines.sequence), asc(dailyProgramLines.id));
  return { ...program, lines };
}

export async function createDailyProgram(program: InsertDailyProgram) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(dailyPrograms).values(program);
  const rows = await db.select().from(dailyPrograms).where(eq(dailyPrograms.id, result[0].insertId));
  return rows[0];
}

export async function updateDailyProgram(id: number, program: Partial<InsertDailyProgram>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(dailyPrograms).set(program).where(eq(dailyPrograms.id, id));
  const rows = await db.select().from(dailyPrograms).where(eq(dailyPrograms.id, id));
  return rows[0];
}

export async function deleteDailyProgram(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(dailyProgramLines).where(eq(dailyProgramLines.programId, id));
  await db.delete(dailyPrograms).where(eq(dailyPrograms.id, id));
  return { success: true } as const;
}

export async function createDailyProgramLine(line: InsertDailyProgramLine) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(dailyProgramLines).values(line);
  const rows = await db.select().from(dailyProgramLines).where(eq(dailyProgramLines.id, result[0].insertId));
  return rows[0];
}

export async function updateDailyProgramLine(id: number, line: Partial<InsertDailyProgramLine>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(dailyProgramLines).set(line).where(eq(dailyProgramLines.id, id));
  const rows = await db.select().from(dailyProgramLines).where(eq(dailyProgramLines.id, id));
  return rows[0];
}

export async function deleteDailyProgramLine(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(dailyProgramLines).where(eq(dailyProgramLines.id, id));
  return { success: true } as const;
}

export async function initializeProductionArticles() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: productionArticles.id }).from(productionArticles).limit(1);
  if (existing.length > 0) return;

  const rows = await db.select({ article: productionRecords.article }).from(productionRecords);
  const codes = Array.from(new Set(rows.map((row) => row.article.trim()).filter(Boolean)));
  if (codes.length === 0) return;
  await db.insert(productionArticles).values(codes.map((code) => ({ code, isActive: true }))).onDuplicateKeyUpdate({
    set: { updatedAt: new Date() },
  });
}

export async function listActiveProductionArticles() {
  const db = await getDb();
  if (!db) {
    return fallbackArticles.filter((article) => article.isActive).sort((a, b) => a.code.localeCompare(b.code));
  }
  return db.select().from(productionArticles).where(eq(productionArticles.isActive, true)).orderBy(asc(productionArticles.code));
}

export async function addProductionArticle(code: string) {
  const db = await getDb();
  if (!db) {
    const normalizedCode = code.trim().toUpperCase();
    const existing = fallbackArticles.find((article) => article.code === normalizedCode);
    if (existing) {
      existing.isActive = true;
      existing.updatedAt = new Date();
      persistFallbackStore();
      return existing;
    }

    const article: FallbackArticle = {
      id: nextFallbackArticleId++,
      code: normalizedCode,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fallbackArticles.push(article);
    persistFallbackStore();
    return article;
  }

  const normalizedCode = code.trim().toUpperCase();
  await db.insert(productionArticles).values({ code: normalizedCode, isActive: true }).onDuplicateKeyUpdate({
    set: { isActive: true, updatedAt: new Date() },
  });
  const rows = await db.select().from(productionArticles).where(eq(productionArticles.code, normalizedCode)).limit(1);
  return rows[0];
}

export async function archiveProductionArticle(id: number) {
  const db = await getDb();
  if (!db) {
    const article = fallbackArticles.find((item) => item.id === id);
    if (article) {
      article.isActive = false;
      article.updatedAt = new Date();
      persistFallbackStore();
    }
    return { success: true } as const;
  }

  await db.update(productionArticles).set({ isActive: false }).where(eq(productionArticles.id, id));
  return { success: true } as const;
}

export async function listActiveProductionOperators() {
  const db = await getDb();
  if (!db) {
    return fallbackOperators.filter((operator) => operator.isActive).sort((a, b) => a.name.localeCompare(b.name));
  }
  return db.select().from(productionOperators).where(eq(productionOperators.isActive, true)).orderBy(asc(productionOperators.name));
}

export async function addProductionOperator(name: string) {
  const db = await getDb();
  if (!db) {
    const normalizedName = name.trim();
    const existing = fallbackOperators.find((operator) => operator.name === normalizedName);
    if (existing) {
      existing.isActive = true;
      existing.updatedAt = new Date();
      persistFallbackStore();
      return existing;
    }

    const operator: FallbackOperator = {
      id: nextFallbackOperatorId++,
      name: normalizedName,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fallbackOperators.push(operator);
    persistFallbackStore();
    return operator;
  }

  const normalizedName = name.trim();
  await db.insert(productionOperators).values({ name: normalizedName, isActive: true }).onDuplicateKeyUpdate({
    set: { isActive: true, updatedAt: new Date() },
  });
  const rows = await db.select().from(productionOperators).where(eq(productionOperators.name, normalizedName)).limit(1);
  return rows[0];
}

export async function archiveProductionOperator(id: number) {
  const db = await getDb();
  if (!db) {
    const operator = fallbackOperators.find((item) => item.id === id);
    if (operator) {
      operator.isActive = false;
      operator.updatedAt = new Date();
      persistFallbackStore();
    }
    return { success: true } as const;
  }

  await db.update(productionOperators).set({ isActive: false }).where(eq(productionOperators.id, id));
  return { success: true } as const;
}

export async function getProductionSettings() {
  const db = await getDb();
  if (!db) return fallbackSettings;
  const rows = await db.select().from(productionSettings).where(eq(productionSettings.id, 1)).limit(1);
  return rows[0];
}

export async function getSynchronizedExcelFileFallback() {
  return fallbackSynchronizedFile;
}

export async function saveSynchronizedExcelFileFallback(file: { id: number; fileName: string; storageKey: string; downloadUrl: string; recordCount: number }) {
  fallbackSynchronizedFile = {
    id: file.id,
    fileName: file.fileName,
    storageKey: file.storageKey,
    downloadUrl: file.downloadUrl,
    recordCount: file.recordCount,
    updatedAt: new Date(),
  };
  persistFallbackStore();
  return fallbackSynchronizedFile;
}

export async function saveActionPasswordDigest(digest: ActionPasswordDigest) {
  const db = await getDb();
  if (!db) {
    fallbackSettings = {
      id: 1,
      actionPasswordHash: digest.hash,
      actionPasswordSalt: digest.salt,
      updatedAt: new Date(),
    };
    persistFallbackStore();
    return fallbackSettings;
  }

  await db.insert(productionSettings).values({ id: 1, actionPasswordHash: digest.hash, actionPasswordSalt: digest.salt }).onDuplicateKeyUpdate({
    set: { actionPasswordHash: digest.hash, actionPasswordSalt: digest.salt, updatedAt: new Date() },
  });
  return getProductionSettings();
}
