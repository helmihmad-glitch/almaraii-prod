import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

// Les silos (Réglages) sont désormais une liste dynamique (ajout, retrait,
// renommage) plutôt que la liste figée SPF1..SPF12 d'origine — voir
// listActiveSilos/addSilo/renameSilo/archiveSilo dans siloDb.ts. Ces tests
// couvrent le cycle complet, sur le même modèle que production_articles
// (ajout/retrait), plus le renommage en cascade, propre aux silos.
function adminContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: true } as any;
}
function visitorContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: false } as any;
}

describe("Silos dynamiques (Réglages)", () => {
  it("liste les silos initiaux SPF1..SPF12, dans l'ordre choisi (jamais alphabétique, qui placerait SPF10 avant SPF2)", async () => {
    const silos = await appRouter.createCaller(adminContext()).settings.listSilos();
    expect(silos.map((silo) => silo.code)).toEqual(["SPF1", "SPF2", "SPF3", "SPF4", "SPF5", "SPF6", "SPF7", "SPF8", "SPF9", "SPF10", "SPF11", "SPF12"]);
  });

  it("settings.addSilo refuse un visiteur, accepte un admin, normalise en majuscules et l'ajoute à la fin de la liste", async () => {
    await expect(appRouter.createCaller(visitorContext()).settings.addSilo({ code: "SPF-MGMT-A" })).rejects.toThrow(/administrateur/i);

    const admin = appRouter.createCaller(adminContext());
    const created = await admin.settings.addSilo({ code: "spf-mgmt-a" });
    expect(created.code).toBe("SPF-MGMT-A");

    const silos = await admin.settings.listSilos();
    expect(silos.at(-1)!.code).toBe("SPF-MGMT-A");
  });

  it("settings.archiveSilo le retire de la liste active, mais l'historique de production le garde visible dans silo.state", async () => {
    const admin = appRouter.createCaller(adminContext());
    await admin.settings.addSilo({ code: "SPF-MGMT-B" });
    await admin.silo.createEntry({ article: "MGMT-ARTICLE-B", allocations: [{ silo: "SPF-MGMT-B", quantity: 5 }] });

    const beforeArchive = await admin.settings.listSilos();
    const target = beforeArchive.find((silo) => silo.code === "SPF-MGMT-B")!;
    await admin.settings.archiveSilo({ id: target.id });

    const afterArchive = await admin.settings.listSilos();
    expect(afterArchive.some((silo) => silo.code === "SPF-MGMT-B")).toBe(false);

    const state = await admin.silo.state();
    expect(state.silos).toContain("SPF-MGMT-B");
  });

  it("settings.renameSilo refuse un visiteur, renomme, et répercute le nouveau code sur les entrées et expéditions déjà enregistrées", async () => {
    const admin = appRouter.createCaller(adminContext());
    const created = await admin.settings.addSilo({ code: "SPF-MGMT-C" });
    const entry = await admin.silo.createEntry({ article: "MGMT-ARTICLE-C", entryDate: "2026-09-10", lotNumber: "LOT-MGMT-C", allocations: [{ silo: "SPF-MGMT-C", quantity: 8 }] });
    const shipmentResult = await admin.silo.createShipment({ shipmentDate: "2026-09-11", article: "MGMT-ARTICLE-C", silo: "SPF-MGMT-C", lotNumber: "LOT-MGMT-C", quantity: 3, shipmentType: "Vrac" });

    await expect(appRouter.createCaller(visitorContext()).settings.renameSilo({ id: created.id, code: "SPF-MGMT-C2" })).rejects.toThrow(/administrateur/i);

    const renamed = await admin.settings.renameSilo({ id: created.id, code: "spf-mgmt-c2" });
    expect(renamed.code).toBe("SPF-MGMT-C2");

    const entries = await admin.silo.listEntries();
    const updatedEntry = entries.find((item) => item.id === entry.id)!;
    expect(updatedEntry.allocations.map((allocation) => allocation.silo)).toEqual(["SPF-MGMT-C2"]);

    const shipments = await admin.silo.listShipments();
    const updatedShipment = shipments.find((item) => item.id === shipmentResult.shipments[0].id)!;
    expect(updatedShipment.silo).toBe("SPF-MGMT-C2");

    const listed = await admin.settings.listSilos();
    expect(listed.some((silo) => silo.code === "SPF-MGMT-C")).toBe(false);
    expect(listed.some((silo) => silo.code === "SPF-MGMT-C2")).toBe(true);
  });

  it("settings.renameSilo renvoie une erreur « introuvable » pour un id inconnu", async () => {
    const admin = appRouter.createCaller(adminContext());
    await expect(admin.settings.renameSilo({ id: 999999, code: "SPF-UNKNOWN" })).rejects.toThrow(/introuvable/i);
  });
});
