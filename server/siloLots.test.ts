import { describe, expect, it } from "vitest";
import { computeLotLedger } from "./siloLots";

describe("tracabilite FIFO des lots", () => {
  it("consomme le lot le plus ancien en premier (exemple demande)", () => {
    // 10 T de CM1, lot 2600655-0905, dans SPF1
    // puis 10 T de CM1, lot 2600659-0906, dans SPF1
    // puis expedition de 5 T de CM1 depuis SPF1
    // -> il doit rester 5 T du premier lot et 10 T intact du second.
    const { lots, unattributed } = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "2600655-0905", silo: "SPF1", quantity: 10 },
        { entryId: 2, entryDate: "2026-09-06", article: "CM1", lotNumber: "2600659-0906", silo: "SPF1", quantity: 10 },
      ],
      [
        { shipmentId: 1, shipmentDate: "2026-09-06", article: "CM1", silo: "SPF1", quantity: 5, shipmentType: "Vrac" },
      ],
    );

    expect(unattributed).toEqual([]);
    expect(lots).toHaveLength(2);

    const first = lots.find((lot) => lot.lotNumber === "2600655-0905")!;
    expect(first.producedQuantity).toBe(10);
    expect(first.consumedQuantity).toBe(5);
    expect(first.remainingQuantity).toBe(5);
    expect(first.status).toBe("active");
    expect(first.consumptions).toEqual([{ quantity: 5, source: { type: "shipment", shipmentId: 1, date: "2026-09-06", shipmentType: "Vrac" } }]);

    const second = lots.find((lot) => lot.lotNumber === "2600659-0906")!;
    expect(second.producedQuantity).toBe(10);
    expect(second.consumedQuantity).toBe(0);
    expect(second.remainingQuantity).toBe(10);
    expect(second.status).toBe("active");
    expect(second.consumptions).toEqual([]);
  });

  it("epuise completement un lot puis entame le suivant si l'expedition depasse le premier", () => {
    const { lots } = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "A", silo: "SPF1", quantity: 10 },
        { entryId: 2, entryDate: "2026-09-06", article: "CM1", lotNumber: "B", silo: "SPF1", quantity: 10 },
      ],
      [
        { shipmentId: 1, shipmentDate: "2026-09-07", article: "CM1", silo: "SPF1", quantity: 15, shipmentType: "Sac" },
      ],
    );

    const first = lots.find((lot) => lot.lotNumber === "A")!;
    const second = lots.find((lot) => lot.lotNumber === "B")!;
    expect(first.remainingQuantity).toBe(0);
    expect(first.status).toBe("depleted");
    expect(second.remainingQuantity).toBe(5);
    expect(second.status).toBe("active");
  });

  it("ordonne par date meme si les lots sont saisis dans un ordre different", () => {
    const { lots } = computeLotLedger(
      [
        // Saisi en second mais date au 5 : doit tout de meme etre consomme en premier.
        { entryId: 2, entryDate: "2026-09-05", article: "CM1", lotNumber: "ancien", silo: "SPF1", quantity: 10 },
        { entryId: 1, entryDate: "2026-09-08", article: "CM1", lotNumber: "recent", silo: "SPF1", quantity: 10 },
      ],
      [{ shipmentId: 1, shipmentDate: "2026-09-09", article: "CM1", silo: "SPF1", quantity: 5, shipmentType: "Vrac" }],
    );

    expect(lots.find((lot) => lot.lotNumber === "ancien")!.remainingQuantity).toBe(5);
    expect(lots.find((lot) => lot.lotNumber === "recent")!.remainingQuantity).toBe(10);
  });

  it("garde des files separees par silo : un meme article dans deux silos ne se melange pas", () => {
    const { lots } = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "L1", silo: "SPF1", quantity: 10 },
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "L1", silo: "SPF2", quantity: 5 },
      ],
      [{ shipmentId: 1, shipmentDate: "2026-09-06", article: "CM1", silo: "SPF1", quantity: 10, shipmentType: "Vrac" }],
    );

    const inSpf1 = lots.find((lot) => lot.silo === "SPF1")!;
    const inSpf2 = lots.find((lot) => lot.silo === "SPF2")!;
    expect(inSpf1.remainingQuantity).toBe(0);
    expect(inSpf1.status).toBe("depleted");
    expect(inSpf2.remainingQuantity).toBe(5); // l'expedition de SPF1 ne touche pas SPF2
  });

  it("traite une correction negative comme une consommation FIFO sans lot d'origine", () => {
    const { lots } = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-05", article: "CG3", lotNumber: "L1", silo: "SPF3", quantity: 25 },
        { entryId: 2, entryDate: "2026-09-06", article: "CG3", lotNumber: null, silo: "SPF3", quantity: -5 },
      ],
      [],
    );

    const lot = lots.find((entry) => entry.lotNumber === "L1")!;
    expect(lot.remainingQuantity).toBe(20);
    expect(lot.consumptions).toEqual([{ quantity: 5, source: { type: "correction", entryId: 2, date: "2026-09-06" } }]);
  });

  it("signale en non-attribue une expedition qui depasse toute production connue", () => {
    const { lots, unattributed } = computeLotLedger(
      [{ entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "L1", silo: "SPF1", quantity: 5 }],
      [{ shipmentId: 1, shipmentDate: "2026-09-06", article: "CM1", silo: "SPF1", quantity: 8, shipmentType: "Vrac" }],
    );

    expect(lots[0].remainingQuantity).toBe(0);
    expect(lots[0].status).toBe("depleted");
    expect(unattributed).toEqual([{ article: "CM1", silo: "SPF1", quantity: 3, source: { type: "shipment", shipmentId: 1, date: "2026-09-06", shipmentType: "Vrac" } }]);
  });

  it("ignore les mouvements d'un autre article ou silo", () => {
    const { lots } = computeLotLedger(
      [{ entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "L1", silo: "SPF1", quantity: 10 }],
      [
        { shipmentId: 1, shipmentDate: "2026-09-06", article: "CG3", silo: "SPF1", quantity: 5, shipmentType: "Vrac" },
        { shipmentId: 2, shipmentDate: "2026-09-06", article: "CM1", silo: "SPF2", quantity: 5, shipmentType: "Vrac" },
      ],
    );

    expect(lots[0].remainingQuantity).toBe(10);
  });
});
