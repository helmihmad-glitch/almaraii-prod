import { boolean, decimal, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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

export const productionSettings = mysqlTable("production_settings", {
  id: int("id").primaryKey(),
  actionPasswordHash: varchar("actionPasswordHash", { length: 128 }),
  actionPasswordSalt: varchar("actionPasswordSalt", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ProductionRecord = typeof productionRecords.$inferSelect;
export type InsertProductionRecord = typeof productionRecords.$inferInsert;
export type SynchronizedExcelFile = typeof synchronizedExcelFiles.$inferSelect;
export type ProductionArticle = typeof productionArticles.$inferSelect;
export type ProductionSettings = typeof productionSettings.$inferSelect;
