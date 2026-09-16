import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  InsertSiloProductionEntry,
  InsertSiloShipment,
  siloProductionAllocations,
  siloProductionEntries,
  siloShipments,
} from "../drizzle/schema";
import { getDb } from "./db";

export type SiloAllocationDraft = { silo: string; quantity: number };
type FallbackEntry = { id: number; entryDate: string | null; article: string; lotNumber: string | null; totalQuantity: string | null; createdAt: Date; updatedAt: Date };
type FallbackAllocation = { id: number; entryId: number; silo: string; quantity: string; createdAt: Date; updatedAt: Date };
type FallbackShipment = { id: number; shipmentDate: string | null; article: string; lotNumber: string | null; quantity: string; silo: string; shipmentType: string; createdAt: Date; updatedAt: Date };

// Stockage de secours pour le développement local sans base de données, sur le
// même principe que server/db.ts : les écritures échouant sur un système de
// fichiers en lecture seule (fonction serverless) sont simplement ignorées.
// Vitest (process.env.VITEST) utilise son propre fichier, jamais celui du
// serveur de développement — voir le commentaire équivalent dans server/db.ts.
const fallbackPath = path.resolve(process.cwd(), process.env.VITEST ? ".local-silo-store.test.json" : ".local-silo-store.json");
const emptyStore = () => ({ entries: [] as FallbackEntry[], allocations: [] as FallbackAllocation[], shipments: [] as FallbackShipment[], nextId: 1 });

function loadFallbackStore() {
  if (!existsSync(fallbackPath)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(fallbackPath, "utf8")) as ReturnType<typeof emptyStore>;
    return {
      entries: parsed.entries ?? [],
      allocations: parsed.allocations ?? [],
      shipments: parsed.shipments ?? [],
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

  const [created] = await db.insert(siloProductionEntries).values(entry).returning();
  await replaceAllocations(created.id, allocations);
  return created;
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

  const [updated] = await db.update(siloProductionEntries)
    .set({ ...entry, updatedAt: new Date() })
    .where(eq(siloProductionEntries.id, id))
    .returning();
  await replaceAllocations(id, allocations);
  return updated;
}

export async function deleteSiloProductionEntry(id: number) {
  const db = await getDb();
  if (!db) {
    store.entries = store.entries.filter((entry) => entry.id !== id);
    store.allocations = store.allocations.filter((allocation) => allocation.entryId !== id);
    persist();
    return { success: true } as const;
  }

  await db.delete(siloProductionAllocations).where(eq(siloProductionAllocations.entryId, id));
  await db.delete(siloProductionEntries).where(eq(siloProductionEntries.id, id));
  return { success: true } as const;
}

function writeFallbackAllocations(entryId: number, allocations: SiloAllocationDraft[]) {
  store.allocations = store.allocations.filter((allocation) => allocation.entryId !== entryId);
  allocations.filter((allocation) => allocation.quantity !== 0).forEach((allocation) => {
    store.allocations.push({ id: nextId(), entryId, silo: allocation.silo, quantity: allocation.quantity.toFixed(2), createdAt: now(), updatedAt: now() });
  });
}

async function replaceAllocations(entryId: number, allocations: SiloAllocationDraft[]) {
  const db = await getDb();
  if (!db) return;
  await db.delete(siloProductionAllocations).where(eq(siloProductionAllocations.entryId, entryId));
  const rows = allocations.filter((allocation) => allocation.quantity !== 0);
  if (rows.length === 0) return;
  await db.insert(siloProductionAllocations).values(rows.map((allocation) => ({
    entryId,
    silo: allocation.silo,
    quantity: allocation.quantity.toFixed(2),
  })));
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
        createdAt: now(),
        updatedAt: now(),
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
    }).from(siloProductionAllocations),
    db.select({
      shipmentId: siloShipments.id,
      shipmentDate: siloShipments.shipmentDate,
      article: siloShipments.article,
      silo: siloShipments.silo,
      quantity: siloShipments.quantity,
      shipmentType: siloShipments.shipmentType,
    }).from(siloShipments),
  ]);

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const allocations = allocationRows
    .map((row) => {
      const entry = entryById.get(row.entryId);
      if (!entry) return null;
      return { entryId: row.entryId, entryDate: entry.entryDate, article: entry.article, lotNumber: entry.lotNumber, silo: row.silo, quantity: Number(row.quantity) };
    })
    .filter((row): row is { entryId: number; entryDate: string | null; article: string; lotNumber: string | null; silo: string; quantity: number } => row !== null);

  return {
    allocations,
    shipments: shipments.map((row) => ({ ...row, quantity: Number(row.quantity) })),
  };
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
