import ExcelJS from "exceljs";
import { columnLetter, TITLE_FILL, writeTitle } from "./siloExcel";
import { SILOS } from "../shared/silo";

// Tracabilite FIFO des lots de produits finis, silo par silo.
//
// Chaque entree de production depose un lot dans un silo (une meme entree
// peut etre repartie sur plusieurs silos ; chaque silo recoit alors sa
// propre part, tracee separement, puisqu'un meme lot physique peut se
// trouver dans deux silos en meme temps). Les expeditions et les corrections
// (quantite negative saisie directement en production, comme dans le
// classeur d'origine) consomment ensuite le plus ANCIEN lot disponible en
// premier -- la regle FIFO standard de gestion de stock -- jusqu'a
// epuisement de la quantite a retirer.
//
// Exemple (celui qui a motive cette fonctionnalite) :
//   10 T de CM1, lot 2600655-0905, entrent dans SPF1
//   10 T de CM1, lot 2600659-0906, entrent ensuite dans SPF1
//   5 T de CM1 sortent de SPF1 (expedition)
//   -> le lot 2600655-0905 (le plus ancien) tombe a 5 T restantes ;
//      le lot 2600659-0906 reste intact a 10 T.

export type LotAllocationInput = {
  entryId: number;
  entryDate: string | null;
  article: string;
  lotNumber: string | null;
  silo: string;
  /** Positive : depot de production. Negative : correction manuelle (retrait sans lot d'origine). */
  quantity: number;
  /** Lot ferme manuellement (voir la note sur LotBalance.manuallyDepleted). Ignore sur une ligne de correction (quantity negative). */
  manuallyDepleted?: boolean;
};

export type LotShipmentInput = {
  shipmentId: number;
  shipmentDate: string | null;
  article: string;
  silo: string;
  quantity: number;
  shipmentType: string;
  /** N° de lot enregistré sur la ligne d'expédition : ce lot est consommé en priorité (voir computeLotLedger). */
  lotNumber?: string | null;
};

export type LotConsumptionSource =
  | { type: "shipment"; shipmentId: number; date: string | null; shipmentType: string }
  | { type: "correction"; entryId: number; date: string | null };

export type LotConsumption = { quantity: number; source: LotConsumptionSource };

export type LotBalance = {
  entryId: number;
  article: string;
  silo: string;
  lotNumber: string | null;
  entryDate: string | null;
  producedQuantity: number;
  consumedQuantity: number;
  remainingQuantity: number;
  status: "active" | "depleted";
  /**
   * Ferme manuellement, indépendamment du calcul FIFO : remainingQuantity a
   * été forcé à 0 et status à "depleted" même si les sorties enregistrées
   * (consumedQuantity) ne couvrent pas toute la quantité produite — l'écart
   * représente la part non expliquée par une sortie, écartée volontairement
   * (voir setLotManualDepletion dans siloDb.ts). Réversible : lever ce
   * drapeau restitue aussitôt le calcul FIFO normal.
   */
  manuallyDepleted: boolean;
  consumptions: LotConsumption[];
};

/** Consommation qu'aucun lot n'a pu couvrir (retraits excedant la production connue). */
export type UnattributedConsumption = { article: string; silo: string; quantity: number; source: LotConsumptionSource };

export type LotLedger = { lots: LotBalance[]; unattributed: UnattributedConsumption[] };

type QueueEvent =
  | { kind: "produce"; date: string; sequence: number; entryId: number; lotNumber: string | null; entryDate: string | null; quantity: number; manuallyDepleted: boolean }
  | { kind: "consume"; date: string; sequence: number; quantity: number; lotNumber: string | null; source: LotConsumptionSource };

/** Les mouvements sans date sont rares (saisie manuelle incomplete) ; on les place apres les mouvements dates plutot que de les laisser perturber l'ordre chronologique connu. */
const UNDATED_SORT_KEY = "9999-99-99";

/** Position chronologique d'un mouvement dans le grand livre (sans date : en fin de chronologie). */
const movementKey = (date: string | null | undefined) => date ?? UNDATED_SORT_KEY;

function roundTons(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Départage deux lots entrés à la même date : le n° de lot (attribué par le
 * système externe au moment de la production) reflète l'ordre réel de
 * fabrication bien plus fidèlement que l'ordre de saisie dans l'application —
 * une saisie groupée ou tardive peut très bien enregistrer les lots dans le
 * désordre (voir le commentaire équivalent dans computeLotLedger). À défaut
 * de n° de lot des deux côtés, repli sur l'ordre de saisie (entryId).
 */
export function compareLotOrder(a: { lotNumber: string | null; entryId: number }, b: { lotNumber: string | null; entryId: number }): number {
  if (a.lotNumber && b.lotNumber) return a.lotNumber.localeCompare(b.lotNumber);
  if (a.lotNumber) return -1;
  if (b.lotNumber) return 1;
  return a.entryId - b.entryId;
}

type EventGroup = { article: string; silo: string; events: QueueEvent[] };

/**
 * Mouvements regroupés par couple (article, silo) et triés dans l'ordre où le
 * grand livre les applique : par date (sans date en dernier), puis par ordre
 * de saisie ; deux lots produits le même jour se départagent par n° de lot.
 */
function buildEventGroups(allocations: LotAllocationInput[], shipments: LotShipmentInput[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  let sequence = 0;

  const pushEvent = (article: string, silo: string, event: QueueEvent) => {
    const key = article + "::" + silo;
    let group = groups.get(key);
    if (!group) {
      group = { article, silo, events: [] };
      groups.set(key, group);
    }
    group.events.push(event);
  };

  for (const allocation of allocations) {
    if (allocation.quantity === 0) continue;
    const date = movementKey(allocation.entryDate);
    sequence += 1;
    if (allocation.quantity > 0) {
      pushEvent(allocation.article, allocation.silo, {
        kind: "produce",
        date,
        sequence,
        entryId: allocation.entryId,
        lotNumber: allocation.lotNumber,
        entryDate: allocation.entryDate,
        quantity: allocation.quantity,
        manuallyDepleted: allocation.manuallyDepleted ?? false,
      });
    } else {
      pushEvent(allocation.article, allocation.silo, {
        kind: "consume",
        date,
        sequence,
        quantity: -allocation.quantity,
        lotNumber: allocation.lotNumber,
        source: { type: "correction", entryId: allocation.entryId, date: allocation.entryDate },
      });
    }
  }

  for (const shipment of shipments) {
    if (shipment.quantity <= 0) continue;
    sequence += 1;
    pushEvent(shipment.article, shipment.silo, {
      kind: "consume",
      date: movementKey(shipment.shipmentDate),
      sequence,
      quantity: shipment.quantity,
      lotNumber: shipment.lotNumber ?? null,
      source: { type: "shipment", shipmentId: shipment.shipmentId, date: shipment.shipmentDate, shipmentType: shipment.shipmentType },
    });
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.events.sort((a: QueueEvent, b: QueueEvent) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      // Deux lots produits (pas des sorties) à la même date : voir compareLotOrder.
      if (a.kind === "produce" && b.kind === "produce") return compareLotOrder(a, b) || a.sequence - b.sequence;
      return a.sequence - b.sequence;
    });
  }
  return result;
}

export function computeLotLedger(allocations: LotAllocationInput[], shipments: LotShipmentInput[]): LotLedger {
  const lots: LotBalance[] = [];
  const unattributed: UnattributedConsumption[] = [];

  for (const { article, silo, events } of buildEventGroups(allocations, shipments)) {
    // File d'attente FIFO des lots encore actifs pour ce couple (article, silo).
    const queue: LotBalance[] = [];

    for (const event of events) {
      if (event.kind === "produce") {
        const lot: LotBalance = {
          entryId: event.entryId,
          article,
          silo,
          lotNumber: event.lotNumber,
          entryDate: event.entryDate,
          producedQuantity: event.quantity,
          consumedQuantity: 0,
          remainingQuantity: event.quantity,
          status: "active",
          manuallyDepleted: event.manuallyDepleted,
          consumptions: [],
        };
        lots.push(lot);
        queue.push(lot);
        continue;
      }

      let remainingToConsume = event.quantity;
      /** Prélève sur le lot queue[index] ; renvoie true si le lot, épuisé, a quitté la file. */
      const takeFrom = (index: number) => {
        const lot = queue[index];
        const taken = Math.min(lot.remainingQuantity, remainingToConsume);
        lot.remainingQuantity = roundTons(lot.remainingQuantity - taken);
        lot.consumedQuantity = roundTons(lot.consumedQuantity + taken);
        lot.consumptions.push({ quantity: taken, source: event.source });
        remainingToConsume -= taken;
        if (lot.remainingQuantity > 1e-9) return false;
        lot.remainingQuantity = 0;
        lot.status = "depleted";
        queue.splice(index, 1);
        return true;
      };

      // Une sortie qui désigne son lot (n° de lot de l'expédition ou de la
      // correction) le consomme en priorité : la traçabilité suit alors ce qui
      // a été enregistré, et seul un éventuel surplus repasse en FIFO.
      if (event.lotNumber) {
        let index = 0;
        while (remainingToConsume > 1e-9 && index < queue.length) {
          if (queue[index].lotNumber !== event.lotNumber || !takeFrom(index)) index += 1;
        }
      }
      while (remainingToConsume > 1e-9 && queue.length > 0) takeFrom(0);
      if (remainingToConsume > 1e-9) {
        unattributed.push({ article, silo, quantity: roundTons(remainingToConsume), source: event.source });
      }
    }
  }

  // Fermeture manuelle : appliquee apres coup, une fois le calcul FIFO
  // normal termine (les sorties reelles ont deja ete imputees normalement a
  // ce lot, en respectant l'ordre FIFO comme n'importe quel autre) — seuls
  // l'affichage "restant" et le statut sont forces.
  for (const lot of lots) {
    if (lot.manuallyDepleted) {
      lot.remainingQuantity = 0;
      lot.status = "depleted";
    }
  }

  return { lots, unattributed };
}

/**
 * Quantité à retirer du stock agrégé silo × article (voir computeSiloMatrix
 * dans siloStock.ts) pour chaque lot fermé manuellement : ce qu'il restait
 * sur le papier juste avant la fermeture (produit moins réellement sorti),
 * jamais négatif — un lot déjà épuisé naturellement avant d'être marqué ne
 * retire donc rien de plus. Sans ce retrait, l'État des silos afficherait
 * encore la quantité d'un lot pourtant fermé dans la traçabilité des lots.
 */
export function manualDepletionWriteOffs(lots: LotBalance[]): { article: string; silo: string; quantity: number }[] {
  return lots
    .filter((lot) => lot.manuallyDepleted)
    .map((lot) => ({ article: lot.article, silo: lot.silo, quantity: roundTons(lot.producedQuantity - lot.consumedQuantity) }))
    .filter((row) => row.quantity > 1e-9);
}

export type FifoAllocationChunk = { lotNumber: string | null; quantity: number };

/** Lots encore ouverts d'un article dans un silo, du plus ancien au plus récent : l'ordre FIFO du grand livre (sans date en dernier). */
export function openLotsInFifoOrder(lots: LotBalance[], article: string, silo: string): LotBalance[] {
  return lots
    .filter((lot) => lot.article === article && lot.silo === silo && lot.status === "active")
    .sort((a, b) => movementKey(a.entryDate).localeCompare(movementKey(b.entryDate)) || compareLotOrder(a, b));
}

/**
 * Plafond par n° de lot (voir computeLotFreeQuantities) : ce qu'un lot peut
 * céder sans contredire une sortie enregistrée plus tard qui le désigne. Un
 * n° de lot absent de la table n'est limité que par le contenu du lot.
 */
export type LotCaps = ReadonlyMap<string, number>;

/**
 * Lots ouverts dans l'ordre FIFO, chacun avec ce qu'il peut céder : son
 * contenu, dans la limite du plafond de son n° de lot. Une ligne prise sur un
 * lot sans n° est enregistrée sans lot, et le grand livre l'impute alors au
 * plus ancien lot encore entamé : un tel lot n'est donc utilisable qu'une fois
 * tous les lots plus anciens entièrement cédés (aucune part réservée restante).
 */
function cappedOpenLots(lots: LotBalance[], article: string, silo: string, caps: LotCaps) {
  const capLeft = new Map(caps);
  let olderLotKeepsStock = false;
  return openLotsInFifoOrder(lots, article, silo).map((lot) => {
    if (lot.lotNumber === null) {
      const available = olderLotKeepsStock ? 0 : lot.remainingQuantity;
      if (available < lot.remainingQuantity - 1e-9) olderLotKeepsStock = true;
      return { lot, available };
    }
    const cap = capLeft.get(lot.lotNumber);
    const available = Math.max(Math.min(lot.remainingQuantity, cap ?? Number.POSITIVE_INFINITY), 0);
    if (cap !== undefined) capLeft.set(lot.lotNumber, cap - available);
    if (available < lot.remainingQuantity - 1e-9) olderLotKeepsStock = true;
    return { lot, available };
  });
}

/**
 * Répartit une quantité à expédier sur les lots actifs les plus anciens
 * d'abord (FIFO) pour cet article et ce silo, un seul lot ne suffisant pas
 * toujours à couvrir toute l'expédition (ex. 18 T alors que le lot le plus
 * ancien n'en a que 5) : un tronçon par lot réellement entamé, dans l'ordre
 * FIFO — la même règle que la consommation dans computeLotLedger, appliquée
 * par avance pour savoir combien enregistrer sur chaque lot. `caps` réserve
 * à une expédition déjà enregistrée plus tard ce qu'elle prend à son lot
 * (cas d'une saisie antidatée). Un éventuel reliquat que les lots ne couvrent
 * pas (ne devrait pas arriver si la quantité a déjà été validée, voir
 * openLotQuantity) est renvoyé avec lotNumber: null plutôt que perdu.
 */
export function allocateFifoShipment(lots: LotBalance[], article: string, silo: string, quantity: number, caps: LotCaps = new Map()): FifoAllocationChunk[] {
  const chunks: FifoAllocationChunk[] = [];
  let remaining = quantity;
  for (const { lot, available } of cappedOpenLots(lots, article, silo, caps)) {
    if (remaining <= 1e-9) break;
    const taken = Math.min(available, remaining);
    if (taken <= 1e-9) continue;
    chunks.push({ lotNumber: lot.lotNumber, quantity: roundTons(taken) });
    remaining -= taken;
  }
  if (remaining > 1e-9) chunks.push({ lotNumber: null, quantity: roundTons(remaining) });
  return chunks;
}

/**
 * Grand livre tel qu'il se présentait pour une sortie datée `date` : seuls
 * les mouvements que computeLotLedger applique avant elle, même jour compris
 * (une sortie sans date se place en fin de chronologie, après tout le reste).
 */
export function computeLotLedgerAsOf(allocations: LotAllocationInput[], shipments: LotShipmentInput[], date: string | null): LotLedger {
  const key = movementKey(date);
  return computeLotLedger(
    allocations.filter((allocation) => movementKey(allocation.entryDate) <= key),
    shipments.filter((shipment) => movementKey(shipment.shipmentDate) <= key),
  );
}

/** Quantité couverte par les lots encore ouverts d'un article dans un silo, dans la limite de `caps` : ce qu'allocateFifoShipment peut réellement répartir. */
export function openLotQuantity(lots: LotBalance[], article: string, silo: string, caps: LotCaps = new Map()): number {
  return roundTons(cappedOpenLots(lots, article, silo, caps).reduce((total, { available }) => total + available, 0));
}

/**
 * Pour chaque n° de lot d'un article présent dans un silo à la date `date`,
 * ce qu'il peut encore céder à une sortie de ce jour-là sans contredire une
 * sortie déjà enregistrée plus tard qui le désigne : son contenu à cette date,
 * diminué de ce que ces sorties ultérieures lui prendront (le plus bas niveau
 * qu'il atteint ensuite). Sert de plafond (LotCaps) à une saisie antidatée.
 */
export function computeLotFreeQuantities(allocations: LotAllocationInput[], shipments: LotShipmentInput[], article: string, silo: string, date: string | null): Map<string, number> {
  const level = new Map<string, number>();
  for (const lot of computeLotLedgerAsOf(allocations, shipments, date).lots) {
    if (lot.article !== article || lot.silo !== silo || lot.lotNumber === null || lot.manuallyDepleted) continue;
    level.set(lot.lotNumber, (level.get(lot.lotNumber) ?? 0) + lot.remainingQuantity);
  }
  const lowest = new Map(level);
  const key = movementKey(date);
  const group = buildEventGroups(allocations, shipments).find((item) => item.article === article && item.silo === silo);
  for (const event of group?.events ?? []) {
    if (event.date <= key || event.lotNumber === null || !level.has(event.lotNumber)) continue;
    const current = level.get(event.lotNumber)!;
    if (event.kind === "produce") {
      if (!event.manuallyDepleted) level.set(event.lotNumber, current + event.quantity);
      continue;
    }
    level.set(event.lotNumber, current - event.quantity);
    lowest.set(event.lotNumber, Math.min(lowest.get(event.lotNumber)!, current - event.quantity));
  }
  return new Map(Array.from(lowest.entries()).map(([lotNumber, quantity]) => [lotNumber, Math.max(roundTons(quantity), 0)]));
}

export type ContradictedLotClaim = { lotNumber: string; silo: string; date: string | null };

/**
 * Simule l'ajout de nouvelles sorties (datées `date`) dans le grand livre et
 * renvoie la première sortie déjà enregistrée qui perdrait alors une partie
 * du lot qu'elle désigne (null s'il n'y en a aucune) : une saisie antidatée
 * ne doit jamais contredire un n° de lot déjà enregistré. Les nouvelles
 * sorties elles-mêmes sont vérifiées en amont (voir checkLotClaim et LotCaps).
 */
export function findContradictedLotClaim(
  allocations: LotAllocationInput[],
  shipments: LotShipmentInput[],
  additions: { article: string; silo: string; lotNumber: string | null; quantity: number }[],
  date: string | null,
): ContradictedLotClaim | null {
  const claims = new Map<string, ContradictedLotClaim>();
  shipments.forEach((shipment) => {
    if (shipment.lotNumber && shipment.quantity > 0) claims.set(`shipment:${shipment.shipmentId}:${shipment.silo}`, { lotNumber: shipment.lotNumber, silo: shipment.silo, date: shipment.shipmentDate });
  });
  allocations.forEach((allocation) => {
    if (allocation.lotNumber && allocation.quantity < 0) claims.set(`correction:${allocation.entryId}:${allocation.silo}`, { lotNumber: allocation.lotNumber, silo: allocation.silo, date: allocation.entryDate });
  });
  if (claims.size === 0) return null;

  /** Ce que chaque sortie enregistrée qui désigne un lot obtient réellement de ce lot. */
  const fulfilment = (ledger: LotLedger) => {
    const obtained = new Map<string, number>();
    for (const lot of ledger.lots) {
      for (const consumption of lot.consumptions) {
        const id = consumption.source.type === "shipment" ? consumption.source.shipmentId : consumption.source.entryId;
        const key = `${consumption.source.type}:${id}:${lot.silo}`;
        if (claims.get(key)?.lotNumber === lot.lotNumber) obtained.set(key, (obtained.get(key) ?? 0) + consumption.quantity);
      }
    }
    return obtained;
  };

  const before = fulfilment(computeLotLedger(allocations, shipments));
  // Ids négatifs : jamais confondus avec une vraie expédition. Ajoutées après
  // toutes les autres, comme une nouvelle ligne enregistrée (ordre de saisie).
  const hypothetical: LotShipmentInput[] = additions.map((addition, index) => ({
    shipmentId: -1 - index,
    shipmentDate: date,
    article: addition.article,
    silo: addition.silo,
    quantity: addition.quantity,
    shipmentType: "",
    lotNumber: addition.lotNumber,
  }));
  const after = fulfilment(computeLotLedger(allocations, [...shipments, ...hypothetical]));

  for (const [key, claim] of Array.from(claims.entries())) {
    if ((after.get(key) ?? 0) < (before.get(key) ?? 0) - 1e-6) return claim;
  }
  return null;
}

/**
 * Quantité qu'un silo peut encore fournir d'un article pour une sortie datée
 * `date`, sans qu'aucune sortie (celle-ci, ou une autre déjà enregistrée plus
 * tard) se retrouve sans lot à imputer : le plus bas niveau de stock atteint à
 * partir de cette date. Une expédition antidatée ne peut donc puiser ni dans
 * une production entrée après elle, ni dans ce qu'une expédition ultérieure a
 * déjà emporté. Un lot fermé manuellement ne compte que pour ce qui en est
 * réellement sorti (voir manualDepletionWriteOffs).
 */
export function computeShippableQuantity(allocations: LotAllocationInput[], shipments: LotShipmentInput[], article: string, silo: string, date: string | null): number {
  const group = buildEventGroups(allocations, shipments).find((item) => item.article === article && item.silo === silo);
  if (!group) return 0;

  const writeOffByEntry = new Map<number, number>();
  for (const lot of computeLotLedger(allocations, shipments).lots) {
    if (lot.article !== article || lot.silo !== silo || !lot.manuallyDepleted) continue;
    writeOffByEntry.set(lot.entryId, (writeOffByEntry.get(lot.entryId) ?? 0) + Math.max(lot.producedQuantity - lot.consumedQuantity, 0));
  }

  // Niveau cumulé production - sorties, sans plancher à zéro : son minimum
  // global mesure ce que le grand livre laisse déjà sans lot (unattributed),
  // et son minimum à partir de la date ce que la nouvelle sortie peut encore
  // prendre sans en laisser davantage.
  const key = movementKey(date);
  let level = 0;
  let lowest = 0;
  let lowestFromDate = Number.POSITIVE_INFINITY;
  let reachedDate = false;
  for (const event of group.events) {
    if (!reachedDate && event.date > key) {
      reachedDate = true;
      lowestFromDate = level;
    }
    if (event.kind === "produce") {
      const writeOff = Math.min(writeOffByEntry.get(event.entryId) ?? 0, event.quantity);
      if (writeOff > 0) writeOffByEntry.set(event.entryId, (writeOffByEntry.get(event.entryId) ?? 0) - writeOff);
      level += event.quantity - writeOff;
    } else {
      level -= event.quantity;
    }
    lowest = Math.min(lowest, level);
    if (reachedDate) lowestFromDate = Math.min(lowestFromDate, level);
  }
  if (!reachedDate) lowestFromDate = level;
  return Math.max(roundTons(lowestFromDate + Math.max(-lowest, 0)), 0);
}

export type LotClaimCheck =
  | { status: "ok" }
  | { status: "untracked" }
  | { status: "other-silo"; silos: string[] }
  | { status: "closed" }
  | { status: "not-yet-produced"; entryDate: string | null }
  /** `reservedLater` : le lot contenait davantage ce jour-là, mais des sorties enregistrées plus tard qui le désignent en ont besoin. */
  | { status: "insufficient"; available: number; reservedLater: boolean };

/**
 * Vérifie qu'un lot désigné sur une expédition pouvait bien fournir, dans ce
 * silo et à la date de l'expédition, la quantité qu'on lui impute — sans
 * priver une sortie enregistrée plus tard qui le désigne aussi (voir
 * computeLotFreeQuantities). Sans quoi la ligne enregistrée et la traçabilité
 * des lots se contrediraient. Un lot que l'application ne connaît pas du tout
 * pour cet article (« untracked ») ne peut pas être vérifié : le grand livre
 * impute alors la sortie en FIFO.
 */
export function checkLotClaim(
  allocations: LotAllocationInput[],
  shipments: LotShipmentInput[],
  claim: { article: string; silo: string; lotNumber: string; quantity: number; date: string | null },
): LotClaimCheck {
  const isClaimedLot = (lot: LotBalance) => lot.article === claim.article && lot.lotNumber === claim.lotNumber;
  const known = computeLotLedger(allocations, shipments).lots.filter(isClaimedLot);
  if (known.length === 0) return { status: "untracked" };
  const inSilo = known.filter((lot) => lot.silo === claim.silo);
  if (inSilo.length === 0) return { status: "other-silo", silos: Array.from(new Set(known.map((lot) => lot.silo))) };
  const open = inSilo.filter((lot) => !lot.manuallyDepleted);
  if (open.length === 0) return { status: "closed" };

  const asOf = computeLotLedgerAsOf(allocations, shipments, claim.date).lots
    .filter((lot) => isClaimedLot(lot) && lot.silo === claim.silo && !lot.manuallyDepleted);
  if (asOf.length === 0) {
    const firstEntryDate = open.map((lot) => lot.entryDate).sort((a, b) => movementKey(a).localeCompare(movementKey(b)))[0] ?? null;
    return { status: "not-yet-produced", entryDate: firstEntryDate };
  }
  const content = roundTons(asOf.reduce((total, lot) => total + lot.remainingQuantity, 0));
  const free = computeLotFreeQuantities(allocations, shipments, claim.article, claim.silo, claim.date).get(claim.lotNumber) ?? content;
  const available = Math.min(content, free);
  return claim.quantity > available + 0.005 ? { status: "insufficient", available, reservedLater: free < content - 0.005 } : { status: "ok" };
}

const LEDGER_SHEET_NAME = "Traçabilité des lots";
const LEDGER_FIRST_COL = 2; // colonne B : une marge à gauche, comme les classeurs existants de l'application.
const LEDGER_LAST_COL = LEDGER_FIRST_COL + 5; // Silo, Article, Date, N° Lot, Qté par lot, Qté silo.
const LEDGER_TITLE_ROW = 2;
const LEDGER_SUMMARY_ROW = 3;
const LEDGER_HEADER_ROW = 5;
const LEDGER_FIRST_DATA_ROW = 6;
const LEDGER_COLUMN_WIDTH = 25;
const LEDGER_ROW_HEIGHT = 30;

/** Couleur alignée sur la pastille « Actif » de la page à l'écran (voir silo.css `.silo-lot-status-active`). */
const ACTIVE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F2E4" } };
const ZEBRA_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FBF4" } };
const GRID_BORDER_SIDE: ExcelJS.Border = { style: "thin", color: { argb: "FFC4CEC0" } };
/** Quadrillage du tableau (en-tête, lignes de données et total) — pas la bannière titre/date au-dessus. */
const GRID_BORDER: Partial<ExcelJS.Borders> = { top: GRID_BORDER_SIDE, left: GRID_BORDER_SIDE, bottom: GRID_BORDER_SIDE, right: GRID_BORDER_SIDE };

const LEDGER_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const formatLedgerDate = (value: string | null) => (value ? LEDGER_DATE_FORMATTER.format(new Date(`${value}T00:00:00`)) : "—");

/**
 * Construit un classeur Excel de la traçabilité des lots : une ligne par lot
 * ENCORE ACTIF (silo, article, date d'entrée, n° lot, quantité restante DE CE
 * LOT) — les lots épuisés n'apportent rien à un inventaire courant et sont
 * exclus. Les silos regroupent leurs lots sous une cellule fusionnée (silo
 * par silo, dans l'ordre SPF1 → SPF12, pas un tri alphabétique qui placerait
 * SPF10 avant SPF2), avec la « Quantité silo » — la somme des quantités
 * restantes de tous ses lots (ex. 14,78 + 10 = 24,78) — indiquée une seule
 * fois pour tout le groupe ; à l'intérieur d'un silo, les lots consécutifs
 * d'un même article partagent aussi leur cellule Article. Un silo sans lot
 * actif reste visible avec une ligne « Vide », comme à l'écran. Un total en
 * pied de colonne clôt le tableau, et un second tableau plus loin sur la même
 * feuille reprend la quantité totale par article, tous silos confondus.
 * Reprend les couleurs déjà utilisées pour le classeur Silo_PF (voir
 * server/siloExcel.ts) afin de rester cohérent.
 */
export async function buildLotLedgerWorkbook(ledger: LotLedger, silos: readonly string[] = SILOS): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Almaraïi Production Pulse";
  workbook.created = new Date();
  workbook.modified = new Date();

  const activeLots = ledger.lots.filter((lot) => lot.status === "active");
  const groups: { silo: string; lots: LotBalance[] }[] = silos.map((silo) => ({
    silo,
    lots: activeLots
      .filter((lot) => lot.silo === silo)
      .sort((a, b) => (a.entryDate ?? "").localeCompare(b.entryDate ?? "") || compareLotOrder(a, b)),
  }));
  const totalRemaining = activeLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);

  const worksheet = workbook.addWorksheet(LEDGER_SHEET_NAME, { views: [{ state: "frozen", ySplit: LEDGER_HEADER_ROW }] });

  writeTitle(worksheet, LEDGER_TITLE_ROW, LEDGER_FIRST_COL, LEDGER_LAST_COL, "🌾  TRAÇABILITÉ DES LOTS — Almaraïi Production");

  const summaryRow = worksheet.getRow(LEDGER_SUMMARY_ROW);
  const summaryCell = summaryRow.getCell(LEDGER_FIRST_COL);
  summaryCell.value = `Le ${LEDGER_DATE_FORMATTER.format(new Date())}`;
  worksheet.mergeCells(LEDGER_SUMMARY_ROW, LEDGER_FIRST_COL, LEDGER_SUMMARY_ROW, LEDGER_LAST_COL);
  summaryCell.font = { italic: true, color: { argb: "00000000" } };
  summaryCell.alignment = { vertical: "middle", horizontal: "left" };
  summaryRow.height = 20;

  const headerRow = worksheet.getRow(LEDGER_HEADER_ROW);
  ["Silo", "Article", "Date Fabrication", "N° Lot", "Quantité par lot (T)", "Quantité silo (T)"].forEach((label, index) => {
    const cell = headerRow.getCell(LEDGER_FIRST_COL + index);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = TITLE_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = GRID_BORDER;
  });
  headerRow.height = LEDGER_ROW_HEIGHT;

  for (let col = LEDGER_FIRST_COL; col <= LEDGER_LAST_COL; col += 1) worksheet.getColumn(col).width = LEDGER_COLUMN_WIDTH;

  const ARTICLE_COL = LEDGER_FIRST_COL + 1;

  let currentRow = LEDGER_FIRST_DATA_ROW;
  groups.forEach((group, groupIndex) => {
    const startRow = currentRow;
    const shouldStripe = groupIndex % 2 === 1;

    if (group.lots.length === 0) {
      const row = worksheet.getRow(currentRow);
      const articleCell = row.getCell(ARTICLE_COL);
      articleCell.value = "Vide";
      articleCell.font = { italic: true, color: { argb: "FF86917F" } };
      articleCell.alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(LEDGER_FIRST_COL + 2).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(LEDGER_FIRST_COL + 3).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(LEDGER_FIRST_COL + 4).alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) articleCell.fill = ZEBRA_FILL;
      row.getCell(LEDGER_FIRST_COL + 2).value = "—";
      row.getCell(LEDGER_FIRST_COL + 3).value = "—";
      row.getCell(LEDGER_FIRST_COL + 4).value = "—";
      const emptyTotalCell = row.getCell(LEDGER_FIRST_COL + 5);
      emptyTotalCell.value = "—";
      emptyTotalCell.alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) emptyTotalCell.fill = ZEBRA_FILL;
      currentRow += 1;
    } else {
      group.lots.forEach((lot) => {
        const row = worksheet.getRow(currentRow);
        row.getCell(LEDGER_FIRST_COL + 2).alignment = { vertical: "middle", horizontal: "center" };
        row.getCell(LEDGER_FIRST_COL + 3).alignment = { vertical: "middle", horizontal: "center" };
        row.getCell(LEDGER_FIRST_COL + 4).alignment = { vertical: "middle", horizontal: "center" };
        // Article et Quantité silo (colonnes fusionnables) sont renseignées plus bas, une fois par groupe.
        row.getCell(LEDGER_FIRST_COL + 2).value = formatLedgerDate(lot.entryDate);
        row.getCell(LEDGER_FIRST_COL + 3).value = lot.lotNumber || "—";
        // « Quantité par lot » = ce qu'il reste DE CE LOT précisément (et non la quantité produite à l'origine).
        row.getCell(LEDGER_FIRST_COL + 4).value = lot.remainingQuantity;
        row.getCell(LEDGER_FIRST_COL + 4).numFmt = '0.00" T"';
        currentRow += 1;
      });
    }

    const endRow = currentRow - 1;
    for (let r = startRow; r <= endRow; r += 1) {
      const row = worksheet.getRow(r);
      row.height = LEDGER_ROW_HEIGHT;
      for (let col = LEDGER_FIRST_COL; col <= LEDGER_LAST_COL; col += 1) row.getCell(col).border = GRID_BORDER;
      if (shouldStripe) {
        for (let col = LEDGER_FIRST_COL + 2; col < LEDGER_LAST_COL; col += 1) row.getCell(col).fill = ZEBRA_FILL;
      }
    }

    // Une cellule fusionnée ne peut être stylée (ou revalorisée) que via sa
    // cellule maîtresse (coin haut-gauche) : on fusionne d'abord, puis on la
    // stylise. Ordre appliqué au silo (tout le groupe), à l'article
    // (uniquement les lots consécutifs qui le partagent) et à la quantité
    // silo (somme des lots restants, une fois pour tout le groupe).
    if (endRow > startRow) worksheet.mergeCells(startRow, LEDGER_FIRST_COL, endRow, LEDGER_FIRST_COL);
    const siloCell = worksheet.getCell(startRow, LEDGER_FIRST_COL);
    siloCell.value = group.silo;
    siloCell.font = { bold: true };
    siloCell.alignment = { vertical: "middle", horizontal: "center" };
    if (shouldStripe) siloCell.fill = ZEBRA_FILL;

    let runStart = startRow;
    group.lots.forEach((lot, lotIndex) => {
      const isLastOfGroup = lotIndex === group.lots.length - 1;
      const sharesNextArticle = !isLastOfGroup && group.lots[lotIndex + 1].article === lot.article;
      if (sharesNextArticle) return;
      const runEnd = startRow + lotIndex;
      if (runEnd > runStart) worksheet.mergeCells(runStart, ARTICLE_COL, runEnd, ARTICLE_COL);
      const articleCell = worksheet.getCell(runStart, ARTICLE_COL);
      articleCell.value = lot.article;
      articleCell.alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) articleCell.fill = ZEBRA_FILL;
      runStart = runEnd + 1;
    });

    if (group.lots.length > 0) {
      // « Quantité silo » = la somme de ce qu'il reste sur TOUS les lots de ce silo (exemple demandé : 14,78 + 10 = 24,78).
      const siloRemaining = group.lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
      if (endRow > startRow) worksheet.mergeCells(startRow, LEDGER_FIRST_COL + 5, endRow, LEDGER_FIRST_COL + 5);
      const siloTotalCell = worksheet.getCell(startRow, LEDGER_FIRST_COL + 5);
      siloTotalCell.value = siloRemaining;
      siloTotalCell.numFmt = '0.00" T"';
      siloTotalCell.font = { bold: true };
      siloTotalCell.alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) siloTotalCell.fill = ZEBRA_FILL;
    }
  });

  if (currentRow > LEDGER_FIRST_DATA_ROW) {
    worksheet.autoFilter = {
      from: { row: LEDGER_HEADER_ROW, column: LEDGER_FIRST_COL },
      to: { row: currentRow - 1, column: LEDGER_LAST_COL },
    };
  }

  const totalRowNumber = currentRow;
  const totalRow = worksheet.getRow(totalRowNumber);
  totalRow.getCell(LEDGER_FIRST_COL).value = "Total";
  totalRow.getCell(LEDGER_FIRST_COL).font = { bold: true };
  worksheet.mergeCells(totalRowNumber, LEDGER_FIRST_COL, totalRowNumber, LEDGER_FIRST_COL + 3);
  const totalCell = totalRow.getCell(LEDGER_FIRST_COL + 5);
  if (totalRowNumber > LEDGER_FIRST_DATA_ROW) {
    const remainingColLetter = columnLetter(LEDGER_FIRST_COL + 5);
    const formula = `SUM(${remainingColLetter}${LEDGER_FIRST_DATA_ROW}:${remainingColLetter}${totalRowNumber - 1})`;
    totalCell.value = { formula, result: totalRemaining } as ExcelJS.CellFormulaValue;
  } else {
    totalCell.value = 0;
  }
  totalCell.numFmt = '0.00" T"';
  totalCell.font = { bold: true };
  totalRow.height = LEDGER_ROW_HEIGHT;
  for (let col = LEDGER_FIRST_COL; col <= LEDGER_LAST_COL; col += 1) totalRow.getCell(col).border = GRID_BORDER;

  // --- Tableau annexe : quantité totale par article, tous silos confondus.
  // Reprend la même source que le tableau principal (la somme des lots encore
  // actifs), donc son propre total rejoint toujours celui de la colonne
  // « Quantité silo » à sa gauche — une vérification croisée gratuite.
  const ARTICLE_TABLE_FIRST_COL = LEDGER_LAST_COL + 2; // une colonne d'écart avant ce second tableau.
  const ARTICLE_TABLE_QTY_COL = ARTICLE_TABLE_FIRST_COL + 1;

  const articleTotals = new Map<string, number>();
  activeLots.forEach((lot) => {
    articleTotals.set(lot.article, roundTons((articleTotals.get(lot.article) ?? 0) + lot.remainingQuantity));
  });
  const articleRows = Array.from(articleTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  worksheet.getColumn(ARTICLE_TABLE_FIRST_COL).width = LEDGER_COLUMN_WIDTH;
  worksheet.getColumn(ARTICLE_TABLE_QTY_COL).width = LEDGER_COLUMN_WIDTH;

  writeTitle(worksheet, LEDGER_TITLE_ROW, ARTICLE_TABLE_FIRST_COL, ARTICLE_TABLE_QTY_COL, "QUANTITÉ PAR ARTICLE");

  const articleHeaderRow = worksheet.getRow(LEDGER_HEADER_ROW);
  ["Article", "Quantité (T)"].forEach((label, index) => {
    const cell = articleHeaderRow.getCell(ARTICLE_TABLE_FIRST_COL + index);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = TITLE_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = GRID_BORDER;
  });

  articleRows.forEach(([article, quantity], index) => {
    const row = worksheet.getRow(LEDGER_FIRST_DATA_ROW + index);
    row.height = LEDGER_ROW_HEIGHT;
    const articleCell = row.getCell(ARTICLE_TABLE_FIRST_COL);
    const quantityCell = row.getCell(ARTICLE_TABLE_QTY_COL);
    articleCell.value = article;
    articleCell.font = { bold: true };
    articleCell.alignment = { vertical: "middle", horizontal: "center" };
    quantityCell.value = quantity;
    quantityCell.numFmt = '0.00" T"';
    quantityCell.alignment = { vertical: "middle", horizontal: "center" };
    if (index % 2 === 1) {
      articleCell.fill = ZEBRA_FILL;
      quantityCell.fill = ZEBRA_FILL;
    }
    articleCell.border = GRID_BORDER;
    quantityCell.border = GRID_BORDER;
  });

  const articleTotalRowNumber = LEDGER_FIRST_DATA_ROW + articleRows.length;
  const articleTotalRow = worksheet.getRow(articleTotalRowNumber);
  articleTotalRow.height = LEDGER_ROW_HEIGHT;
  const articleTotalLabelCell = articleTotalRow.getCell(ARTICLE_TABLE_FIRST_COL);
  articleTotalLabelCell.value = "Total";
  articleTotalLabelCell.font = { bold: true };
  articleTotalLabelCell.alignment = { vertical: "middle", horizontal: "center" };
  articleTotalLabelCell.border = GRID_BORDER;
  const articleTotalQtyCell = articleTotalRow.getCell(ARTICLE_TABLE_QTY_COL);
  if (articleRows.length > 0) {
    const qtyColLetter = columnLetter(ARTICLE_TABLE_QTY_COL);
    const formula = `SUM(${qtyColLetter}${LEDGER_FIRST_DATA_ROW}:${qtyColLetter}${articleTotalRowNumber - 1})`;
    articleTotalQtyCell.value = { formula, result: totalRemaining } as ExcelJS.CellFormulaValue;
  } else {
    articleTotalQtyCell.value = 0;
  }
  articleTotalQtyCell.numFmt = '0.00" T"';
  articleTotalQtyCell.font = { bold: true };
  articleTotalQtyCell.alignment = { vertical: "middle", horizontal: "center" };
  articleTotalQtyCell.border = GRID_BORDER;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// --- Estimation de l'état des silos (import du classeur « Traçabilité des lots ») ---
//
// Le classeur exporté par buildLotLedgerWorkbook peut être modifié à la main
// (quantités estimées, lots ajoutés ou retirés) puis réimporté sur la page
// État des silos : il n'est JAMAIS enregistré comme stock réel, seulement
// affiché en transparence à côté du stock calculé, pour comparaison.

export type SiloEstimateLot = { article: string; lotNumber: string | null; date: string | null; quantity: number };
export type SiloEstimate = { silo: string; quantity: number; articles: { article: string; quantity: number }[]; lots: SiloEstimateLot[] };
/** sheet : nom de la feuille lue (la dernière qui contient le tableau). */
export type ParsedSiloEstimate = { label: string | null; sheet: string | null; silos: SiloEstimate[]; errors: string[] };

function normalizeEstimateHeader(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Valeur affichée d'une cellule (résultat enregistré pour une formule, maîtresse pour une cellule fusionnée). */
function estimateCellValue(cell: ExcelJS.Cell): ExcelJS.CellValue {
  const value = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date) && ("formula" in value || "sharedFormula" in value)) {
    return (value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue;
  }
  return value;
}

function estimateCellText(cell: ExcelJS.Cell): string {
  const value = estimateCellValue(cell);
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10).split("-").reverse().join("/");
  if (typeof value === "object" && "richText" in value) return (value as ExcelJS.CellRichTextValue).richText.map((part) => part.text).join("").trim();
  return "";
}

/** Tonnage d'une cellule : nombre, ou texte « 12,5 T » / « 12.5 » ; undefined pour « — » ou vide. */
function estimateCellTons(cell: ExcelJS.Cell): number | undefined {
  const value = estimateCellValue(cell);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = estimateCellText(cell).replace(/\s/g, "").replace(/T$/i, "").replace(",", ".");
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return undefined;
  return Number(text);
}

type EstimateColumns = { silo: number; article: number; date?: number; lot?: number; lotQuantity?: number; siloQuantity?: number };

/** Ligne d'en-tête : Silo + Article + une colonne de quantité. Première occurrence (la plus à gauche) : le tableau annexe « Quantité par article » est ignoré. */
function findEstimateHeader(worksheet: ExcelJS.Worksheet): { row: number; columns: EstimateColumns } | undefined {
  for (let r = 1; r <= Math.min(30, worksheet.rowCount); r += 1) {
    const found: Partial<EstimateColumns> = {};
    const row = worksheet.getRow(r);
    for (let c = 1; c <= Math.max(worksheet.columnCount, 8); c += 1) {
      const header = normalizeEstimateHeader(estimateCellText(row.getCell(c)));
      if (!header) continue;
      const key: keyof EstimateColumns | undefined = header === "SILO" ? "silo"
        : header === "ARTICLE" ? "article"
        : header.startsWith("DATE") ? "date"
        : header === "NLOT" || header === "LOT" || header.startsWith("NUMEROLOT") ? "lot"
        : header.startsWith("QUANTITEPARLOT") ? "lotQuantity"
        : header.startsWith("QUANTITESILO") ? "siloQuantity"
        : undefined;
      if (key && found[key] === undefined) found[key] = c;
    }
    if (found.silo !== undefined && found.article !== undefined && (found.lotQuantity !== undefined || found.siloQuantity !== undefined)) {
      return { row: r, columns: found as EstimateColumns };
    }
  }
  return undefined;
}

/**
 * Lit un classeur « Traçabilité des lots » (export des Rapports, éventuellement
 * retouché à la main) et en déduit l'état estimé de chaque silo présent : la
 * somme de ses lots (« Quantité par lot »), ou à défaut sa « Quantité silo ».
 * Un silo marqué « Vide » est estimé vide. Les silos absents du fichier ne
 * reçoivent pas d'estimation. Rien n'est écrit : voir la note en tête de section.
 */
export async function parseLotLedgerEstimate(buffer: Buffer, silos: readonly string[] = SILOS): Promise<ParsedSiloEstimate> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const errors: string[] = [];
  const knownSilos = new Set(silos.map((silo) => silo.toUpperCase()));
  const groups = new Map<string, { lots: SiloEstimateLot[]; siloQuantity?: number }>();
  let label: string | null = null;
  // Un classeur peut garder une feuille par jour (« 24 », « 26 », « 27 », « 28 ») : seule la
  // DERNIÈRE feuille visible (l'onglet le plus à droite) qui contient le tableau fait foi.
  const lastSheet = [...workbook.worksheets].reverse()
    .filter((worksheet) => worksheet.state !== "hidden" && worksheet.state !== "veryHidden")
    .map((worksheet) => ({ worksheet, header: findEstimateHeader(worksheet) }))
    .find((candidate) => candidate.header !== undefined);
  const foundTable = lastSheet !== undefined;

  for (const { worksheet, header } of lastSheet ? [lastSheet as { worksheet: ExcelJS.Worksheet; header: NonNullable<ReturnType<typeof findEstimateHeader>> }] : []) {
    const { columns } = header;
    for (let r = 1; r < header.row && !label; r += 1) {
      const row = worksheet.getRow(r);
      for (let c = 1; c <= Math.max(worksheet.columnCount, 8) && !label; c += 1) {
        const text = estimateCellText(row.getCell(c));
        if (/^le\s+\d/i.test(text)) label = text;
      }
    }

    for (let r = header.row + 1; r <= worksheet.rowCount; r += 1) {
      const row = worksheet.getRow(r);
      const siloText = estimateCellText(row.getCell(columns.silo)).toUpperCase().replace(/\s+/g, "");
      if (siloText === "TOTAL") break;
      if (!siloText) continue;
      if (!knownSilos.has(siloText)) {
        errors.push(`Feuille « ${worksheet.name} », ligne ${r} : silo « ${siloText} » inconnu, ligne ignorée.`);
        continue;
      }
      const group = groups.get(siloText) ?? { lots: [] };
      groups.set(siloText, group);
      const siloQuantity = columns.siloQuantity ? estimateCellTons(row.getCell(columns.siloQuantity)) : undefined;
      if (group.siloQuantity === undefined && siloQuantity !== undefined) group.siloQuantity = siloQuantity;

      const article = estimateCellText(row.getCell(columns.article)).toUpperCase();
      if (!article || article === "VIDE") continue;
      const quantity = columns.lotQuantity ? estimateCellTons(row.getCell(columns.lotQuantity)) : undefined;
      const lotText = columns.lot ? estimateCellText(row.getCell(columns.lot)) : "";
      const dateText = columns.date ? estimateCellText(row.getCell(columns.date)) : "";
      group.lots.push({
        article,
        lotNumber: lotText && lotText !== "—" ? lotText : null,
        date: dateText && dateText !== "—" ? dateText : null,
        quantity: quantity ?? Number.NaN,
      });
    }
  }

  if (!foundTable) {
    return { label: null, sheet: null, silos: [], errors: ["Tableau introuvable : le fichier doit avoir les colonnes « Silo », « Article » et « Quantité par lot (T) » ou « Quantité silo (T) », comme l’export « Traçabilité des lots / Silo » des Rapports."] };
  }

  const estimates = silos.map((silo) => silo.toUpperCase()).filter((silo) => groups.has(silo)).map((silo): SiloEstimate => {
    const group = groups.get(silo)!;
    const lotsWithQuantity = group.lots.filter((lot) => Number.isFinite(lot.quantity));
    const lotSum = roundTons(lotsWithQuantity.reduce((sum, lot) => sum + lot.quantity, 0));
    let quantity: number;
    if (lotsWithQuantity.length > 0) {
      quantity = lotSum;
      if (group.siloQuantity !== undefined && Math.abs(group.siloQuantity - lotSum) > 0.01) {
        errors.push(`${silo} : la quantité silo (${group.siloQuantity} T) ne correspond pas à la somme des lots (${lotSum} T) ; la somme des lots est retenue.`);
      }
    } else {
      quantity = roundTons(group.siloQuantity ?? 0);
    }
    const articleTotals = new Map<string, number>();
    if (lotsWithQuantity.length > 0) {
      lotsWithQuantity.forEach((lot) => articleTotals.set(lot.article, roundTons((articleTotals.get(lot.article) ?? 0) + lot.quantity)));
    } else if (group.lots.length > 0 && quantity > 0) {
      articleTotals.set(group.lots[0].article, quantity);
    }
    return {
      silo,
      quantity,
      articles: Array.from(articleTotals.entries()).map(([article, total]) => ({ article, quantity: total })),
      lots: group.lots.map((lot) => ({ ...lot, quantity: Number.isFinite(lot.quantity) ? roundTons(lot.quantity) : 0 })),
    };
  });

  return { label, sheet: lastSheet?.worksheet.name ?? null, silos: estimates, errors };
}
