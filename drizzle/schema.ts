import { boolean, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const productionRecords = mysqlTable("production_records", {
  id: int("id").autoincrement().primaryKey(),
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const synchronizedExcelFiles = mysqlTable("synchronized_excel_files", {
  id: int("id").primaryKey(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  downloadUrl: varchar("downloadUrl", { length: 1024 }).notNull(),
  recordCount: int("recordCount").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const productionArticles = mysqlTable("production_articles", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("production_articles_code_unique").on(table.code)]);

export const productionOperators = mysqlTable("production_operators", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("production_operators_name_unique").on(table.name)]);

export const productionSettings = mysqlTable("production_settings", {
  id: int("id").primaryKey(),
  actionPasswordHash: varchar("actionPasswordHash", { length: 128 }),
  actionPasswordSalt: varchar("actionPasswordSalt", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const dailyPrograms = mysqlTable("daily_programs", {
  id: int("id").autoincrement().primaryKey(),
  programDate: varchar("programDate", { length: 10 }).notNull(),
  operatorName: text("operatorName").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("daily_programs_date_unique").on(table.programDate)]);

export const dailyProgramLines = mysqlTable("daily_program_lines", {
  id: int("id").autoincrement().primaryKey(),
  programId: int("programId").notNull(),
  sequence: int("sequence").notNull().default(1),
  article: varchar("article", { length: 64 }),
  version: varchar("version", { length: 64 }),
  bagQuantity: varchar("bagQuantity", { length: 128 }),
  bulkQuantity: varchar("bulkQuantity", { length: 128 }),
  plannedStart: varchar("plannedStart", { length: 5 }).notNull(),
  plannedEnd: varchar("plannedEnd", { length: 5 }).notNull(),
  observation: text("observation"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
