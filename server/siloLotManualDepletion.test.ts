import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

// Fermeture manuelle d'un lot (bouton "Marquer épuisé" de la traçabilité des
// lots) : voir la note sur LotBalance.manuallyDepleted dans server/siloLots.ts
// et setLotManualDepletion dans server/siloDb.ts. Ces tests passent par le
// routeur tRPC (comme adminGating.test.ts) plutôt que par siloDb directement,
// pour vérifier le comportement tel qu'exposé à l'interface.
function adminContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: true } as any;
}

describe("fermeture manuelle d'un lot (silo.setLotDepletion)", () => {
  it("force le statut à épuisé même si la quantité produite n'est pas entièrement sortie, puis rouvre le lot en levant le drapeau", async () => {
    const caller = appRouter.createCaller(adminContext());
    const entry = await caller.silo.createEntry({ article: "DEPL-TEST-A", allocations: [{ silo: "SPF6", quantity: 20 }] });

    const closed = await caller.silo.setLotDepletion({ entryId: entry.id, silo: "SPF6", manuallyDepleted: true });
    expect(closed.manuallyDepleted).toBe(true);

    const ledgerClosed = await caller.silo.lotLedger();
    const lotClosed = ledgerClosed.lots.find((lot) => lot.entryId === entry.id && lot.silo === "SPF6")!;
    expect(lotClosed.status).toBe("depleted");
    expect(lotClosed.remainingQuantity).toBe(0);
    expect(lotClosed.producedQuantity).toBe(20); // quantité d'origine conservée pour l'historique.

    const reopened = await caller.silo.setLotDepletion({ entryId: entry.id, silo: "SPF6", manuallyDepleted: false });
    expect(reopened.manuallyDepleted).toBe(false);

    const ledgerReopened = await caller.silo.lotLedger();
    const lotReopened = ledgerReopened.lots.find((lot) => lot.entryId === entry.id && lot.silo === "SPF6")!;
    expect(lotReopened.status).toBe("active"); // retombe sur le calcul FIFO normal (rien sorti) : actif, 20 T restantes.
    expect(lotReopened.remainingQuantity).toBe(20);
  });

  it("survit à la modification des autres informations du lot (date, article, quantité)", async () => {
    const caller = appRouter.createCaller(adminContext());
    const entry = await caller.silo.createEntry({ article: "DEPL-TEST-B", allocations: [{ silo: "SPF7", quantity: 10 }] });
    await caller.silo.setLotDepletion({ entryId: entry.id, silo: "SPF7", manuallyDepleted: true });

    // Corrige simplement le nom de l'article, comme depuis le bouton Modifier.
    await caller.silo.updateEntry({ id: entry.id, article: "DEPL-TEST-B-CORRIGE", allocations: [{ silo: "SPF7", quantity: 10 }] });

    const ledger = await caller.silo.lotLedger();
    const lot = ledger.lots.find((row) => row.entryId === entry.id && row.silo === "SPF7")!;
    expect(lot.article).toBe("DEPL-TEST-B-CORRIGE");
    expect(lot.manuallyDepleted).toBe(true); // pas réinitialisé par la modification des autres champs.
    expect(lot.status).toBe("depleted");
  });

  it("échoue proprement sur un couple (entrée, silo) inexistant", async () => {
    const caller = appRouter.createCaller(adminContext());
    await expect(caller.silo.setLotDepletion({ entryId: 999999999, silo: "SPF1", manuallyDepleted: true })).rejects.toThrow(/introuvable/i);
  });

  it("retire la quantité du lot de l'État des silos (silo.state) une fois fermé manuellement", async () => {
    const caller = appRouter.createCaller(adminContext());
    const entry = await caller.silo.createEntry({ article: "DEPL-TEST-C", allocations: [{ silo: "SPF8", quantity: 14 }] });

    const beforeClosing = await caller.silo.state();
    expect(beforeClosing.matrix.SPF8["DEPL-TEST-C"]).toBe(14);

    await caller.silo.setLotDepletion({ entryId: entry.id, silo: "SPF8", manuallyDepleted: true });
    const afterClosing = await caller.silo.state();
    expect(afterClosing.matrix.SPF8["DEPL-TEST-C"]).toBeNull(); // plus affiché comme stock disponible.

    await caller.silo.setLotDepletion({ entryId: entry.id, silo: "SPF8", manuallyDepleted: false });
    const afterReopening = await caller.silo.state();
    expect(afterReopening.matrix.SPF8["DEPL-TEST-C"]).toBe(14); // redevient disponible, réversible.
  });

  it("bloque une nouvelle expédition sur un lot fermé manuellement, comme si le stock était réellement à 0", async () => {
    const caller = appRouter.createCaller(adminContext());
    const entry = await caller.silo.createEntry({ article: "DEPL-TEST-D", allocations: [{ silo: "SPF9", quantity: 6 }] });
    await caller.silo.setLotDepletion({ entryId: entry.id, silo: "SPF9", manuallyDepleted: true });

    await expect(caller.silo.createShipment({ article: "DEPL-TEST-D", silo: "SPF9", quantity: 1, shipmentType: "Vrac" }))
      .rejects.toThrow(/stock disponible/i);
  });
});
