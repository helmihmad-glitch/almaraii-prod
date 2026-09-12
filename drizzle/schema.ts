import { boolean, decimal, index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// Postgres n’a pas d’équivalent natif à `ON UPDATE CURRENT_TIMESTAMP` de MySQL :
// les colonnes `updatedAt` sont donc renseignées explicitement côté application
// (voir server/db.ts) à chaque mise à jour.

export const userRole = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const productionRecords = pgTable("production_records", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const synchronizedExcelFiles = pgTable("synchronized_excel_files", {
  id: integer("id").primaryKey(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  downloadUrl: varchar("downloadUrl", { length: 1024 }).notNull(),
  recordCount: integer("recordCount").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const productionArticles = pgTable("production_articles", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 64 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("production_articles_code_unique").on(table.code)]);

export const productionOperators = pgTable("production_operators", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("production_operators_name_unique").on(table.name)]);

export const productionSettings = pgTable("production_settings", {
  id: integer("id").primaryKey(),
  actionPasswordHash: varchar("actionPasswordHash", { length: 128 }),
  actionPasswordSalt: varchar("actionPasswordSalt", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const dailyPrograms = pgTable("daily_programs", {
  id: serial("id").primaryKey(),
  programDate: varchar("programDate", { length: 10 }).notNull(),
  operatorName: text("operatorName").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("daily_programs_date_unique").on(table.programDate)]);

export const dailyProgramLines = pgTable("daily_program_lines", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [index("daily_program_lines_program_sequence_index").on(table.programId, table.sequence)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ProductionRecord = typeof productionRecords.$inferSelect;
export type InsertProductionRecord = typeof productionRecords.$inferInsert;
export type SynchronizedExcelFile = typeof synchronizedExcelFiles.$inferSelect;
export type ProductionArticle = typeof productionArticles.$inferSelect;
export type ProductionOperator = typeof productionOperators.$inferSelect;
export type ProductionSettings = typeof productionSettings.$inferSelect;
export type DailyProgram = typeof dailyPrograms.$inferSelect;
export type InsertDailyProgram = typeof dailyPrograms.$inferInsert;
export type DailyProgramLine = typeof dailyProgramLines.$inferSelect;
export type InsertDailyProgramLine = typeof dailyProgramLines.$inferInsert;
