import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  InsertSiloProductionEntry,
  InsertSiloShipment,
  SiloProductionEntry,
  silos,
  siloProductionAllocations,
  siloProductionEntries,
  siloShipments,
} from "../drizzle/schema";
import { getDb, isUniqueViolation } from "./db";
import { SILOS } from "../shared/silo";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
/**
 * Requêtes envoyées ensemble par db.batch : le pilote HTTP de Neon les
 * exécute dans une seule transaction (il n'offre pas de db.transaction
 * interactive) — tout ou rien, jamais une écriture à moitié appliquée.
 */
type QueryBatch = [BatchItem<"pg">, ...BatchItem<"pg">[]];

/**
 * Réserve des identifiants avant l'insertion, pour écrire dans le même lot
 * (voir QueryBatch) des lignes qui y font référence — une entrée et sa
 * répartition par silo, ou les lignes d'une expédition groupée.
 */
async function reserveIds(db: Database, table: "silo_production_entries" | "silo_shipments", count: number): Promise<number[]> {
  if (count === 0) return [];
  const result = await db.execute<{ id: number }>(sql`select nextval(pg_get_serial_sequence(${table}, 'id'))::int as id from generate_series(1, ${count})`);
  return result.rows.map((row) => Number(row.id));
}

/** Découpe une insertion volumineuse pour rester sous la limite de paramètres d'une requête Postgres. */
function chunked<T>(rows: T[], size = 1000): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) chunks.push(rows.slice(start, start + size));
  return chunks;
}

/**
 * Ce code est déjà pris — voir renameSilo : par un autre silo actif, par un
 * silo retiré, ou par un historique de mouvements (entrées ou expéditions)
 * enregistré sous ce code sans silo configuré.
 */
export class SiloCodeTakenError extends Error {
  constructor(readonly siloCode: string, readonly takenBy: "active" | "archived" | "history") {
    super(`Le code ${siloCode} est déjà utilisé.`);
  }
}

export type SiloAllocationDraft = { silo: string; quantity: number };
type FallbackEntry = { id: number; entryDate: string | null; article: string; lotNumber: string | null; totalQuantity: string | null; createdAt: Date; updatedAt: Date };
type FallbackAllocation = { id: number; entryId: number; silo: string; quantity: string; manuallyDepleted: boolean; createdAt: Date; updatedAt: Date };
type FallbackShipment = { id: number; shipmentDate: string | null; article: string; lotNumber: string | null; quantity: string; silo: string; shipmentType: string; splitGroupId: number | null; createdAt: Date; updatedAt: Date };
type FallbackSilo = { id: number; code: string; isActive: boolean; sortOrder: number; createdAt: Date; updatedAt: Date };

// Stockage de secours pour le développement local sans base de données, sur le
// même principe que server/db.ts : les écritures échouant sur un système de
// fichiers en lecture seule (fonction serverless) sont simplement ignorées.
// Vitest (process.env.VITEST) utilise son propre fichier, jamais celui du
// serveur de développement — voir le commentaire équivalent dans server/db.ts.
const fallbackPath = path.resolve(process.cwd(), process.env.VITEST ? ".local-silo-store.test.json" : ".local-silo-store.json");
const emptyStore = () => ({ entries: [] as FallbackEntry[], allocations: [] as FallbackAllocation[], shipments: [] as FallbackShipment[], silos: [] as FallbackSilo[], nextId: 1 });

/** Codes article en majuscules, comme la saisie et la migration 0010_normalize_article_codes côté Postgres. */
const normalizeArticleCode = (article: string) => article.trim().toUpperCase();

function loadFallbackStore() {
  if (!existsSync(fallbackPath)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(fallbackPath, "utf8")) as ReturnType<typeof emptyStore>;
    return {
      entries: (parsed.entries ?? []).map((entry) => ({ ...entry, article: normalizeArticleCode(entry.article) })),
      // manuallyDepleted : absent des fichiers de secours écrits avant cette
      // fonctionnalité, donc à défaut "actif" (false) plutôt qu'une erreur.
      allocations: (parsed.allocations ?? []).map((allocation) => ({ ...allocation, manuallyDepleted: allocation.manuallyDepleted ?? false })),
      // splitGroupId : absent des fichiers de secours écrits avant cette fonctionnalité, donc à défaut "saisie seule" (null).
      shipments: (parsed.shipments ?? []).map((shipment) => ({ ...shipment, article: normalizeArticleCode(shipment.article), splitGroupId: shipment.splitGroupId ?? null })),
      // silos : absent des fichiers de secours écrits avant cette fonctionnalité (voir initializeSilos, qui les sème au premier accès).
      silos: parsed.silos ?? [],
      nextId: parsed.nextId ?? 1,
    };
  } catch {
    return emptyStore();
  }
}

const store = loadFallbackStore();
let persistenceWarned = false;

function persist() {
  try {
    mkdirSync(path.dirname(fallbackPath), { recursive: true });
    writeFileSync(fallbackPath, JSON.stringify(store, null, 2), "utf8");
  } catch (error) {
    if (!persistenceWarned) {
      persistenceWarned = true;
      console.warn("[Silo] Stockage de secours non persistable (système de fichiers en lecture seule). Configurez DATABASE_URL pour conserver les données :", error);
    }
  }
}

const nextId = () => store.nextId++;
const now = () => new Date();

/**
 * Sème la liste des silos avec les valeurs d'origine (SPF1..SPF12, voir
 * shared/silo.ts) au tout premier accès, une seule fois — sur le même
 * principe que initializeProductionArticles pour les articles. N'écrase
 * jamais une liste déjà configurée (retirer puis reconfigurer les 12 silos
 * ne les sèmerait pas deux fois).
 */
export async function initializeSilos() {
  const db = await getDb();
  if (!db) {
    if (store.silos.length > 0) return;
    SILOS.forEach((code, index) => {
      store.silos.push({ id: nextId(), code, isActive: true, sortOrder: index, createdAt: now(), updatedAt: now() });
    });
    persist();
    return;
  }
  const existing = await db.select({ id: silos.id }).from(silos).limit(1);
  if (existing.length > 0) return;
  await db.insert(silos).values(SILOS.map((code, index) => ({ code, isActive: true, sortOrder: index }))).onConflictDoNothing();
}

/** Silos actifs, dans l'ordre choisi (voir sortOrder) — jamais alphabétique, qui placerait SPF10 avant SPF2. */
export async function listActiveSilos() {
  const db = await getDb();
  if (!db) return [...store.silos].filter((silo) => silo.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  return db.select().from(silos).where(eq(silos.isActive, true)).orderBy(asc(silos.sortOrder));
}

/** Ajoute un silo, ou réactive celui du même code s'il avait été retiré (comme addProductionArticle pour les articles). */
export async function addSilo(code: string) {
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
    const maxSortOrder = store.silos.reduce((max, silo) => Math.max(max, silo.sortOrder), -1);
    const created: FallbackSilo = { id: nextId(), code: normalizedCode, isActive: true, sortOrder: maxSortOrder + 1, createdAt: now(), updatedAt: now() };
    store.silos.push(created);
    persist();
    return created;
  }

  const [{ maxSortOrder } = { maxSortOrder: null }] = await db.select({ maxSortOrder: silos.sortOrder }).from(silos).orderBy(desc(silos.sortOrder)).limit(1);
  const [created] = await db.insert(silos).values({ code: normalizedCode, isActive: true, sortOrder: (maxSortOrder ?? -1) + 1 }).onConflictDoUpdate({
    target: silos.code,
    set: { isActive: true, updatedAt: new Date() },
  }).returning();
  return created;
}

/**
 * Renomme un silo : le nouveau code remplace l'ancien partout où il est déjà
 * utilisé (entrées de production et expéditions déjà enregistrées), pour
 * qu'aucune donnée existante ne se retrouve orpheline d'un code qui n'existe
 * plus dans la liste configurée. Un code déjà porté par un autre silo (même
 * retiré) ou par des mouvements déjà enregistrés est refusé
 * (SiloCodeTakenError) : les deux historiques se fondraient sinon, sans retour
 * possible, sous un même code.
 */
export async function renameSilo(id: number, newCode: string) {
  const normalizedCode = newCode.trim().toUpperCase();
  const db = await getDb();
  if (!db) {
    const existing = store.silos.find((silo) => silo.id === id);
    if (!existing) return undefined;
    const oldCode = existing.code;
    if (oldCode === normalizedCode) return existing;
    const taken = store.silos.find((silo) => silo.id !== id && silo.code === normalizedCode);
    if (taken) throw new SiloCodeTakenError(normalizedCode, taken.isActive ? "active" : "archived");
    if (store.allocations.some((allocation) => allocation.silo === normalizedCode) || store.shipments.some((shipment) => shipment.silo === normalizedCode)) {
      throw new SiloCodeTakenError(normalizedCode, "history");
    }
    existing.code = normalizedCode;
    existing.updatedAt = now();
    store.allocations.forEach((allocation) => { if (allocation.silo === oldCode) { allocation.silo = normalizedCode; allocation.updatedAt = now(); } });
    store.shipments.forEach((shipment) => { if (shipment.silo === oldCode) { shipment.silo = normalizedCode; shipment.updatedAt = now(); } });
    persist();
    return existing;
  }

  const [existing] = await db.select().from(silos).where(eq(silos.id, id)).limit(1);
  if (!existing) return undefined;
  if (existing.code === normalizedCode) return existing;
  const [taken] = await db.select({ isActive: silos.isActive }).from(silos).where(and(eq(silos.code, normalizedCode), ne(silos.id, id))).limit(1);
  if (taken) throw new SiloCodeTakenError(normalizedCode, taken.isActive ? "active" : "archived");
  const [[allocationUsingCode], [shipmentUsingCode]] = await Promise.all([
    db.select({ id: siloProductionAllocations.id }).from(siloProductionAllocations).where(eq(siloProductionAllocations.silo, normalizedCode)).limit(1),
    db.select({ id: siloShipments.id }).from(siloShipments).where(eq(siloShipments.silo, normalizedCode)).limit(1),
  ]);
  if (allocationUsingCode || shipmentUsingCode) throw new SiloCodeTakenError(normalizedCode, "history");
  try {
    const [updatedRows] = await db.batch([
      db.update(silos).set({ code: normalizedCode, updatedAt: new Date() }).where(eq(silos.id, id)).returning(),
      db.update(siloProductionAllocations).set({ silo: normalizedCode, updatedAt: new Date() }).where(eq(siloProductionAllocations.silo, existing.code)),
      db.update(siloShipments).set({ silo: normalizedCode, updatedAt: new Date() }).where(eq(siloShipments.silo, existing.code)),
    ]);
    return updatedRows[0];
  } catch (error) {
    // Un autre renommage simultané a pris ce code entre la vérification et l'écriture.
    if (isUniqueViolation(error)) throw new SiloCodeTakenError(normalizedCode, "active");
    throw error;
  }
}

/** Retire un silo de la liste active (jamais supprimé : l'historique déjà enregistré sous ce code reste intact). */
export async function archiveSilo(id: number) {
  const db = await getDb();
  if (!db) {
    const silo = store.silos.find((item) => item.id === id);
    if (silo) { silo.isActive = false; silo.updatedAt = now(); persist(); }
    return { success: true } as const;
  }
  await db.update(silos).set({ isActive: false, updatedAt: new Date() }).where(eq(silos.id, id));
  return { success: true } as const;
}

/** Codes de silo rencontrés dans les mouvements mais absents de la liste active — pour ne jamais faire disparaître un stock ou un historique déjà enregistré sous un silo retiré. */
export async function listSiloMovementSilos() {
  const db = await getDb();
  if (!db) {
    const codes = new Set<string>();
    store.allocations.forEach((allocation) => codes.add(allocation.silo));
    store.shipments.forEach((shipment) => codes.add(shipment.silo));
    return Array.from(codes);
  }
  const [allocationSilos, shipmentSilos] = await Promise.all([
    db.selectDistinct({ silo: siloProductionAllocations.silo }).from(siloProductionAllocations),
    db.selectDistinct({ silo: siloShipments.silo }).from(siloShipments),
  ]);
  return Array.from(new Set([...allocationSilos.map((row) => row.silo), ...shipmentSilos.map((row) => row.silo)]));
}

/** Entrées de production avec leur répartition par silo, la plus récente d’abord. */
export async function listSiloProductionEntries() {
  const db = await getDb();
  if (!db) {
    return [...store.entries]
      .sort((a, b) => (b.entryDate ?? "").localeCompare(a.entryDate ?? "") || b.id - a.id)
      .map((entry) => ({ ...entry, allocations: store.allocations.filter((allocation) => allocation.entryId === entry.id) }));
  }

  const entries = await db.select().from(siloProductionEntries)
    .orderBy(desc(siloProductionEntries.entryDate), desc(siloProductionEntries.id));
  if (entries.length === 0) return [];

  const allocations = await db.select().from(siloProductionAllocations)
    .where(inArray(siloProductionAllocations.entryId, entries.map((entry) => entry.id)))
    .orderBy(asc(siloProductionAllocations.id));

  return entries.map((entry) => ({
    ...entry,
    allocations: allocations.filter((allocation) => allocation.entryId === entry.id),
  }));
}

export async function createSiloProductionEntry(entry: Omit<InsertSiloProductionEntry, "id">, allocations: SiloAllocationDraft[]) {
  const db = await getDb();
  if (!db) {
    const created: FallbackEntry = {
      id: nextId(),
      entryDate: entry.entryDate ?? null,
      article: entry.article,
      lotNumber: entry.lotNumber ?? null,
      totalQuantity: entry.totalQuantity ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    store.entries.push(created);
    writeFallbackAllocations(created.id, allocations);
    persist();
    return created;
  }

  // L'entrée et sa répartition par silo sont écrites ensemble : jamais une entrée enregistrée sans son stock.
  const [entryId] = await reserveIds(db, "silo_production_entries", 1);
  const rows = allocationRows(entryId, allocations, new Map());
  const [createdRows] = await db.batch([
    db.insert(siloProductionEntries).values({ ...entry, id: entryId }).returning(),
    ...(rows.length ? [db.insert(siloProductionAllocations).values(rows)] : []),
  ] as QueryBatch);
  return (createdRows as SiloProductionEntry[])[0];
}

export async function updateSiloProductionEntry(id: number, entry: Partial<InsertSiloProductionEntry>, allocations: SiloAllocationDraft[]) {
  const db = await getDb();
  if (!db) {
    const existing = store.entries.find((item) => item.id === id);
    if (!existing) return undefined;
    existing.entryDate = entry.entryDate ?? null;
    existing.article = entry.article ?? existing.article;
    existing.lotNumber = entry.lotNumber ?? null;
    existing.totalQuantity = entry.totalQuantity ?? null;
    existing.updatedAt = now();
    writeFallbackAllocations(id, allocations);
    persist();
    return existing;
  }

  const [current] = await db.select({ id: siloProductionEntries.id }).from(siloProductionEntries).where(eq(siloProductionEntries.id, id)).limit(1);
  if (!current) return undefined;
  // Voir le commentaire équivalent dans writeFallbackAllocations : on reprend
  // le statut "épuisé manuellement" des silos qui restent après le remplacement.
  const existing = await db.select({ silo: siloProductionAllocations.silo, manuallyDepleted: siloProductionAllocations.manuallyDepleted })
    .from(siloProductionAllocations).where(eq(siloProductionAllocations.entryId, id));
  const rows = allocationRows(id, allocations, new Map(existing.map((row) => [row.silo, row.manuallyDepleted])));
  // Mise à jour, suppression de l'ancienne répartition et insertion de la
  // nouvelle dans une seule transaction : une coupure entre deux requêtes ne
  // peut plus laisser l'entrée sans aucune répartition (stock disparu).
  const [updatedRows] = await db.batch([
    db.update(siloProductionEntries).set({ ...entry, updatedAt: new Date() }).where(eq(siloProductionEntries.id, id)).returning(),
    db.delete(siloProductionAllocations).where(eq(siloProductionAllocations.entryId, id)),
    ...(rows.length ? [db.insert(siloProductionAllocations).values(rows)] : []),
  ] as QueryBatch);
  return (updatedRows as SiloProductionEntry[])[0];
}

export async function deleteSiloProductionEntry(id: number) {
  const db = await getDb();
  if (!db) {
    store.entries = store.entries.filter((entry) => entry.id !== id);
    store.allocations = store.allocations.filter((allocation) => allocation.entryId !== id);
    persist();
    return { success: true } as const;
  }

  await db.batch([
    db.delete(siloProductionAllocations).where(eq(siloProductionAllocations.entryId, id)),
    db.delete(siloProductionEntries).where(eq(siloProductionEntries.id, id)),
  ]);
  return { success: true } as const;
}

function writeFallbackAllocations(entryId: number, allocations: SiloAllocationDraft[]) {
  // Modifier une entrée (date, article, quantités…) ne doit pas rouvrir un
  // lot fermé manuellement sur un silo qui reste inchangé : on reprend son
  // statut avant de remplacer les lignes.
  const previouslyDepleted = new Map(store.allocations.filter((allocation) => allocation.entryId === entryId).map((allocation) => [allocation.silo, allocation.manuallyDepleted]));
  store.allocations = store.allocations.filter((allocation) => allocation.entryId !== entryId);
  allocations.filter((allocation) => allocation.quantity !== 0).forEach((allocation) => {
    store.allocations.push({ id: nextId(), entryId, silo: allocation.silo, quantity: allocation.quantity.toFixed(2), manuallyDepleted: previouslyDepleted.get(allocation.silo) ?? false, createdAt: now(), updatedAt: now() });
  });
}

/** Lignes de répartition à insérer pour une entrée (les silos à zéro n'en produisent aucune). */
function allocationRows(entryId: number, allocations: SiloAllocationDraft[], previouslyDepleted: Map<string, boolean>) {
  return allocations.filter((allocation) => allocation.quantity !== 0).map((allocation) => ({
    entryId,
    silo: allocation.silo,
    quantity: allocation.quantity.toFixed(2),
    manuallyDepleted: previouslyDepleted.get(allocation.silo) ?? false,
  }));
}

export async function listSiloShipments() {
  const db = await getDb();
  if (!db) return [...store.shipments].sort((a, b) => (b.shipmentDate ?? "").localeCompare(a.shipmentDate ?? "") || b.id - a.id);
  return db.select().from(siloShipments).orderBy(desc(siloShipments.shipmentDate), desc(siloShipments.id));
}

export async function createSiloShipment(shipment: Omit<InsertSiloShipment, "id">) {
  const db = await getDb();
  if (!db) {
    const created: FallbackShipment = {
      id: nextId(),
      shipmentDate: shipment.shipmentDate ?? null,
      article: shipment.article,
      lotNumber: shipment.lotNumber ?? null,
      quantity: shipment.quantity,
      silo: shipment.silo,
      shipmentType: shipment.shipmentType,
      splitGroupId: shipment.splitGroupId ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    store.shipments.push(created);
    persist();
    return created;
  }

  const [created] = await db.insert(siloShipments).values(shipment).returning();
  return created;
}

/**
 * Crée plusieurs lignes d'expédition ensemble, en les reliant par un
 * splitGroupId partagé (l'id de la première ligne) dès qu'il y en a plus
 * d'une — le cas d'une expédition répartie automatiquement sur plusieurs
 * lots FIFO (voir allocateFifoShipment). Une seule ligne reste indépendante
 * (splitGroupId nul), exactement comme une saisie manuelle d'un seul lot :
 * l'interface ne doit jamais afficher comme "une même expédition répartie"
 * des lignes saisies séparément qui partagent seulement les mêmes valeurs
 * par coïncidence (même date, article, silo et type).
 */
export async function createSiloShipmentGroup(shipments: Omit<InsertSiloShipment, "id" | "splitGroupId">[]) {
  if (shipments.length <= 1) {
    return shipments.length === 0 ? [] : [await createSiloShipment(shipments[0])];
  }

  const db = await getDb();
  if (!db) {
    const created = shipments.map((shipment) => {
      const row: FallbackShipment = {
        id: nextId(),
        shipmentDate: shipment.shipmentDate ?? null,
        article: shipment.article,
        lotNumber: shipment.lotNumber ?? null,
        quantity: shipment.quantity,
        silo: shipment.silo,
        shipmentType: shipment.shipmentType,
        splitGroupId: null,
        createdAt: now(),
        updatedAt: now(),
      };
      store.shipments.push(row);
      return row;
    });
    const groupId = created[0].id;
    created.forEach((row) => { row.splitGroupId = groupId; });
    persist();
    return created;
  }

  // Identifiants réservés d'avance : les lignes portent leur splitGroupId dès
  // leur insertion, en une seule requête, plutôt que par une mise à jour
  // séparée qui pourrait ne jamais s'appliquer.
  const ids = await reserveIds(db, "silo_shipments", shipments.length);
  return db.insert(siloShipments).values(shipments.map((shipment, index) => ({ ...shipment, id: ids[index], splitGroupId: ids[0] }))).returning();
}

export async function updateSiloShipment(id: number, shipment: Partial<InsertSiloShipment>) {
  const db = await getDb();
  if (!db) {
    const existing = store.shipments.find((item) => item.id === id);
    if (!existing) return undefined;
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

  const [updated] = await db.update(siloShipments)
    .set({ ...shipment, updatedAt: new Date() })
    .where(eq(siloShipments.id, id))
    .returning();
  return updated;
}

export async function deleteSiloShipment(id: number) {
  const db = await getDb();
  if (!db) {
    store.shipments = store.shipments.filter((shipment) => shipment.id !== id);
    persist();
    return { success: true } as const;
  }

  await db.delete(siloShipments).where(eq(siloShipments.id, id));
  return { success: true } as const;
}

/**
 * Remplace l’intégralité des mouvements par ceux du classeur importé.
 *
 * Le classeur décrit l’état complet du stock : un ajout cumulatif ferait
 * doubler les quantités à chaque réimport du même fichier. Le remplacement
 * garde donc l’import idempotent.
 */
export async function replaceSiloMovements(entries: { entry: Omit<InsertSiloProductionEntry, "id">; allocations: SiloAllocationDraft[] }[], shipments: Omit<InsertSiloShipment, "id">[]) {
  const db = await getDb();
  if (!db) {
    store.entries = [];
    store.allocations = [];
    store.shipments = [];
    entries.forEach(({ entry, allocations }) => {
      const created: FallbackEntry = {
        id: nextId(),
        entryDate: entry.entryDate ?? null,
        article: entry.article,
        lotNumber: entry.lotNumber ?? null,
        totalQuantity: entry.totalQuantity ?? null,
        createdAt: now(),
        updatedAt: now(),
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
        updatedAt: now(),
      });
    });
    persist();
    return { entries: entries.length, shipments: shipments.length };
  }

  // Tout le remplacement dans une seule transaction : un import interrompu
  // (coupure réseau, délai dépassé) laisse l'historique existant intact au
  // lieu de l'effacer en ne réécrivant qu'une partie du fichier.
  const entryIds = await reserveIds(db, "silo_production_entries", entries.length);
  const entryValues = entries.map(({ entry }, index) => ({ ...entry, id: entryIds[index] }));
  const allocationValues = entries.flatMap(({ allocations }, index) => allocationRows(entryIds[index], allocations, new Map()));
  await db.batch([
    db.delete(siloProductionAllocations),
    db.delete(siloProductionEntries),
    db.delete(siloShipments),
    ...chunked(entryValues).map((values) => db.insert(siloProductionEntries).values(values)),
    ...chunked(allocationValues).map((values) => db.insert(siloProductionAllocations).values(values)),
    ...chunked(shipments).map((values) => db.insert(siloShipments).values(values)),
  ] as QueryBatch);

  return { entries: entries.length, shipments: shipments.length };
}

/** Données brutes nécessaires au calcul de l’état des silos. */
export async function loadSiloMovements() {
  const db = await getDb();
  if (!db) {
    const articleByEntry = new Map(store.entries.map((entry) => [entry.id, entry.article]));
    return {
      allocations: store.allocations.map((allocation) => ({
        article: articleByEntry.get(allocation.entryId) ?? "",
        silo: allocation.silo,
        quantity: Number(allocation.quantity),
      })).filter((allocation) => allocation.article),
      shipments: store.shipments.map((shipment) => ({ article: shipment.article, silo: shipment.silo, quantity: Number(shipment.quantity) })),
    };
  }

  // Deux requêtes séparées puis jointure en mémoire, plutôt qu’un innerJoin
  // SQL : une entrée tout juste créée s’est déjà montrée absente d’un
  // innerJoin allocations/entrées alors qu’elle apparaissait normalement
  // dans une requête à part sur chaque table (voir listSiloProductionEntries,
  // qui utilise déjà ce schéma et n’a jamais présenté le problème).
  const [entries, allocationRows, shipments] = await Promise.all([
    db.select({ id: siloProductionEntries.id, article: siloProductionEntries.article }).from(siloProductionEntries),
    db.select({
      entryId: siloProductionAllocations.entryId,
      silo: siloProductionAllocations.silo,
      quantity: siloProductionAllocations.quantity,
    }).from(siloProductionAllocations),
    db.select({
      article: siloShipments.article,
      silo: siloShipments.silo,
      quantity: siloShipments.quantity,
    }).from(siloShipments),
  ]);

  const articleByEntry = new Map(entries.map((entry) => [entry.id, entry.article]));
  const allocations = allocationRows
    .map((row) => {
      const article = articleByEntry.get(row.entryId);
      if (article === undefined) return null;
      return { article, silo: row.silo, quantity: Number(row.quantity) };
    })
    .filter((row): row is { article: string; silo: string; quantity: number } => row !== null);

  return {
    allocations,
    shipments: shipments.map((row) => ({ article: row.article, silo: row.silo, quantity: Number(row.quantity) })),
  };
}

/**
 * Mouvements détaillés (identifiant d’entrée, n° de lot, dates) nécessaires
 * à la traçabilité FIFO — contrairement à `loadSiloMovements`, qui ne garde
 * que ce dont a besoin l’état agrégé des silos.
 */
export async function loadLotMovements() {
  const db = await getDb();
  if (!db) {
    const entryById = new Map(store.entries.map((entry) => [entry.id, entry]));
    return {
      allocations: store.allocations
        .map((allocation) => {
          const entry = entryById.get(allocation.entryId);
          if (!entry) return null;
          return {
            entryId: allocation.entryId,
            entryDate: entry.entryDate,
            article: entry.article,
            lotNumber: entry.lotNumber,
            silo: allocation.silo,
            quantity: Number(allocation.quantity),
            manuallyDepleted: allocation.manuallyDepleted,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
      shipments: store.shipments.map((shipment) => ({
        shipmentId: shipment.id,
        shipmentDate: shipment.shipmentDate,
        article: shipment.article,
        silo: shipment.silo,
        quantity: Number(shipment.quantity),
        shipmentType: shipment.shipmentType,
        lotNumber: shipment.lotNumber,
      })),
    };
  }

  // Voir loadSiloMovements ci-dessus : jointure faite en mémoire plutôt
  // qu’avec un innerJoin SQL.
  const [entries, allocationRows, shipments] = await Promise.all([
    db.select({
      id: siloProductionEntries.id,
      entryDate: siloProductionEntries.entryDate,
      article: siloProductionEntries.article,
      lotNumber: siloProductionEntries.lotNumber,
    }).from(siloProductionEntries),
    db.select({
      entryId: siloProductionAllocations.entryId,
      silo: siloProductionAllocations.silo,
      quantity: siloProductionAllocations.quantity,
      manuallyDepleted: siloProductionAllocations.manuallyDepleted,
    }).from(siloProductionAllocations).orderBy(asc(siloProductionAllocations.id)), // ordre de saisie : départage les lots entrés à la même date dans le grand livre FIFO (voir computeLotLedger).
    db.select({
      shipmentId: siloShipments.id,
      shipmentDate: siloShipments.shipmentDate,
      article: siloShipments.article,
      silo: siloShipments.silo,
      quantity: siloShipments.quantity,
      shipmentType: siloShipments.shipmentType,
      lotNumber: siloShipments.lotNumber,
    }).from(siloShipments).orderBy(asc(siloShipments.id)), // ordre de saisie : départage les sorties du même jour, comme les lots ci-dessus.
  ]);

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const allocations = allocationRows
    .map((row) => {
      const entry = entryById.get(row.entryId);
      if (!entry) return null;
      return { entryId: row.entryId, entryDate: entry.entryDate, article: entry.article, lotNumber: entry.lotNumber, silo: row.silo, quantity: Number(row.quantity), manuallyDepleted: row.manuallyDepleted };
    })
    .filter((row): row is { entryId: number; entryDate: string | null; article: string; lotNumber: string | null; silo: string; quantity: number; manuallyDepleted: boolean } => row !== null);

  return {
    allocations,
    shipments: shipments.map((row) => ({ ...row, quantity: Number(row.quantity) })),
  };
}

/**
 * Ferme (ou rouvre) manuellement un lot précis — un couple (entrée, silo),
 * la granularité d'une ligne de la traçabilité des lots — indépendamment de
 * ce que le grand livre FIFO calcule à partir des sorties enregistrées (voir
 * computeLotLedger dans siloLots.ts). Ne modifie ni la quantité produite
 * d'origine ni l'historique des sorties : seul le drapeau est changé.
 * Renvoie undefined si ce couple (entrée, silo) n'existe pas.
 */
export async function setLotManualDepletion(entryId: number, silo: string, manuallyDepleted: boolean) {
  const db = await getDb();
  if (!db) {
    const existing = store.allocations.find((allocation) => allocation.entryId === entryId && allocation.silo === silo);
    if (!existing) return undefined;
    existing.manuallyDepleted = manuallyDepleted;
    existing.updatedAt = now();
    persist();
    return existing;
  }

  const [updated] = await db.update(siloProductionAllocations)
    .set({ manuallyDepleted, updatedAt: new Date() })
    .where(and(eq(siloProductionAllocations.entryId, entryId), eq(siloProductionAllocations.silo, silo)))
    .returning();
  return updated;
}

/** Articles rencontrés dans les mouvements, pour compléter la liste configurée. */
export async function listSiloMovementArticles() {
  const db = await getDb();
  if (!db) {
    return Array.from(new Set([...store.entries.map((entry) => entry.article), ...store.shipments.map((shipment) => shipment.article)].map((article) => article.trim()).filter(Boolean)));
  }

  const [entryArticles, shipmentArticles] = await Promise.all([
    db.selectDistinct({ article: siloProductionEntries.article }).from(siloProductionEntries),
    db.selectDistinct({ article: siloShipments.article }).from(siloShipments),
  ]);
  return Array.from(new Set([...entryArticles, ...shipmentArticles].map((row) => row.article.trim()).filter(Boolean)));
}
