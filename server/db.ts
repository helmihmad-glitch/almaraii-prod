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
  productionRecords,
  productionSettings,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { ActionPasswordDigest } from "./settingsSecurity";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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
  if (!db) return [];
  return db.select().from(productionRecords).orderBy(desc(productionRecords.productionDate), desc(productionRecords.id));
}

export async function createProductionRecord(record: InsertProductionRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(productionRecords).values(record);
  const rows = await db.select().from(productionRecords).where(eq(productionRecords.id, result[0].insertId));
  return rows[0];
}

export async function updateProductionRecord(id: number, record: Partial<InsertProductionRecord>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(productionRecords).set(record).where(eq(productionRecords.id, id));
  const rows = await db.select().from(productionRecords).where(eq(productionRecords.id, id));
  return rows[0];
}

export async function deleteProductionRecord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
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
  if (!db) return undefined;
  const programs = await db.select().from(dailyPrograms).where(eq(dailyPrograms.programDate, programDate)).limit(1);
  const program = programs[0];
  if (!program) return undefined;
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
  if (!db) return [];
  return db.select().from(productionArticles).where(eq(productionArticles.isActive, true)).orderBy(asc(productionArticles.code));
}

export async function addProductionArticle(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const normalizedCode = code.trim().toUpperCase();
  await db.insert(productionArticles).values({ code: normalizedCode, isActive: true }).onDuplicateKeyUpdate({
    set: { isActive: true, updatedAt: new Date() },
  });
  const rows = await db.select().from(productionArticles).where(eq(productionArticles.code, normalizedCode)).limit(1);
  return rows[0];
}

export async function archiveProductionArticle(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(productionArticles).set({ isActive: false }).where(eq(productionArticles.id, id));
  return { success: true } as const;
}

export async function getProductionSettings() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(productionSettings).where(eq(productionSettings.id, 1)).limit(1);
  return rows[0];
}

export async function saveActionPasswordDigest(digest: ActionPasswordDigest) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(productionSettings).values({ id: 1, actionPasswordHash: digest.hash, actionPasswordSalt: digest.salt }).onDuplicateKeyUpdate({
    set: { actionPasswordHash: digest.hash, actionPasswordSalt: digest.salt, updatedAt: new Date() },
  });
  return getProductionSettings();
}
