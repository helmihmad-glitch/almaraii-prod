import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

// Expédition sans N° Lot précisé : la quantité est répartie sur les lots
// actifs les plus anciens d'abord (voir allocateFifoShipment dans
// siloLots.ts), une ligne d'expédition par lot réellement entamé — au lieu
// d'une seule ligne portant un lot arbitraire pour toute la quantité.
function adminContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: true } as any;
}

describe("silo.createShipment (répartition FIFO sur plusieurs lots)", () => {
  it("répartit 18 T sur trois lots (5 + 10 + 10 T) en trois lignes d'expédition, comme demandé", async () => {
    const caller = appRouter.createCaller(adminContext());
    await caller.silo.createEntry({ article: "FIFO-SPLIT-A", entryDate: "2026-09-17", lotNumber: "2600675-0917", allocations: [{ silo: "SPF3", quantity: 5 }] });
    await caller.silo.createEntry({ article: "FIFO-SPLIT-A", entryDate: "2026-09-17", lotNumber: "2600676-0917", allocations: [{ silo: "SPF3", quantity: 10 }] });
    await caller.silo.createEntry({ article: "FIFO-SPLIT-A", entryDate: "2026-09-17", lotNumber: "2600677-0917", allocations: [{ silo: "SPF3", quantity: 10 }] });

    const result = await caller.silo.createShipment({ shipmentDate: "2026-09-18", article: "FIFO-SPLIT-A", silo: "SPF3", quantity: 18, shipmentType: "Vrac" });

    expect(result.shipments).toHaveLength(3);
    expect(result.shipments.map((shipment) => [shipment.lotNumber, Number(shipment.quantity)])).toEqual([
      ["2600675-0917", 5],
      ["2600676-0917", 10],
      ["2600677-0917", 3],
    ]);

    // Les trois lignes partagent le même splitGroupId (celui de la première) :
    // c'est ce qui permet à l'interface et au classeur Silo_PF de les afficher
    // comme une seule expédition, sans jamais regrouper par coïncidence une
    // autre expédition saisie séparément avec les mêmes date/article/silo/type.
    const groupId = result.shipments[0].id;
    expect(result.shipments.map((shipment) => shipment.splitGroupId)).toEqual([groupId, groupId, groupId]);

    const ledger = await caller.silo.lotLedger();
    const lotsForArticle = ledger.lots.filter((lot) => lot.article === "FIFO-SPLIT-A" && lot.silo === "SPF3");
    expect(lotsForArticle.find((lot) => lot.lotNumber === "2600675-0917")!.status).toBe("depleted");
    expect(lotsForArticle.find((lot) => lot.lotNumber === "2600676-0917")!.status).toBe("depleted");
    const third = lotsForArticle.find((lot) => lot.lotNumber === "2600677-0917")!;
    expect(third.status).toBe("active");
    expect(third.remainingQuantity).toBe(7);

    // Le classeur Silo_PF liste les lignes d'expédition telles quelles : les trois lots touchés y apparaissent donc séparément, sans traitement particulier.
    const allShipments = await caller.silo.listShipments();
    const created = allShipments.filter((shipment) => shipment.article === "FIFO-SPLIT-A");
    expect(created.map((shipment) => shipment.lotNumber).sort()).toEqual(["2600675-0917", "2600676-0917", "2600677-0917"]);
  });

  it("garde une seule ligne quand un N° Lot est précisé explicitement", async () => {
    const caller = appRouter.createCaller(adminContext());
    await caller.silo.createEntry({ article: "FIFO-SPLIT-B", entryDate: "2026-09-17", lotNumber: "L1", allocations: [{ silo: "SPF4", quantity: 5 }] });
    await caller.silo.createEntry({ article: "FIFO-SPLIT-B", entryDate: "2026-09-17", lotNumber: "L2", allocations: [{ silo: "SPF4", quantity: 10 }] });

    const result = await caller.silo.createShipment({ shipmentDate: "2026-09-18", article: "FIFO-SPLIT-B", silo: "SPF4", lotNumber: "L2", quantity: 8, shipmentType: "Sac" });

    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0].lotNumber).toBe("L2");
    expect(Number(result.shipments[0].quantity)).toBe(8);
    expect(result.shipments[0].splitGroupId).toBeNull();
  });

  it("tient dans un seul lot quand il suffit : une seule ligne malgré l'absence de N° Lot précisé", async () => {
    const caller = appRouter.createCaller(adminContext());
    await caller.silo.createEntry({ article: "FIFO-SPLIT-C", entryDate: "2026-09-17", lotNumber: "UNIQUE", allocations: [{ silo: "SPF5", quantity: 20 }] });

    const result = await caller.silo.createShipment({ shipmentDate: "2026-09-18", article: "FIFO-SPLIT-C", silo: "SPF5", quantity: 12, shipmentType: "Vrac" });

    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0].lotNumber).toBe("UNIQUE");
    expect(result.shipments[0].splitGroupId).toBeNull();
  });

  // Bug signalé : trois expéditions saisies séparément (une par appel) ne
  // doivent jamais se retrouver reliées comme si elles formaient une seule
  // expédition répartie sur plusieurs lots, même si elles partagent tout par
  // ailleurs (même date, même article, même silo, même type, même lot).
  it("ne relie jamais des expéditions saisies séparément, même si elles partagent tout par ailleurs", async () => {
    const caller = appRouter.createCaller(adminContext());
    await caller.silo.createEntry({ article: "FIFO-SPLIT-D", entryDate: "2026-09-17", lotNumber: "2600680-0918", allocations: [{ silo: "SPF2", quantity: 50 }] });

    const first = await caller.silo.createShipment({ shipmentDate: "2026-09-18", article: "FIFO-SPLIT-D", silo: "SPF2", lotNumber: "2600680-0918", quantity: 17.24, shipmentType: "Vrac" });
    const second = await caller.silo.createShipment({ shipmentDate: "2026-09-18", article: "FIFO-SPLIT-D", silo: "SPF2", lotNumber: "2600680-0918", quantity: 13.46, shipmentType: "Vrac" });
    const third = await caller.silo.createShipment({ shipmentDate: "2026-09-18", article: "FIFO-SPLIT-D", silo: "SPF2", lotNumber: "2600680-0918", quantity: 8.02, shipmentType: "Vrac" });

    expect(first.shipments[0].splitGroupId).toBeNull();
    expect(second.shipments[0].splitGroupId).toBeNull();
    expect(third.shipments[0].splitGroupId).toBeNull();
  });
});
