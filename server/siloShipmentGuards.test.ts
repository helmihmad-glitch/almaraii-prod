import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

// Contrôles des expéditions et des réglages issus de l'audit des calculs
// (expédition de DG3/DG4 depuis un silo) : chaque test passe par le routeur
// tRPC, comme l'interface, avec ses propres articles pour ne jamais dépendre
// des autres fichiers de test qui partagent le même magasin de secours.
function adminContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: true } as any;
}
const admin = () => appRouter.createCaller(adminContext());

describe("silo : quantités expédiées", () => {
  it("refuse une quantité négative ou nulle, en création comme en modification (elle regonflait le stock)", async () => {
    const caller = admin();
    await caller.silo.createEntry({ article: "GUARD-NEG", entryDate: "2026-10-01", lotNumber: "GN-1", allocations: [{ silo: "SPF1", quantity: 5 }] });
    const shipment = { shipmentDate: "2026-10-02", article: "GUARD-NEG", silo: "SPF1", lotNumber: "GN-1", shipmentType: "Vrac" as const };

    await expect(caller.silo.createShipment({ ...shipment, quantity: -500 })).rejects.toThrow(/positive/i);
    await expect(caller.silo.createShipment({ ...shipment, quantity: 0 })).rejects.toThrow(/positive/i);
    // 0,004 T s'enregistrerait « 0.00 » : refusé de la même façon.
    await expect(caller.silo.createShipment({ ...shipment, quantity: 0.004 })).rejects.toThrow(/au moins 0,01 T/);
    const { shipments: [created] } = await caller.silo.createShipment({ ...shipment, quantity: 2 });
    await expect(caller.silo.updateShipment({ id: created.id, ...shipment, quantity: -3 })).rejects.toThrow(/positive/i);

    const state = await caller.silo.state();
    expect(state.matrix.SPF1["GUARD-NEG"]).toBe(3);
  });
});

describe("silo : expéditions antidatées", () => {
  it("refuse une expédition datée avant la production qu'elle utiliserait, sans rien enregistrer", async () => {
    const caller = admin();
    await caller.silo.createEntry({ article: "GUARD-BACK", entryDate: "2026-10-20", lotNumber: "GB-1", allocations: [{ silo: "SPF2", quantity: 10 }] });

    await expect(caller.silo.createShipment({ shipmentDate: "2026-10-10", article: "GUARD-BACK", silo: "SPF2", quantity: 5, shipmentType: "Vrac" }))
      .rejects.toThrow(/au 10\/10\/2026/);
    const shipments = await caller.silo.listShipments();
    expect(shipments.some((shipment) => shipment.article === "GUARD-BACK")).toBe(false);

    // Le jour même de la production (ou après) : acceptée, et imputée au lot plutôt que laissée sans n° de lot.
    const result = await caller.silo.createShipment({ shipmentDate: "2026-10-20", article: "GUARD-BACK", silo: "SPF2", quantity: 5, shipmentType: "Vrac" });
    expect(result.shipments.map((shipment) => [shipment.lotNumber, Number(shipment.quantity)])).toEqual([["GB-1", 5]]);
  });

  it("refuse une expédition antidatée qui priverait une expédition déjà enregistrée plus tard", async () => {
    const caller = admin();
    await caller.silo.createEntry({ article: "GUARD-LATER", entryDate: "2026-10-01", lotNumber: "GLT-1", allocations: [{ silo: "SPF3", quantity: 10 }] });
    await caller.silo.createEntry({ article: "GUARD-LATER", entryDate: "2026-10-20", lotNumber: "GLT-2", allocations: [{ silo: "SPF3", quantity: 10 }] });
    await caller.silo.createShipment({ shipmentDate: "2026-10-12", article: "GUARD-LATER", silo: "SPF3", quantity: 8, shipmentType: "Vrac" });

    // Au 10/10, seuls 10 T existent et l'expédition du 12/10 en emporte déjà 8 : il n'en reste que 2.
    await expect(caller.silo.createShipment({ shipmentDate: "2026-10-10", article: "GUARD-LATER", silo: "SPF3", quantity: 5, shipmentType: "Vrac" }))
      .rejects.toThrow(/\(2\.00 T\)/);
    const allowed = await caller.silo.createShipment({ shipmentDate: "2026-10-10", article: "GUARD-LATER", silo: "SPF3", quantity: 2, shipmentType: "Vrac" });
    expect(allowed.shipments.map((shipment) => shipment.lotNumber)).toEqual(["GLT-1"]);

    const ledger = await caller.silo.lotLedger();
    expect(ledger.unattributed.filter((row) => row.article === "GUARD-LATER")).toEqual([]);
  });

  // Saisie tardive réaliste : les expéditions de mardi sont déjà enregistrées
  // (lot A pris en FIFO), celles de lundi arrivent ensuite. Lundi ne doit pas
  // reprendre au lot A ce que l'expédition de mardi lui impute déjà.
  it("une expédition antidatée sans n° de lot contourne la part d'un lot déjà imputée à une expédition plus tardive", async () => {
    const caller = admin();
    await caller.silo.createEntry({ article: "GUARD-RESA", entryDate: "2026-11-01", lotNumber: "GR-A", allocations: [{ silo: "SPF5", quantity: 10 }] });
    await caller.silo.createEntry({ article: "GUARD-RESA", entryDate: "2026-11-01", lotNumber: "GR-B", allocations: [{ silo: "SPF5", quantity: 10 }] });
    const tuesday = await caller.silo.createShipment({ shipmentDate: "2026-11-03", article: "GUARD-RESA", silo: "SPF5", quantity: 10, shipmentType: "Vrac" });
    expect(tuesday.shipments.map((row) => row.lotNumber)).toEqual(["GR-A"]);

    const monday = await caller.silo.createShipment({ shipmentDate: "2026-11-02", article: "GUARD-RESA", silo: "SPF5", quantity: 5, shipmentType: "Vrac" });
    expect(monday.shipments.map((row) => [row.lotNumber, Number(row.quantity)])).toEqual([["GR-B", 5]]);

    // Désigner explicitement GR-A le lundi est refusé : tout GR-A est déjà imputé au mardi.
    await expect(caller.silo.createShipment({ shipmentDate: "2026-11-02", article: "GUARD-RESA", silo: "SPF5", lotNumber: "GR-A", quantity: 2, shipmentType: "Vrac" }))
      .rejects.toThrow(/déjà imputé à des expéditions enregistrées plus tard/);

    const lots = (await caller.silo.lotLedger()).lots.filter((lot) => lot.article === "GUARD-RESA");
    expect(lots.find((lot) => lot.lotNumber === "GR-A")).toMatchObject({ consumedQuantity: 10 });
    expect(lots.find((lot) => lot.lotNumber === "GR-B")).toMatchObject({ consumedQuantity: 5, remainingQuantity: 5 });
  });
});

describe("silo : n° de lot désigné sur une expédition", () => {
  it("refuse d'imputer à un lot plus qu'il ne contient (15 T demandées sur un lot de 5 T), et consomme bien le lot désigné", async () => {
    const caller = admin();
    await caller.silo.createEntry({ article: "GUARD-LOT", entryDate: "2026-10-01", lotNumber: "GLO-OLD", allocations: [{ silo: "SPF4", quantity: 5 }] });
    await caller.silo.createEntry({ article: "GUARD-LOT", entryDate: "2026-10-05", lotNumber: "GLO-NEW", allocations: [{ silo: "SPF4", quantity: 20 }] });

    await expect(caller.silo.createShipment({ shipmentDate: "2026-10-06", article: "GUARD-LOT", silo: "SPF4", lotNumber: "GLO-OLD", quantity: 15, shipmentType: "Vrac" }))
      .rejects.toThrow(/ne contenait plus que 5\.00 T/);

    await caller.silo.createShipment({ shipmentDate: "2026-10-06", article: "GUARD-LOT", silo: "SPF4", lotNumber: "GLO-NEW", quantity: 8, shipmentType: "Vrac" });
    const ledger = await caller.silo.lotLedger();
    const lots = ledger.lots.filter((lot) => lot.article === "GUARD-LOT" && lot.silo === "SPF4");
    expect(lots.find((lot) => lot.lotNumber === "GLO-NEW")!.remainingQuantity).toBe(12);
    expect(lots.find((lot) => lot.lotNumber === "GLO-OLD")!.remainingQuantity).toBe(5);
  });

  it("refuse un lot désigné qui se trouve dans un autre silo, en indiquant où il est", async () => {
    const caller = admin();
    await caller.silo.createEntry({ article: "GUARD-WHERE", entryDate: "2026-10-01", lotNumber: "GW-A", allocations: [{ silo: "SPF4", quantity: 5 }] });
    await caller.silo.createEntry({ article: "GUARD-WHERE", entryDate: "2026-10-01", lotNumber: "GW-B", allocations: [{ silo: "SPF5", quantity: 10 }] });

    await expect(caller.silo.createShipment({ shipmentDate: "2026-10-02", article: "GUARD-WHERE", silo: "SPF5", lotNumber: "GW-A", quantity: 3, shipmentType: "Vrac" }))
      .rejects.toThrow(/ne se trouve pas dans SPF5 \(silo : SPF4\)/);
  });

  it("vérifie chaque lot d'une expédition répartie sur plusieurs silos", async () => {
    const caller = admin();
    await caller.silo.createEntry({ article: "GUARD-SPLIT", entryDate: "2026-10-01", lotNumber: "GS-A", allocations: [{ silo: "SPF9", quantity: 5 }] });
    await caller.silo.createEntry({ article: "GUARD-SPLIT", entryDate: "2026-10-01", lotNumber: "GS-A2", allocations: [{ silo: "SPF9", quantity: 10 }] });
    await caller.silo.createEntry({ article: "GUARD-SPLIT", entryDate: "2026-10-01", lotNumber: "GS-B", allocations: [{ silo: "SPF10", quantity: 10 }] });

    await expect(caller.silo.createSplitShipment({
      shipmentDate: "2026-10-02",
      article: "GUARD-SPLIT",
      shipmentType: "Vrac",
      allocations: [{ silo: "SPF9", lotNumber: "GS-A", quantity: 8 }, { silo: "SPF10", lotNumber: "GS-B", quantity: 5 }],
    })).rejects.toThrow(/Le lot GS-A ne contenait plus que 5\.00 T/);
  });
});

describe("silo : modification d'une expédition", () => {
  it("laisse corriger le type, refuse une hausse au-delà du stock, et efface vraiment un n° de lot retiré", async () => {
    const caller = admin();
    await caller.silo.createEntry({ article: "GUARD-UPD", entryDate: "2026-10-01", lotNumber: "GU-1", allocations: [{ silo: "SPF11", quantity: 10 }] });
    const shipment = { shipmentDate: "2026-10-02", article: "GUARD-UPD", silo: "SPF11", lotNumber: "GU-1", quantity: 6, shipmentType: "Vrac" as const };
    const { shipments: [created] } = await caller.silo.createShipment(shipment);

    await expect(caller.silo.updateShipment({ id: created.id, ...shipment, shipmentType: "Sac" })).resolves.toMatchObject({ shipmentType: "Sac" });
    await expect(caller.silo.updateShipment({ id: created.id, ...shipment, quantity: 12 })).rejects.toThrow(/10\.00 T/);

    await caller.silo.updateShipment({ id: created.id, ...shipment, lotNumber: undefined });
    const stored = (await caller.silo.listShipments()).find((row) => row.id === created.id)!;
    expect(stored.lotNumber).toBeNull();
  });

  it("signale une expédition introuvable", async () => {
    await expect(admin().silo.updateShipment({ id: 999999999, shipmentDate: "2026-10-02", article: "GUARD-UPD", silo: "SPF11", quantity: 1, shipmentType: "Vrac" }))
      .rejects.toThrow(/introuvable/i);
  });
});

describe("silo : état des silos", () => {
  // Bug signalé : après avoir expédié du DG3 et du DG4 depuis un même silo, le
  // stock du second article disparaissait de « Stock par article » et du total.
  it("compte les deux articles d'un silo partagé après leurs expéditions", async () => {
    const caller = admin();
    await caller.silo.createEntry({ article: "MIX-DG3", entryDate: "2026-10-01", lotNumber: "MX-3", allocations: [{ silo: "SPF12", quantity: 20 }] });
    await caller.silo.createEntry({ article: "MIX-DG4", entryDate: "2026-10-02", lotNumber: "MX-4", allocations: [{ silo: "SPF12", quantity: 15 }] });
    await caller.silo.createShipment({ shipmentDate: "2026-10-03", article: "MIX-DG3", silo: "SPF12", quantity: 8, shipmentType: "Vrac" });
    await caller.silo.createShipment({ shipmentDate: "2026-10-03", article: "MIX-DG4", silo: "SPF12", quantity: 5, shipmentType: "Vrac" });

    const state = await caller.silo.state();
    expect(state.articleStock.find((row) => row.article === "MIX-DG3")!.quantity).toBe(12);
    expect(state.articleStock.find((row) => row.article === "MIX-DG4")!.quantity).toBe(10);
    const silo = state.occupancy.find((row) => row.silo === "SPF12")!;
    expect(silo.articles).toEqual(expect.arrayContaining([{ article: "MIX-DG3", quantity: 12 }, { article: "MIX-DG4", quantity: 10 }]));
  });

  it("met en majuscules un article saisi en minuscules, pour qu'il partage le stock de son code", async () => {
    const caller = admin();
    const entry = await caller.silo.createEntry({ article: "guard-case", entryDate: "2026-10-01", allocations: [{ silo: "SPF1", quantity: 4 }] });
    expect(entry.article).toBe("GUARD-CASE");
    const result = await caller.silo.createShipment({ shipmentDate: "2026-10-02", article: "Guard-Case", silo: "SPF1", quantity: 1, shipmentType: "Sac" });
    expect(result.shipments[0].article).toBe("GUARD-CASE");
  });
});

describe("silo : modification d'une entrée de production", () => {
  it("efface vraiment un n° de lot et une date retirés, et signale une entrée introuvable", async () => {
    const caller = admin();
    const entry = await caller.silo.createEntry({ article: "GUARD-ENTRY", entryDate: "2026-10-01", lotNumber: "GE-1", allocations: [{ silo: "SPF1", quantity: 4 }] });

    await caller.silo.updateEntry({ id: entry.id, article: "GUARD-ENTRY", allocations: [{ silo: "SPF1", quantity: 4 }] });
    const stored = (await caller.silo.listEntries()).find((row) => row.id === entry.id)!;
    expect(stored.lotNumber).toBeNull();
    expect(stored.entryDate).toBeNull();

    await expect(caller.silo.updateEntry({ id: 999999999, article: "GUARD-ENTRY", allocations: [] })).rejects.toThrow(/introuvable/i);
  });
});

describe("Réglages : codes et noms en double", () => {
  it("renameSilo refuse un code déjà porté par un autre silo, actif ou retiré", async () => {
    const caller = admin();
    const first = await caller.settings.addSilo({ code: "DUP-SILO-A" });
    const second = await caller.settings.addSilo({ code: "DUP-SILO-B" });

    await expect(caller.settings.renameSilo({ id: first.id, code: "dup-silo-b" })).rejects.toThrow(/déjà utilisé/);
    await caller.settings.archiveSilo({ id: second.id });
    await expect(caller.settings.renameSilo({ id: first.id, code: "DUP-SILO-B" })).rejects.toThrow(/silo retiré/);

    const silos = await caller.settings.listSilos();
    expect(silos.filter((silo) => silo.code === "DUP-SILO-A")).toHaveLength(1);
    expect(silos.some((silo) => silo.code === "DUP-SILO-B")).toBe(false);

    // Le magasin de test est partagé entre fichiers : on retire ce silo pour
    // laisser la liste active telle que les autres tests l'attendent (SPF1..SPF12).
    await caller.settings.archiveSilo({ id: first.id });
  });

  it("renameSilo refuse un code déjà présent dans l'historique des mouvements, même sans silo configuré", async () => {
    const caller = admin();
    const silo = await caller.settings.addSilo({ code: "HIST-SILO-A" });
    // Mouvement enregistré sous un code qui n'existe pas dans la liste des silos (ancien import, par exemple).
    await caller.silo.createEntry({ article: "GUARD-HIST", entryDate: "2026-10-01", allocations: [{ silo: "HIST-ORPHAN", quantity: 3 }] });

    await expect(caller.settings.renameSilo({ id: silo.id, code: "hist-orphan" })).rejects.toThrow(/déjà enregistrées sous le code HIST-ORPHAN/);
    await caller.settings.archiveSilo({ id: silo.id });
  });

  it("updateSmsGroup refuse un nom déjà porté par un autre groupe", async () => {
    const caller = admin();
    const contact = await caller.settings.addSmsContact({ name: "Doublon", phone: "+21690000123" });
    const first = await caller.settings.addSmsGroup({ name: "Groupe doublon 1", contactIds: [contact.id] });
    await caller.settings.addSmsGroup({ name: "Groupe doublon 2", contactIds: [contact.id] });

    await expect(caller.settings.updateSmsGroup({ id: first.id, name: "Groupe doublon 2", contactIds: [contact.id] })).rejects.toThrow(/porte déjà le nom/);
    const groups = await caller.settings.listSmsGroups();
    expect(groups.filter((group) => group.name === "Groupe doublon 2")).toHaveLength(1);
  });
});
