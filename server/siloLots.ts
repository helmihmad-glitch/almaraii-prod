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
};

export type LotShipmentInput = {
  shipmentId: number;
  shipmentDate: string | null;
  article: string;
  silo: string;
  quantity: number;
  shipmentType: string;
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
  consumptions: LotConsumption[];
};

/** Consommation qu'aucun lot n'a pu couvrir (retraits excedant la production connue). */
export type UnattributedConsumption = { article: string; silo: string; quantity: number; source: LotConsumptionSource };

export type LotLedger = { lots: LotBalance[]; unattributed: UnattributedConsumption[] };

type QueueEvent =
  | { kind: "produce"; date: string; sequence: number; entryId: number; lotNumber: string | null; entryDate: string | null; quantity: number }
  | { kind: "consume"; date: string; sequence: number; quantity: number; source: LotConsumptionSource };

/** Les mouvements sans date sont rares (saisie manuelle incomplete) ; on les place apres les mouvements dates plutot que de les laisser perturber l'ordre chronologique connu. */
const UNDATED_SORT_KEY = "9999-99-99";

function roundTons(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

export function computeLotLedger(allocations: LotAllocationInput[], shipments: LotShipmentInput[]): LotLedger {
  const groups = new Map<string, { article: string; silo: string; events: QueueEvent[] }>();
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
    const date = allocation.entryDate ?? UNDATED_SORT_KEY;
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
      });
    } else {
      pushEvent(allocation.article, allocation.silo, {
        kind: "consume",
        date,
        sequence,
        quantity: -allocation.quantity,
        source: { type: "correction", entryId: allocation.entryId, date: allocation.entryDate },
      });
    }
  }

  for (const shipment of shipments) {
    if (shipment.quantity <= 0) continue;
    sequence += 1;
    pushEvent(shipment.article, shipment.silo, {
      kind: "consume",
      date: shipment.shipmentDate ?? UNDATED_SORT_KEY,
      sequence,
      quantity: shipment.quantity,
      source: { type: "shipment", shipmentId: shipment.shipmentId, date: shipment.shipmentDate, shipmentType: shipment.shipmentType },
    });
  }

  const lots: LotBalance[] = [];
  const unattributed: UnattributedConsumption[] = [];

  for (const group of Array.from(groups.values())) {
    const { article, silo, events } = group;
    events.sort((a: QueueEvent, b: QueueEvent) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sequence - b.sequence));

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
          consumptions: [],
        };
        lots.push(lot);
        queue.push(lot);
        continue;
      }

      let remainingToConsume = event.quantity;
      while (remainingToConsume > 1e-9 && queue.length > 0) {
        const oldest = queue[0];
        const taken = Math.min(oldest.remainingQuantity, remainingToConsume);
        oldest.remainingQuantity = roundTons(oldest.remainingQuantity - taken);
        oldest.consumedQuantity = roundTons(oldest.consumedQuantity + taken);
        oldest.consumptions.push({ quantity: taken, source: event.source });
        remainingToConsume -= taken;
        if (oldest.remainingQuantity <= 1e-9) {
          oldest.remainingQuantity = 0;
          oldest.status = "depleted";
          queue.shift();
        }
      }
      if (remainingToConsume > 1e-9) {
        unattributed.push({ article, silo, quantity: roundTons(remainingToConsume), source: event.source });
      }
    }
  }

  return { lots, unattributed };
}
