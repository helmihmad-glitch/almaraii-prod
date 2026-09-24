import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

// Une même expédition (un seul « vrac ») répartie manuellement sur plusieurs
// silos, chacun avec son propre n° de lot déjà connu — le cas signalé :
// 20 T de CG3, 10 T depuis SPF3 (lot A) et 10 T depuis SPF5 (lot B), dans la
// même expédition. Voir silo.createSplitShipment / siloShipmentSplitInput
// dans routers.ts : à la différence de createShipment (FIFO automatique,
// mais un seul silo à la fois), ici c'est l'utilisateur qui connaît déjà le
// lot de chaque ligne.
function adminContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: true } as any;
}
function visitorContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: false } as any;
}

describe("silo.createSplitShipment (une expédition répartie manuellement sur plusieurs silos)", () => {
  it("répartit 20 T de CG3 sur SPF3 (10 T, lot A) et SPF5 (10 T, lot B), reliées par le même splitGroupId", async () => {
    const admin = appRouter.createCaller(adminContext());
    await admin.silo.createEntry({ article: "MULTI-SPLIT-A", entryDate: "2026-09-17", lotNumber: "20006649-0905", allocations: [{ silo: "SPF3", quantity: 10 }] });
    await admin.silo.createEntry({ article: "MULTI-SPLIT-A", entryDate: "2026-09-17", lotNumber: "26006648-09004", allocations: [{ silo: "SPF5", quantity: 10 }] });

    const result = await admin.silo.createSplitShipment({
      shipmentDate: "2026-09-18",
      article: "MULTI-SPLIT-A",
      shipmentType: "Vrac",
      allocations: [
        { silo: "SPF3", lotNumber: "20006649-0905", quantity: 10 },
        { silo: "SPF5", lotNumber: "26006648-09004", quantity: 10 },
      ],
    });

    expect(result.shipments).toHaveLength(2);
    expect(result.shipments.map((shipment) => [shipment.silo, shipment.lotNumber, Number(shipment.quantity)])).toEqual([
      ["SPF3", "20006649-0905", 10],
      ["SPF5", "26006648-09004", 10],
    ]);
    const groupId = result.shipments[0].id;
    expect(result.shipments.map((shipment) => shipment.splitGroupId)).toEqual([groupId, groupId]);

    // La traçabilité des lots reflète bien la sortie sur chacun des deux lots, pas seulement le premier.
    const ledger = await admin.silo.lotLedger();
    const lotA = ledger.lots.find((lot) => lot.article === "MULTI-SPLIT-A" && lot.silo === "SPF3")!;
    const lotB = ledger.lots.find((lot) => lot.article === "MULTI-SPLIT-A" && lot.silo === "SPF5")!;
    expect(lotA.status).toBe("depleted");
    expect(lotB.status).toBe("depleted");
  });

  it("refuse un visiteur et accepte un admin", async () => {
    const admin = appRouter.createCaller(adminContext());
    await admin.silo.createEntry({ article: "MULTI-SPLIT-B", entryDate: "2026-09-17", lotNumber: "L1", allocations: [{ silo: "SPF4", quantity: 10 }] });
    await admin.silo.createEntry({ article: "MULTI-SPLIT-B", entryDate: "2026-09-17", lotNumber: "L2", allocations: [{ silo: "SPF6", quantity: 10 }] });
    const payload = {
      shipmentDate: "2026-09-18",
      article: "MULTI-SPLIT-B",
      shipmentType: "Vrac" as const,
      allocations: [{ silo: "SPF4", lotNumber: "L1", quantity: 5 }, { silo: "SPF6", lotNumber: "L2", quantity: 5 }],
    };
    await expect(appRouter.createCaller(visitorContext()).silo.createSplitShipment(payload)).rejects.toThrow(/administrateur/i);
    await expect(admin.silo.createSplitShipment(payload)).resolves.toMatchObject({ shipments: expect.any(Array) });
  });

  it("bloque une répartition qui dépasse le stock disponible dans l'un des silos", async () => {
    const admin = appRouter.createCaller(adminContext());
    await admin.silo.createEntry({ article: "MULTI-SPLIT-C", entryDate: "2026-09-17", lotNumber: "L1", allocations: [{ silo: "SPF7", quantity: 5 }] });
    await admin.silo.createEntry({ article: "MULTI-SPLIT-C", entryDate: "2026-09-17", lotNumber: "L2", allocations: [{ silo: "SPF8", quantity: 10 }] });

    await expect(admin.silo.createSplitShipment({
      shipmentDate: "2026-09-18",
      article: "MULTI-SPLIT-C",
      shipmentType: "Vrac",
      allocations: [
        { silo: "SPF7", lotNumber: "L1", quantity: 8 }, // ne reste que 5 T dans SPF7
        { silo: "SPF8", lotNumber: "L2", quantity: 5 },
      ],
    })).rejects.toThrow(/stock disponible/i);
  });

  it("exige au moins deux répartitions (sinon la saisie simple à un seul silo suffit)", async () => {
    const admin = appRouter.createCaller(adminContext());
    await expect(admin.silo.createSplitShipment({
      shipmentDate: "2026-09-18",
      article: "MULTI-SPLIT-D",
      shipmentType: "Vrac",
      allocations: [{ silo: "SPF9", lotNumber: "L1", quantity: 5 }],
    })).rejects.toThrow();
  });

  it("exige un n° de lot pour chaque ligne", async () => {
    const admin = appRouter.createCaller(adminContext());
    await expect(admin.silo.createSplitShipment({
      shipmentDate: "2026-09-18",
      article: "MULTI-SPLIT-E",
      shipmentType: "Vrac",
      allocations: [{ silo: "SPF10", lotNumber: "", quantity: 5 }, { silo: "SPF11", lotNumber: "L2", quantity: 5 }],
    })).rejects.toThrow();
  });
});
