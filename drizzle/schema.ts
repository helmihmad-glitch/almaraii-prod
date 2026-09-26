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

/** Contacts SMS (Réglages) : destinataires proposés sur la page Envoi SMS. Envoi via TextBee (voir server/smsSend.ts). */
export const smsContacts = pgTable("sms_contacts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  phone: varchar("phone", { length: 24 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("sms_contacts_phone_unique").on(table.phone)]);

/**
 * Groupes de contacts SMS (Réglages) : choisir un groupe sur la page Envoi
 * SMS sélectionne d'un coup tous ses membres plutôt que de les cocher un par
 * un. contactIds référence sms_contacts.id de façon informelle (pas de
 * contrainte de clé étrangère) — un contact retiré individuellement (voir
 * archiveSmsContact) reste listé ici mais n'apparaît plus dans les
 * suggestions, exactement comme pour les listes d'articles/silos.
 */
export const smsGroups = pgTable("sms_groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  contactIds: integer("contactIds").array().notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("sms_groups_name_unique").on(table.name)]);

export const productionSettings = pgTable("production_settings", {
  id: integer("id").primaryKey(),
  /** Identifiants admin (rôle admin/visiteur) — sans ligne stockée, "admin" / "123456" fait office de valeur par défaut. La session admin qu'ils ouvrent est désormais la seule autorisation exigée pour saisir, modifier, supprimer ou importer (l'ancien mot de passe d'action séparé a été retiré). */
  adminUsername: varchar("adminUsername", { length: 64 }),
  adminPasswordHash: varchar("adminPasswordHash", { length: 128 }),
  adminPasswordSalt: varchar("adminPasswordSalt", { length: 64 }),
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

// --- Silos de produits finis (reprise du classeur Silo_PF.xlsx) ---
// Une entrée de production décrit un lot fabriqué, réparti sur un ou plusieurs
// silos via `siloProductionAllocations`. Une ligne sans date ni lot sert de
// correction/transfert (les quantités peuvent alors être négatives), comme dans
// le classeur d’origine.

/**
 * Liste des silos configurés (Réglages) : dynamique, plutôt que la liste figée
 * SPF1..SPF12 d'origine (voir shared/silo.ts, qui ne sert plus que de valeurs
 * initiales — voir initializeSilos dans server/siloDb.ts). Retirer un silo ne
 * le supprime jamais (isActive: false) : le code reste valable dans l'historique
 * des entrées et expéditions déjà enregistrées. sortOrder préserve un ordre
 * choisi (SPF1 → SPF12, jamais alphabétique, qui placerait SPF10 avant SPF2)
 * plutôt que de dépendre du nom.
 */
export const silos = pgTable("silos", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 16 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("silos_code_unique").on(table.code)]);

export const siloProductionEntries = pgTable("silo_production_entries", {
  id: serial("id").primaryKey(),
  entryDate: varchar("entryDate", { length: 10 }),
  article: varchar("article", { length: 64 }).notNull(),
  lotNumber: varchar("lotNumber", { length: 64 }),
  totalQuantity: decimal("totalQuantity", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [index("silo_production_entries_date_index").on(table.entryDate)]);

export const siloProductionAllocations = pgTable("silo_production_allocations", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [index("silo_production_allocations_entry_index").on(table.entryId, table.silo)]);

export const siloShipments = pgTable("silo_shipments", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [index("silo_shipments_date_index").on(table.shipmentDate)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ProductionRecord = typeof productionRecords.$inferSelect;
export type InsertProductionRecord = typeof productionRecords.$inferInsert;
export type SynchronizedExcelFile = typeof synchronizedExcelFiles.$inferSelect;
export type ProductionArticle = typeof productionArticles.$inferSelect;
export type ProductionOperator = typeof productionOperators.$inferSelect;
export type SmsContact = typeof smsContacts.$inferSelect;
export type InsertSmsContact = typeof smsContacts.$inferInsert;
export type SmsGroup = typeof smsGroups.$inferSelect;
export type InsertSmsGroup = typeof smsGroups.$inferInsert;
export type ProductionSettings = typeof productionSettings.$inferSelect;
export type DailyProgram = typeof dailyPrograms.$inferSelect;
export type InsertDailyProgram = typeof dailyPrograms.$inferInsert;
export type DailyProgramLine = typeof dailyProgramLines.$inferSelect;
export type InsertDailyProgramLine = typeof dailyProgramLines.$inferInsert;
export type SiloRow = typeof silos.$inferSelect;
export type InsertSiloRow = typeof silos.$inferInsert;
export type SiloProductionEntry = typeof siloProductionEntries.$inferSelect;
export type InsertSiloProductionEntry = typeof siloProductionEntries.$inferInsert;
export type SiloProductionAllocation = typeof siloProductionAllocations.$inferSelect;
export type InsertSiloProductionAllocation = typeof siloProductionAllocations.$inferInsert;
export type SiloShipment = typeof siloShipments.$inferSelect;
export type InsertSiloShipment = typeof siloShipments.$inferInsert;
