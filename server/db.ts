import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
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
  adminUsername: string | null;
  adminPasswordHash: string | null;
  adminPasswordSalt: string | null;
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

type FallbackDailyProgram = {
  id: number;
  programDate: string;
  operatorName: string;
  createdAt: Date;
  updatedAt: Date;
};

type FallbackDailyProgramLine = {
  id: number;
  programId: number;
  sequence: number;
  article: string | null;
  version: string | null;
  bagQuantity: string | null;
  bulkQuantity: string | null;
  plannedStart: string;
  plannedEnd: string;
  observation: string | null;
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

// Vitest (process.env.VITEST, positionné automatiquement par le test runner)
// écrit dans son propre fichier : les tests ne doivent jamais partager ce
// stockage avec le serveur de développement lancé à côté, sous peine de
// polluer les données réelles de l’utilisateur avec des identifiants ou des
// enregistrements de test (vécu : un mot de passe admin de test laissé par
// une suite précédente empêchait la connexion avec les identifiants réels).
const fallbackDataPath = path.resolve(process.cwd(), process.env.VITEST ? ".local-production-store.test.json" : ".local-production-store.json");

function loadFallbackStore() {
  if (!existsSync(fallbackDataPath)) {
    return {
      articles: [],
      operators: [],
      records: [],
      settings: undefined,
      synchronizedFile: undefined,
      dailyPrograms: [],
      dailyProgramLines: [],
      nextArticleId: 1,
      nextOperatorId: 1,
      nextRecordId: 1,
      nextDailyProgramId: 1,
      nextDailyProgramLineId: 1,
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
      dailyPrograms?: FallbackDailyProgram[];
      dailyProgramLines?: FallbackDailyProgramLine[];
      nextArticleId?: number;
      nextOperatorId?: number;
      nextRecordId?: number;
      nextDailyProgramId?: number;
      nextDailyProgramLineId?: number;
    };

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
      nextDailyProgramLineId: parsed.nextDailyProgramLineId ?? 1,
    };
  } catch {
    return {
      articles: [],
      operators: [],
      records: [],
      settings: undefined,
      synchronizedFile: undefined,
      dailyPrograms: [],
      dailyProgramLines: [],
      nextArticleId: 1,
      nextOperatorId: 1,
      nextRecordId: 1,
      nextDailyProgramId: 1,
      nextDailyProgramLineId: 1,
    };
  }
}

let fallbackPersistenceWarned = false;

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
    nextDailyProgramLineId: nextFallbackDailyProgramLineId,
  }, null, 2);

  // Ce stockage de secours n’existe que pour le développement local. Sur une
  // fonction serverless (système de fichiers en lecture seule), l’écriture
  // échoue : on dégrade alors vers une conservation en mémoire seule plutôt
  // que de faire échouer la requête de l’utilisateur avec une erreur EROFS.
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(fallbackDataPath, payload, "utf8");
  } catch (error) {
    if (!fallbackPersistenceWarned) {
      fallbackPersistenceWarned = true;
      console.warn("[Database] Stockage de secours non persistable (système de fichiers en lecture seule). Configurez DATABASE_URL pour conserver les données :", error);
    }
  }
}

const persistedFallback = loadFallbackStore();
const fallbackArticles: FallbackArticle[] = persistedFallback.articles;
const fallbackOperators: FallbackOperator[] = persistedFallback.operators;
const fallbackRecords: FallbackRecord[] = persistedFallback.records;
let fallbackSettings: FallbackProductionSettings | undefined = persistedFallback.settings;
let fallbackSynchronizedFile: FallbackSynchronizedFile | undefined = persistedFallback.synchronizedFile;
const fallbackDailyPrograms: FallbackDailyProgram[] = persistedFallback.dailyPrograms;
const fallbackDailyProgramLines: FallbackDailyProgramLine[] = persistedFallback.dailyProgramLines;
let nextFallbackArticleId = persistedFallback.nextArticleId;
let nextFallbackOperatorId = persistedFallback.nextOperatorId;
let nextFallbackRecordId = persistedFallback.nextRecordId;
let nextFallbackDailyProgramId = persistedFallback.nextDailyProgramId;
let nextFallbackDailyProgramLineId = persistedFallback.nextDailyProgramLineId;

/**
 * Vercel provisionne `DATABASE_URL` en connectant une base Postgres au projet
 * (onglet Storage) ; `POSTGRES_URL` est accepté en secours selon la variante
 * d’intégration utilisée.
 */
function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

export async function getDb() {
  const databaseUrl = getDatabaseUrl();
  if (!_db && databaseUrl) {
    try {
      // Le pilote Neon interroge Postgres en HTTP : aucune connexion TCP
      // persistante n’est conservée entre les invocations, ce qui évite les
      // erreurs de pool dormant propres aux environnements serverless.
      _db = drizzle(neon(databaseUrl));
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
  updateSet.updatedAt = new Date();

  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
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
  const [created] = await db.insert(productionRecords).values(record).returning();
  return created;
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
  const [updated] = await db.update(productionRecords).set({ ...record, updatedAt: new Date() }).where(eq(productionRecords.id, id)).returning();
  return updated;
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
  if (!db) return [...fallbackDailyPrograms].sort((a, b) => b.programDate.localeCompare(a.programDate));
  return db.select().from(dailyPrograms).orderBy(desc(dailyPrograms.programDate));
}

export async function getDailyProgramByDate(programDate: string) {
  const db = await getDb();
  if (!db) {
    const program = fallbackDailyPrograms.find((item) => item.programDate === programDate);
    if (!program) return null;
    const lines = fallbackDailyProgramLines
      .filter((line) => line.programId === program.id)
      .sort((a, b) => a.sequence - b.sequence || a.id - b.id);
    return { ...program, lines };
  }
  const programs = await db.select().from(dailyPrograms).where(eq(dailyPrograms.programDate, programDate)).limit(1);
  const program = programs[0];
  if (!program) return null;
  const lines = await db.select().from(dailyProgramLines).where(eq(dailyProgramLines.programId, program.id)).orderBy(asc(dailyProgramLines.sequence), asc(dailyProgramLines.id));
  return { ...program, lines };
}

export async function createDailyProgram(program: InsertDailyProgram) {
  const db = await getDb();
  if (!db) {
    const created: FallbackDailyProgram = {
      id: nextFallbackDailyProgramId++,
      programDate: String(program.programDate),
      operatorName: String(program.operatorName ?? ""),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fallbackDailyPrograms.push(created);
    persistFallbackStore();
    return created;
  }
  const [created] = await db.insert(dailyPrograms).values(program).returning();
  return created;
}

export async function updateDailyProgram(id: number, program: Partial<InsertDailyProgram>) {
  const db = await getDb();
  if (!db) {
    const existing = fallbackDailyPrograms.find((item) => item.id === id);
    if (!existing) return undefined;
    if (program.programDate !== undefined) existing.programDate = String(program.programDate);
    if (program.operatorName !== undefined) existing.operatorName = String(program.operatorName);
    existing.updatedAt = new Date();
    persistFallbackStore();
    return existing;
  }
  const [updated] = await db.update(dailyPrograms).set({ ...program, updatedAt: new Date() }).where(eq(dailyPrograms.id, id)).returning();
  return updated;
}

export async function deleteDailyProgram(id: number) {
  const db = await getDb();
  if (!db) {
    for (let index = fallbackDailyProgramLines.length - 1; index >= 0; index -= 1) {
      if (fallbackDailyProgramLines[index].programId === id) fallbackDailyProgramLines.splice(index, 1);
    }
    const programIndex = fallbackDailyPrograms.findIndex((item) => item.id === id);
    if (programIndex >= 0) fallbackDailyPrograms.splice(programIndex, 1);
    persistFallbackStore();
    return { success: true } as const;
  }
  await db.delete(dailyProgramLines).where(eq(dailyProgramLines.programId, id));
  await db.delete(dailyPrograms).where(eq(dailyPrograms.id, id));
  return { success: true } as const;
}

export async function createDailyProgramLine(line: InsertDailyProgramLine) {
  const db = await getDb();
  if (!db) {
    const created: FallbackDailyProgramLine = {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fallbackDailyProgramLines.push(created);
    persistFallbackStore();
    return created;
  }
  const [created] = await db.insert(dailyProgramLines).values(line).returning();
  return created;
}

export async function updateDailyProgramLine(id: number, line: Partial<InsertDailyProgramLine>) {
  const db = await getDb();
  if (!db) {
    const existing = fallbackDailyProgramLines.find((item) => item.id === id);
    if (!existing) return undefined;
    if (line.sequence !== undefined) existing.sequence = Number(line.sequence);
    if (line.article !== undefined) existing.article = line.article;
    if (line.version !== undefined) existing.version = line.version;
    if (line.bagQuantity !== undefined) existing.bagQuantity = line.bagQuantity;
    if (line.bulkQuantity !== undefined) existing.bulkQuantity = line.bulkQuantity;
    if (line.plannedStart !== undefined) existing.plannedStart = String(line.plannedStart);
    if (line.plannedEnd !== undefined) existing.plannedEnd = String(line.plannedEnd);
    if (line.observation !== undefined) existing.observation = line.observation;
    existing.updatedAt = new Date();
    persistFallbackStore();
    return existing;
  }
  const [updated] = await db.update(dailyProgramLines).set({ ...line, updatedAt: new Date() }).where(eq(dailyProgramLines.id, id)).returning();
  return updated;
}

export async function deleteDailyProgramLine(id: number) {
  const db = await getDb();
  if (!db) {
    const index = fallbackDailyProgramLines.findIndex((item) => item.id === id);
    if (index >= 0) {
      fallbackDailyProgramLines.splice(index, 1);
      persistFallbackStore();
    }
    return { success: true } as const;
  }
  await db.delete(dailyProgramLines).where(eq(dailyProgramLines.id, id));
  return { success: true } as const;
}

/**
 * Import Excel du programme journalier : remplace intégralement l'en-tête et
 * les lignes d'une journée par celles du classeur (même logique que
 * replaceSiloMovements pour Silo PF), plutôt que de les fusionner — un
 * ré-import du même fichier produit donc toujours le même résultat, sans
 * lignes dupliquées.
 */
export async function importDailyProgramDay(day: { programDate: string; operatorName: string; lines: Omit<InsertDailyProgramLine, "programId">[] }) {
  const existing = await getDailyProgramByDate(day.programDate);
  const program = existing
    ? await updateDailyProgram(existing.id, { operatorName: day.operatorName })
    : await createDailyProgram({ programDate: day.programDate, operatorName: day.operatorName });
  if (!program) throw new Error(`Impossible d’enregistrer le programme du ${day.programDate}.`);

  if (existing) {
    for (const line of existing.lines) await deleteDailyProgramLine(line.id);
  }
  for (const line of day.lines) {
    await createDailyProgramLine({ ...line, programId: program.id });
  }
  return program;
}

export async function initializeProductionArticles() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: productionArticles.id }).from(productionArticles).limit(1);
  if (existing.length > 0) return;

  const rows = await db.select({ article: productionRecords.article }).from(productionRecords);
  const codes = Array.from(new Set(rows.map((row) => row.article.trim()).filter(Boolean)));
  if (codes.length === 0) return;
  await db.insert(productionArticles).values(codes.map((code) => ({ code, isActive: true }))).onConflictDoUpdate({
    target: productionArticles.code,
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
  const [article] = await db.insert(productionArticles).values({ code: normalizedCode, isActive: true }).onConflictDoUpdate({
    target: productionArticles.code,
    set: { isActive: true, updatedAt: new Date() },
  }).returning();
  return article;
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

  await db.update(productionArticles).set({ isActive: false, updatedAt: new Date() }).where(eq(productionArticles.id, id));
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
  const [operator] = await db.insert(productionOperators).values({ name: normalizedName, isActive: true }).onConflictDoUpdate({
    target: productionOperators.name,
    set: { isActive: true, updatedAt: new Date() },
  }).returning();
  return operator;
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

  await db.update(productionOperators).set({ isActive: false, updatedAt: new Date() }).where(eq(productionOperators.id, id));
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

export async function saveAdminCredentials(username: string, digest: ActionPasswordDigest) {
  const db = await getDb();
  if (!db) {
    fallbackSettings = {
      id: 1,
      ...fallbackSettings,
      adminUsername: username,
      adminPasswordHash: digest.hash,
      adminPasswordSalt: digest.salt,
      updatedAt: new Date(),
    };
    persistFallbackStore();
    return fallbackSettings;
  }

  await db.insert(productionSettings).values({ id: 1, adminUsername: username, adminPasswordHash: digest.hash, adminPasswordSalt: digest.salt }).onConflictDoUpdate({
    target: productionSettings.id,
    set: { adminUsername: username, adminPasswordHash: digest.hash, adminPasswordSalt: digest.salt, updatedAt: new Date() },
  });
  return getProductionSettings();
}
