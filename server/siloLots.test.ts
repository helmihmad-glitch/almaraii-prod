import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  allocateFifoShipment,
  buildLotLedgerWorkbook,
  checkLotClaim,
  computeLotFreeQuantities,
  computeLotLedger,
  computeLotLedgerAsOf,
  computeShippableQuantity,
  findContradictedLotClaim,
  manualDepletionWriteOffs,
  openLotQuantity,
} from "./siloLots";

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

  it("à date d'entree egale, consomme par n° de lot croissant meme si les lots sont saisis dans l'ordre inverse", () => {
    // Cas réel signalé : trois lots entrés le même jour, mais saisis dans
    // l'application dans l'ordre inverse de leur n° de lot (2600677 saisi en
    // premier). La sortie doit tout de même entamer 2600675 en premier.
    const { lots } = computeLotLedger(
      [
        { entryId: 99, entryDate: "2026-09-17", article: "DG3", lotNumber: "2600677-0917", silo: "SPF11", quantity: 10 },
        { entryId: 101, entryDate: "2026-09-17", article: "DG3", lotNumber: "2600676-0917", silo: "SPF11", quantity: 10 },
        { entryId: 103, entryDate: "2026-09-17", article: "DG3", lotNumber: "2600675-0917", silo: "SPF11", quantity: 5 },
      ],
      [{ shipmentId: 1, shipmentDate: "2026-09-18", article: "DG3", silo: "SPF11", quantity: 8, shipmentType: "Sac" }],
    );

    expect(lots.find((lot) => lot.lotNumber === "2600675-0917")).toMatchObject({ remainingQuantity: 0, status: "depleted" });
    expect(lots.find((lot) => lot.lotNumber === "2600676-0917")).toMatchObject({ remainingQuantity: 7, status: "active" });
    expect(lots.find((lot) => lot.lotNumber === "2600677-0917")).toMatchObject({ remainingQuantity: 10, status: "active" });
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

  it("exporte un classeur Excel avec silo, article, n° lot et quantités, un silo fusionné par groupe de lots", async () => {
    const ledger = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "2600655-0905", silo: "SPF1", quantity: 10 },
        { entryId: 2, entryDate: "2026-09-06", article: "CM1", lotNumber: "2600659-0906", silo: "SPF1", quantity: 10 },
      ],
      [{ shipmentId: 1, shipmentDate: "2026-09-06", article: "CM1", silo: "SPF1", quantity: 5, shipmentType: "Vrac" }],
    );

    const buffer = await buildLotLedgerWorkbook(ledger);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Traçabilité des lots")!;

    const header = sheet.getRow(5);
    expect(["Silo", "Article", "Date Fabrication", "N° Lot", "Quantité par lot (T)", "Quantité silo (T)"])
      .toEqual([2, 3, 4, 5, 6, 7].map((col) => header.getCell(col).value));
    expect(header.getCell(2).fill).toMatchObject({ fgColor: { argb: "FF132B35" } });

    // SPF1 porte les deux lots (le plus ancien d'abord) sous une cellule Silo fusionnée,
    // et comme les deux partagent l'article CM1, leur cellule Article est aussi fusionnée.
    // « Quantité par lot » = ce qu'il reste de CE lot précis (5, puis 10 — pas les 10 T produites à l'origine pour le premier).
    expect(sheet.getRow(6).getCell(2).value).toBe("SPF1");
    expect(sheet.getRow(6).getCell(3).value).toBe("CM1");
    expect(sheet.getRow(6).getCell(5).value).toBe("2600655-0905");
    expect(sheet.getRow(6).getCell(6).value).toBe(5);
    expect(sheet.getRow(7).getCell(5).value).toBe("2600659-0906");
    expect(sheet.getRow(7).getCell(6).value).toBe(10);
    expect(sheet.getRow(7).getCell(2).isMerged).toBe(true);
    expect(sheet.getRow(7).getCell(3).isMerged).toBe(true);

    // « Quantité silo » = la somme des lots du silo (5 + 10 = 15), indiquée une seule fois, fusionnée.
    expect(sheet.getRow(6).getCell(7).value).toBe(15);
    expect(sheet.getRow(7).getCell(7).isMerged).toBe(true);

    // SPF2 n'a aucun lot actif : il reste visible, marqué « Vide », juste après.
    expect(sheet.getRow(8).getCell(2).value).toBe("SPF2");
    expect(sheet.getRow(8).getCell(3).value).toBe("Vide");
    expect(sheet.getRow(8).getCell(7).value).toBe("—");

    // Les 12 silos apparaissent dans l'ordre SPF1 → SPF12, jamais un tri alphabétique (qui placerait SPF10 avant SPF2).
    const dataRows = [6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    expect(dataRows.map((row) => sheet.getRow(row).getCell(2).value))
      .toEqual(["SPF1", "SPF2", "SPF3", "SPF4", "SPF5", "SPF6", "SPF7", "SPF8", "SPF9", "SPF10", "SPF11", "SPF12"]);

    // Ligne de total juste après SPF12 : somme des quantités restantes (5 + 10 = 15), en formule vivante.
    const total = sheet.getRow(19);
    expect(total.getCell(2).value).toBe("Total");
    expect(total.getCell(7).result).toBe(15);
    expect(total.height).toBe(30);
    expect(sheet.getColumn(2).width).toBe(25);
  });

  it("n'exporte que les lots encore actifs, pas les lots épuisés", async () => {
    // Lot A entièrement consommé (épuisé), lot B entamé seulement en partie (actif).
    const ledger = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "A", silo: "SPF1", quantity: 10 },
        { entryId: 2, entryDate: "2026-09-06", article: "CM1", lotNumber: "B", silo: "SPF1", quantity: 10 },
      ],
      [{ shipmentId: 1, shipmentDate: "2026-09-07", article: "CM1", silo: "SPF1", quantity: 15, shipmentType: "Sac" }],
    );
    expect(ledger.lots.find((lot) => lot.lotNumber === "A")!.status).toBe("depleted");

    const buffer = await buildLotLedgerWorkbook(ledger);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Traçabilité des lots")!;

    // SPF1 ne porte plus qu'une ligne (le lot B actif) ; SPF2 suit aussitôt, vide.
    expect(sheet.getRow(6).getCell(5).value).toBe("B");
    expect(sheet.getRow(6).getCell(6).value).toBe(5); // quantité par lot : ce qu'il reste de B
    expect(sheet.getRow(6).getCell(7).value).toBe(5); // quantité silo : un seul lot actif ici, donc identique
    expect(sheet.getRow(7).getCell(2).value).toBe("SPF2");
    expect(sheet.getRow(7).getCell(3).value).toBe("Vide");

    // Total après les 12 silos (SPF1 à la ligne 6, puis 11 silos vides).
    const total = sheet.getRow(18);
    expect(total.getCell(2).value).toBe("Total");
    expect(total.getCell(7).result).toBe(5);
  });

  it("ne fusionne pas les articles d'un même silo quand ils diffèrent", async () => {
    // Deux lots actifs dans SPF1, mais d'articles différents (CM1 puis CG3, jamais consommés).
    const ledger = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "L1", silo: "SPF1", quantity: 10 },
        { entryId: 2, entryDate: "2026-09-06", article: "CG3", lotNumber: "L2", silo: "SPF1", quantity: 8 },
      ],
      [],
    );

    const buffer = await buildLotLedgerWorkbook(ledger);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Traçabilité des lots")!;

    // Le silo reste fusionné (même silo)…
    expect(sheet.getRow(6).getCell(2).value).toBe("SPF1");
    expect(sheet.getRow(7).getCell(2).isMerged).toBe(true);
    // … mais chaque article garde sa propre cellule, non fusionnée.
    expect(sheet.getRow(6).getCell(3).value).toBe("CM1");
    expect(sheet.getRow(7).getCell(3).value).toBe("CG3");
    expect(sheet.getRow(6).getCell(3).isMerged).toBe(false);
    expect(sheet.getRow(7).getCell(3).isMerged).toBe(false);
    // La quantité silo, elle, reste bien la somme des deux (10 + 8 = 18) malgré les articles distincts.
    expect(sheet.getRow(6).getCell(7).value).toBe(18);
    expect(sheet.getRow(7).getCell(7).isMerged).toBe(true);
  });

  it("exporte un classeur exploitable même sans aucun lot actif, en listant les 12 silos vides", async () => {
    const buffer = await buildLotLedgerWorkbook({ lots: [], unattributed: [] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Traçabilité des lots")!;

    expect(sheet.getRow(5).getCell(2).value).toBe("Silo");
    expect(sheet.getRow(6).getCell(2).value).toBe("SPF1");
    expect(sheet.getRow(6).getCell(3).value).toBe("Vide");
    expect(sheet.getRow(17).getCell(2).value).toBe("SPF12");
    expect(sheet.getRow(18).getCell(2).value).toBe("Total");
    // Aucun silo n'a de quantité numérique (tous « Vide ») : la somme vaut 0.
    expect(sheet.getRow(18).getCell(7).result).toBe(0);
  });

  it("ajoute un tableau récapitulatif de la quantité totale par article, tous silos confondus", async () => {
    const ledger = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "L1", silo: "SPF1", quantity: 10 },
        { entryId: 2, entryDate: "2026-09-07", article: "CG3", lotNumber: "L2", silo: "SPF3", quantity: 15 },
        { entryId: 3, entryDate: "2026-09-07", article: "CG3", lotNumber: "L3", silo: "SPF5", quantity: 25 },
      ],
      [],
    );

    const buffer = await buildLotLedgerWorkbook(ledger);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Traçabilité des lots")!;

    // Tableau annexe (colonnes I/J), trié par article : CG3 additionne SPF3 (15) et SPF5 (25).
    expect(sheet.getRow(5).getCell(9).value).toBe("Article");
    expect(sheet.getRow(5).getCell(10).value).toBe("Quantité (T)");
    expect(sheet.getRow(6).getCell(9).value).toBe("CG3");
    expect(sheet.getRow(6).getCell(10).value).toBe(40);
    expect(sheet.getRow(7).getCell(9).value).toBe("CM1");
    expect(sheet.getRow(7).getCell(10).value).toBe(10);

    // Son propre total (colonne J) rejoint celui du tableau principal (colonne G).
    expect(sheet.getRow(8).getCell(9).value).toBe("Total");
    expect(sheet.getRow(8).getCell(10).result).toBe(50);
  });

  it("ferme manuellement un lot actif : restant force a 0, statut epuise, sorties reelles inchangees", () => {
    const { lots } = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "A", silo: "SPF1", quantity: 20, manuallyDepleted: true },
      ],
      [
        { shipmentId: 1, shipmentDate: "2026-09-06", article: "CM1", silo: "SPF1", quantity: 12, shipmentType: "Vrac" },
      ],
    );

    const lot = lots[0];
    expect(lot.producedQuantity).toBe(20);
    expect(lot.consumedQuantity).toBe(12); // sortie reelle : inchangee, gardee pour l'historique.
    expect(lot.remainingQuantity).toBe(0); // force a 0 malgre les 8 T non couvertes par une sortie connue.
    expect(lot.status).toBe("depleted");
    expect(lot.manuallyDepleted).toBe(true);
  });

  it("une fermeture manuelle ne consomme pas un autre lot par erreur (contrairement a une correction FIFO)", () => {
    // Meme situation que le tout premier test (deux lots CM1 dans SPF1), mais
    // cette fois on ferme manuellement le SECOND lot (le plus recent, encore
    // intact) : le premier lot ne doit surtout pas etre touche.
    const { lots } = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "2600655-0905", silo: "SPF1", quantity: 10 },
        { entryId: 2, entryDate: "2026-09-06", article: "CM1", lotNumber: "2600659-0906", silo: "SPF1", quantity: 10, manuallyDepleted: true },
      ],
      [],
    );

    const first = lots.find((lot) => lot.lotNumber === "2600655-0905")!;
    const second = lots.find((lot) => lot.lotNumber === "2600659-0906")!;
    expect(first.remainingQuantity).toBe(10);
    expect(first.status).toBe("active");
    expect(second.remainingQuantity).toBe(0);
    expect(second.status).toBe("depleted");
  });

  it("reversible : sans le drapeau, le meme lot retombe sur son calcul FIFO normal", () => {
    const withoutFlag = computeLotLedger(
      [{ entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "A", silo: "SPF1", quantity: 20, manuallyDepleted: false }],
      [{ shipmentId: 1, shipmentDate: "2026-09-06", article: "CM1", silo: "SPF1", quantity: 12, shipmentType: "Vrac" }],
    ).lots[0];
    expect(withoutFlag.remainingQuantity).toBe(8);
    expect(withoutFlag.status).toBe("active");
  });

  it("manualDepletionWriteOffs : ne retire que la part non expliquée par une sortie connue, jamais un lot déjà épuisé tout seul", () => {
    const { lots } = computeLotLedger(
      [
        // Fermé manuellement avec 8 T non expliquées (20 produites, 12 sorties) : à retirer du stock silo.
        { entryId: 1, entryDate: "2026-09-05", article: "CM1", lotNumber: "A", silo: "SPF1", quantity: 20, manuallyDepleted: true },
        // Fermé manuellement mais déjà entièrement sorti : rien à retirer de plus.
        { entryId: 2, entryDate: "2026-09-05", article: "CM1", lotNumber: "B", silo: "SPF2", quantity: 10, manuallyDepleted: true },
        // Actif, jamais fermé manuellement : ignoré.
        { entryId: 3, entryDate: "2026-09-05", article: "CG3", lotNumber: "C", silo: "SPF3", quantity: 15 },
      ],
      [
        { shipmentId: 1, shipmentDate: "2026-09-06", article: "CM1", silo: "SPF1", quantity: 12, shipmentType: "Vrac" },
        { shipmentId: 2, shipmentDate: "2026-09-06", article: "CM1", silo: "SPF2", quantity: 10, shipmentType: "Vrac" },
      ],
    );

    expect(manualDepletionWriteOffs(lots)).toEqual([{ article: "CM1", silo: "SPF1", quantity: 8 }]);
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

describe("allocateFifoShipment (répartition d'une expédition sans N° Lot précisé)", () => {
  it("répartit sur plusieurs lots quand le premier ne suffit pas (exemple : SPF11, 5 + 10 + 10 T, expédition de 18 T)", () => {
    const { lots } = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-17", article: "CG3", lotNumber: "2600675-0917", silo: "SPF11", quantity: 5 },
        { entryId: 2, entryDate: "2026-09-17", article: "CG3", lotNumber: "2600676-0917", silo: "SPF11", quantity: 10 },
        { entryId: 3, entryDate: "2026-09-17", article: "CG3", lotNumber: "2600677-0917", silo: "SPF11", quantity: 10 },
      ],
      [],
    );

    const chunks = allocateFifoShipment(lots, "CG3", "SPF11", 18);

    expect(chunks).toEqual([
      { lotNumber: "2600675-0917", quantity: 5 },
      { lotNumber: "2600676-0917", quantity: 10 },
      { lotNumber: "2600677-0917", quantity: 3 },
    ]);

    // Le 1er et le 2e lot sont épuisés par cette répartition, le 3e reste actif avec 7 T restantes.
    const afterShipment = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-17", article: "CG3", lotNumber: "2600675-0917", silo: "SPF11", quantity: 5 },
        { entryId: 2, entryDate: "2026-09-17", article: "CG3", lotNumber: "2600676-0917", silo: "SPF11", quantity: 10 },
        { entryId: 3, entryDate: "2026-09-17", article: "CG3", lotNumber: "2600677-0917", silo: "SPF11", quantity: 10 },
      ],
      chunks.map((chunk, index) => ({ shipmentId: index + 1, shipmentDate: "2026-09-18", article: "CG3", silo: "SPF11", quantity: chunk.quantity, shipmentType: "Vrac" as const })),
    ).lots;
    expect(afterShipment.find((lot) => lot.lotNumber === "2600675-0917")!.status).toBe("depleted");
    expect(afterShipment.find((lot) => lot.lotNumber === "2600676-0917")!.status).toBe("depleted");
    const third = afterShipment.find((lot) => lot.lotNumber === "2600677-0917")!;
    expect(third.status).toBe("active");
    expect(third.remainingQuantity).toBe(7);
  });

  it("tient dans un seul lot quand il suffit : un seul tronçon", () => {
    const { lots } = computeLotLedger([{ entryId: 1, entryDate: "2026-09-17", article: "CM1", lotNumber: "A", silo: "SPF2", quantity: 20 }], []);
    expect(allocateFifoShipment(lots, "CM1", "SPF2", 12)).toEqual([{ lotNumber: "A", quantity: 12 }]);
  });

  it("départage par n° de lot plutôt que par ordre de saisie (entryId), quand plusieurs lots partagent la même date d'entrée", () => {
    // Cas réel signalé : les trois lots saisis en une seule fois (même date
    // d'entrée), mais dans l'ordre INVERSE de leur numéro de lot — 2600677
    // saisi en premier (entryId le plus bas), 2600675 saisi en dernier. Le n°
    // de lot (attribué par le système externe à la fabrication) doit
    // l'emporter sur l'ordre de saisie, qui ne reflète ici pas du tout
    // l'ordre réel de fabrication.
    const { lots } = computeLotLedger(
      [
        { entryId: 99, entryDate: "2026-09-17", article: "DG3", lotNumber: "2600677-0917", silo: "SPF11", quantity: 10 },
        { entryId: 101, entryDate: "2026-09-17", article: "DG3", lotNumber: "2600676-0917", silo: "SPF11", quantity: 10 },
        { entryId: 103, entryDate: "2026-09-17", article: "DG3", lotNumber: "2600675-0917", silo: "SPF11", quantity: 5 },
      ],
      [],
    );

    // Toujours le plus petit n° de lot (2600675) en premier, jamais celui saisi en premier (2600677, entryId 99).
    expect(allocateFifoShipment(lots, "DG3", "SPF11", 18)).toEqual([
      { lotNumber: "2600675-0917", quantity: 5 },
      { lotNumber: "2600676-0917", quantity: 10 },
      { lotNumber: "2600677-0917", quantity: 3 },
    ]);
  });

  it("repli sur entryId seulement quand les deux lots comparés n'ont pas de n° de lot", () => {
    const { lots } = computeLotLedger(
      [
        { entryId: 2, entryDate: "2026-09-17", article: "CM1", lotNumber: null, silo: "SPF2", quantity: 10 },
        { entryId: 1, entryDate: "2026-09-17", article: "CM1", lotNumber: null, silo: "SPF2", quantity: 5 },
        { entryId: 3, entryDate: "2026-09-17", article: "CM1", lotNumber: "NUMEROTE", silo: "SPF2", quantity: 8 },
      ],
      [],
    );

    // Le lot numéroté passe avant les deux non numérotés, qui se départagent ensuite par entryId.
    expect(allocateFifoShipment(lots, "CM1", "SPF2", 23).map((chunk) => chunk.quantity)).toEqual([8, 5, 10]);
  });

  it("ignore les lots épuisés ou d'un autre article/silo", () => {
    const { lots } = computeLotLedger(
      [
        { entryId: 1, entryDate: "2026-09-17", article: "CM1", lotNumber: "EPUISE", silo: "SPF2", quantity: 5 },
        { entryId: 2, entryDate: "2026-09-17", article: "CM1", lotNumber: "ACTIF", silo: "SPF2", quantity: 10 },
      ],
      [{ shipmentId: 1, shipmentDate: "2026-09-17", article: "CM1", silo: "SPF2", quantity: 5, shipmentType: "Vrac" }],
    );
    expect(allocateFifoShipment(lots, "CM1", "SPF2", 4)).toEqual([{ lotNumber: "ACTIF", quantity: 4 }]);
  });

  it("signale un reliquat plutôt que de le perdre si les lots actifs ne couvrent pas toute la quantité", () => {
    const { lots } = computeLotLedger([{ entryId: 1, entryDate: "2026-09-17", article: "CM1", lotNumber: "A", silo: "SPF2", quantity: 5 }], []);
    expect(allocateFifoShipment(lots, "CM1", "SPF2", 8)).toEqual([{ lotNumber: "A", quantity: 5 }, { lotNumber: null, quantity: 3 }]);
  });

  it("place un lot sans date après les lots datés, comme le grand livre", () => {
    const { lots } = computeLotLedger(
      [
        { entryId: 1, entryDate: null, article: "CM1", lotNumber: "SANS-DATE", silo: "SPF2", quantity: 5 },
        { entryId: 2, entryDate: "2026-09-17", article: "CM1", lotNumber: "DATE", silo: "SPF2", quantity: 5 },
      ],
      [],
    );
    expect(allocateFifoShipment(lots, "CM1", "SPF2", 6)).toEqual([{ lotNumber: "DATE", quantity: 5 }, { lotNumber: "SANS-DATE", quantity: 1 }]);
  });
});

const TWO_LOTS = [
  { entryId: 1, entryDate: "2026-10-01", article: "DG3", lotNumber: "LOT-OLD", silo: "SPF1", quantity: 5 },
  { entryId: 2, entryDate: "2026-10-05", article: "DG3", lotNumber: "LOT-NEW", silo: "SPF1", quantity: 20 },
];

describe("lot désigné sur une sortie (n° de lot de l'expédition ou de la correction)", () => {
  // Bug signalé par l'audit : le grand livre ignorait le n° de lot enregistré
  // sur une expédition et consommait toujours le lot le plus ancien, si bien
  // que la ligne enregistrée et la traçabilité des lots se contredisaient.
  it("consomme le lot désigné plutôt que le plus ancien", () => {
    const { lots } = computeLotLedger(TWO_LOTS, [
      { shipmentId: 1, shipmentDate: "2026-10-06", article: "DG3", silo: "SPF1", quantity: 8, shipmentType: "Vrac", lotNumber: "LOT-NEW" },
    ]);

    expect(lots.find((lot) => lot.lotNumber === "LOT-OLD")).toMatchObject({ remainingQuantity: 5, status: "active" });
    expect(lots.find((lot) => lot.lotNumber === "LOT-NEW")).toMatchObject({ remainingQuantity: 12, consumedQuantity: 8 });
  });

  it("ne repasse en FIFO que pour le surplus quand le lot désigné ne suffit pas", () => {
    const { lots, unattributed } = computeLotLedger(TWO_LOTS, [
      { shipmentId: 1, shipmentDate: "2026-10-06", article: "DG3", silo: "SPF1", quantity: 7, shipmentType: "Vrac", lotNumber: "LOT-OLD" },
    ]);

    expect(unattributed).toEqual([]);
    expect(lots.find((lot) => lot.lotNumber === "LOT-OLD")).toMatchObject({ remainingQuantity: 0, status: "depleted" });
    expect(lots.find((lot) => lot.lotNumber === "LOT-NEW")).toMatchObject({ remainingQuantity: 18 });
  });

  it("une correction qui désigne son lot le consomme en priorité, comme une expédition", () => {
    const { lots } = computeLotLedger([...TWO_LOTS, { entryId: 3, entryDate: "2026-10-06", article: "DG3", lotNumber: "LOT-NEW", silo: "SPF1", quantity: -4 }], []);
    expect(lots.find((lot) => lot.lotNumber === "LOT-OLD")).toMatchObject({ remainingQuantity: 5 });
    expect(lots.find((lot) => lot.lotNumber === "LOT-NEW")).toMatchObject({ remainingQuantity: 16 });
  });

  it("un lot désigné inconnu laisse la sortie en FIFO, sans la perdre", () => {
    const { lots, unattributed } = computeLotLedger(TWO_LOTS, [
      { shipmentId: 1, shipmentDate: "2026-10-06", article: "DG3", silo: "SPF1", quantity: 3, shipmentType: "Vrac", lotNumber: "LOT-INCONNU" },
    ]);
    expect(unattributed).toEqual([]);
    expect(lots.find((lot) => lot.lotNumber === "LOT-OLD")).toMatchObject({ remainingQuantity: 2 });
  });
});

describe("computeLotLedgerAsOf (grand livre à la date d'une sortie)", () => {
  it("ignore les mouvements postérieurs à la date, et range les mouvements sans date en fin de chronologie", () => {
    const allocations = [...TWO_LOTS, { entryId: 3, entryDate: null, article: "DG3", lotNumber: "LOT-SANS-DATE", silo: "SPF1", quantity: 4 }];
    const shipments = [{ shipmentId: 1, shipmentDate: "2026-10-08", article: "DG3", silo: "SPF1", quantity: 5, shipmentType: "Vrac", lotNumber: null }];

    expect(computeLotLedgerAsOf(allocations, shipments, "2026-10-03").lots.map((lot) => lot.lotNumber)).toEqual(["LOT-OLD"]);
    expect(computeLotLedgerAsOf(allocations, shipments, "2026-10-06").lots.map((lot) => [lot.lotNumber, lot.remainingQuantity])).toEqual([["LOT-OLD", 5], ["LOT-NEW", 20]]);
    // Sans date : après tout le reste, expédition du 08/10 comprise.
    const atEnd = computeLotLedgerAsOf(allocations, shipments, null).lots;
    expect(atEnd.map((lot) => [lot.lotNumber, lot.remainingQuantity])).toEqual([["LOT-OLD", 0], ["LOT-NEW", 20], ["LOT-SANS-DATE", 4]]);
  });
});

describe("computeShippableQuantity (stock expédiable à une date)", () => {
  it("ne laisse rien expédier avant la première production (expédition antidatée)", () => {
    expect(computeShippableQuantity(TWO_LOTS, [], "DG3", "SPF1", "2026-09-30")).toBe(0);
    expect(computeShippableQuantity(TWO_LOTS, [], "DG3", "SPF1", "2026-10-02")).toBe(5);
    expect(computeShippableQuantity(TWO_LOTS, [], "DG3", "SPF1", "2026-10-05")).toBe(25);
  });

  it("réserve ce qu'une expédition enregistrée plus tard emporte déjà", () => {
    // 5 T le 01/10, 20 T le 05/10 ; 22 T déjà expédiées le 10/10 : il ne reste
    // que 3 T à partager, y compris pour une expédition antidatée au 06/10.
    const shipments = [{ shipmentId: 1, shipmentDate: "2026-10-10", article: "DG3", silo: "SPF1", quantity: 22, shipmentType: "Vrac" }];
    expect(computeShippableQuantity(TWO_LOTS, shipments, "DG3", "SPF1", "2026-10-06")).toBe(3);
    // Au 02/10, seul LOT-OLD existe, mais l'expédition du 10/10 en a besoin aussi.
    expect(computeShippableQuantity(TWO_LOTS, shipments, "DG3", "SPF1", "2026-10-02")).toBe(3);
  });

  it("ne compte un lot fermé manuellement que pour ce qui en est réellement sorti", () => {
    const allocations = [{ ...TWO_LOTS[0], manuallyDepleted: true }, TWO_LOTS[1]];
    // LOT-OLD fermé sans aucune sortie : avant LOT-NEW, plus rien n'est expédiable.
    expect(computeShippableQuantity(allocations, [], "DG3", "SPF1", "2026-10-02")).toBe(0);
    expect(computeShippableQuantity(allocations, [], "DG3", "SPF1", "2026-10-06")).toBe(20);
  });

  it("renvoie 0 pour un couple article/silo sans aucun mouvement", () => {
    expect(computeShippableQuantity(TWO_LOTS, [], "DG4", "SPF1", "2026-10-06")).toBe(0);
  });
});

describe("checkLotClaim (lot désigné sur une expédition)", () => {
  const claim = (overrides: Partial<{ silo: string; lotNumber: string; quantity: number; date: string | null }>) =>
    ({ article: "DG3", silo: "SPF1", lotNumber: "LOT-OLD", quantity: 3, date: "2026-10-06", ...overrides });

  it("accepte une quantité que le lot contenait à cette date", () => {
    expect(checkLotClaim(TWO_LOTS, [], claim({}))).toEqual({ status: "ok" });
  });

  it("refuse d'imputer à un lot plus qu'il ne contenait (15 T sur un lot de 5 T)", () => {
    expect(checkLotClaim(TWO_LOTS, [], claim({ quantity: 15 }))).toEqual({ status: "insufficient", available: 5, reservedLater: false });
  });

  it("tient compte des sorties déjà imputées au lot avant cette date", () => {
    const shipments = [{ shipmentId: 1, shipmentDate: "2026-10-02", article: "DG3", silo: "SPF1", quantity: 4, shipmentType: "Vrac", lotNumber: "LOT-OLD" }];
    expect(checkLotClaim(TWO_LOTS, shipments, claim({ quantity: 2 }))).toEqual({ status: "insufficient", available: 1, reservedLater: false });
  });

  it("refuse un lot qui n'était pas encore entré à la date de l'expédition", () => {
    expect(checkLotClaim(TWO_LOTS, [], claim({ lotNumber: "LOT-NEW", date: "2026-10-03" }))).toEqual({ status: "not-yet-produced", entryDate: "2026-10-05" });
  });

  it("refuse un lot présent dans un autre silo, en indiquant où il se trouve", () => {
    expect(checkLotClaim(TWO_LOTS, [], claim({ silo: "SPF2" }))).toEqual({ status: "other-silo", silos: ["SPF1"] });
  });

  it("refuse un lot fermé manuellement", () => {
    expect(checkLotClaim([{ ...TWO_LOTS[0], manuallyDepleted: true }, TWO_LOTS[1]], [], claim({}))).toEqual({ status: "closed" });
  });

  it("ne bloque pas un lot que l'application ne connaît pas du tout pour cet article", () => {
    expect(checkLotClaim(TWO_LOTS, [], claim({ lotNumber: "LOT-EXTERNE" }))).toEqual({ status: "untracked" });
  });

  it("réserve à une expédition enregistrée plus tard ce qu'elle prend au lot qu'elle désigne (saisie antidatée)", () => {
    // LOT-OLD contenait bien 5 T au 02/10, mais l'expédition du 08/10 lui en impute déjà 4.
    const later = [{ shipmentId: 1, shipmentDate: "2026-10-08", article: "DG3", silo: "SPF1", quantity: 4, shipmentType: "Vrac", lotNumber: "LOT-OLD" }];
    expect(checkLotClaim(TWO_LOTS, later, claim({ date: "2026-10-02", quantity: 3 }))).toEqual({ status: "insufficient", available: 1, reservedLater: true });
    expect(checkLotClaim(TWO_LOTS, later, claim({ date: "2026-10-02", quantity: 1 }))).toEqual({ status: "ok" });
  });
});

const SAME_DAY_LOTS = [
  { entryId: 1, entryDate: "2026-01-01", article: "DG4", lotNumber: "A", silo: "SPF1", quantity: 10 },
  { entryId: 2, entryDate: "2026-01-01", article: "DG4", lotNumber: "B", silo: "SPF1", quantity: 10 },
];
const LATER_CLAIM_ON_A = [{ shipmentId: 10, shipmentDate: "2026-01-03", article: "DG4", silo: "SPF1", quantity: 10, shipmentType: "Vrac", lotNumber: "A" }];

describe("saisie antidatée : ne jamais contredire un n° de lot déjà enregistré", () => {
  it("computeLotFreeQuantities retire du lot ce qu'une expédition ultérieure lui impute", () => {
    expect(computeLotFreeQuantities(SAME_DAY_LOTS, LATER_CLAIM_ON_A, "DG4", "SPF1", "2026-01-02")).toEqual(new Map([["A", 0], ["B", 10]]));
    // Après cette expédition, plus rien n'est réservé : A est simplement vide.
    expect(computeLotFreeQuantities(SAME_DAY_LOTS, LATER_CLAIM_ON_A, "DG4", "SPF1", "2026-01-04")).toEqual(new Map([["A", 0], ["B", 10]]));
  });

  it("la répartition FIFO d'une expédition antidatée contourne la part déjà réservée d'un lot", () => {
    const ledger = computeLotLedgerAsOf(SAME_DAY_LOTS, LATER_CLAIM_ON_A, "2026-01-02");
    const caps = computeLotFreeQuantities(SAME_DAY_LOTS, LATER_CLAIM_ON_A, "DG4", "SPF1", "2026-01-02");
    expect(allocateFifoShipment(ledger.lots, "DG4", "SPF1", 5, caps)).toEqual([{ lotNumber: "B", quantity: 5 }]);
    expect(openLotQuantity(ledger.lots, "DG4", "SPF1", caps)).toBe(10);
    expect(findContradictedLotClaim(SAME_DAY_LOTS, LATER_CLAIM_ON_A, [{ article: "DG4", silo: "SPF1", lotNumber: "B", quantity: 5 }], "2026-01-02")).toBeNull();
  });

  it("n'utilise pas un lot sans n° tant qu'un lot plus ancien garde une part réservée (le grand livre y imputerait la ligne sans lot)", () => {
    const lots = [
      { entryId: 1, entryDate: "2026-01-01", article: "DG4", lotNumber: "L2", silo: "SPF3", quantity: 7 },
      { entryId: 2, entryDate: "2026-01-02", article: "DG4", lotNumber: null, silo: "SPF3", quantity: 9 },
    ];
    const later = [{ shipmentId: 1, shipmentDate: "2026-01-09", article: "DG4", silo: "SPF3", quantity: 7, shipmentType: "Vrac", lotNumber: "L2" }];
    const ledger = computeLotLedgerAsOf(lots, later, "2026-01-05");
    const caps = computeLotFreeQuantities(lots, later, "DG4", "SPF3", "2026-01-05");
    expect(openLotQuantity(ledger.lots, "DG4", "SPF3", caps)).toBe(0);
    // Sans réservation, le lot sans n° redevient utilisable une fois le lot plus ancien entièrement cédé.
    expect(allocateFifoShipment(ledger.lots, "DG4", "SPF3", 10)).toEqual([{ lotNumber: "L2", quantity: 7 }, { lotNumber: null, quantity: 3 }]);
  });

  it("findContradictedLotClaim signale l'expédition enregistrée qui perdrait une partie de son lot", () => {
    expect(findContradictedLotClaim(SAME_DAY_LOTS, LATER_CLAIM_ON_A, [{ article: "DG4", silo: "SPF1", lotNumber: "A", quantity: 5 }], "2026-01-02"))
      .toEqual({ lotNumber: "A", silo: "SPF1", date: "2026-01-03" });
  });

  it("findContradictedLotClaim voit aussi l'effet indirect d'une sortie sans n° de lot qui se reporte en FIFO", () => {
    // L (plus ancien) et M : une sortie sans lot de 6 T le 05/01 entame L en FIFO,
    // puis une expédition du 06/01 désigne L pour 4 T. Imputer 3 T à L au 02/01
    // laisse assez de L pour l'expédition du 06/01 en apparence (10 - 4 = 6),
    // mais la sortie du 05/01 consommerait alors L en premier : celle du 06/01
    // n'obtiendrait plus que 1 T de L.
    const lots = [
      { entryId: 1, entryDate: "2026-01-01", article: "DG4", lotNumber: "L", silo: "SPF2", quantity: 10 },
      { entryId: 2, entryDate: "2026-01-01", article: "DG4", lotNumber: "M", silo: "SPF2", quantity: 10 },
    ];
    const shipments = [
      { shipmentId: 1, shipmentDate: "2026-01-05", article: "DG4", silo: "SPF2", quantity: 6, shipmentType: "Vrac", lotNumber: null },
      { shipmentId: 2, shipmentDate: "2026-01-06", article: "DG4", silo: "SPF2", quantity: 4, shipmentType: "Vrac", lotNumber: "L" },
    ];
    expect(checkLotClaim(lots, shipments, { article: "DG4", silo: "SPF2", lotNumber: "L", quantity: 3, date: "2026-01-02" })).toEqual({ status: "ok" });
    expect(findContradictedLotClaim(lots, shipments, [{ article: "DG4", silo: "SPF2", lotNumber: "L", quantity: 3 }], "2026-01-02"))
      .toEqual({ lotNumber: "L", silo: "SPF2", date: "2026-01-06" });
  });
});

// Cas réel (SPF6, CG3) : 8,95 T sorties du 03/10 au 08/10 alors qu'aucun lot ne les couvrait
// à ces dates. La traçabilité affichait 33,95 T restantes sur le dernier lot, l'État des silos 25 T.
describe("excédent d'une sortie sans lot à sa date : reporté sur les lots encore ouverts", () => {
  const allocations = [
    { entryId: 1, entryDate: "2026-10-01", article: "CG3", lotNumber: "A-1001", silo: "SPF6", quantity: 47.25 },
    { entryId: 2, entryDate: "2026-10-12", article: "CG3", lotNumber: "B-1012", silo: "SPF6", quantity: 105, manuallyDepleted: true },
    { entryId: 3, entryDate: "2026-10-26", article: "CG3", lotNumber: "C-1026", silo: "SPF6", quantity: 94.27 },
  ];
  const shipments = [
    { shipmentId: 162, shipmentDate: "2026-10-01", article: "CG3", silo: "SPF6", quantity: 29.1, shipmentType: "Sac", lotNumber: "A-1001" },
    { shipmentId: 174, shipmentDate: "2026-10-03", article: "CG3", silo: "SPF6", quantity: 27.1, shipmentType: "Sac", lotNumber: "A-1001" }, // 8,95 T de trop
    { shipmentId: 364, shipmentDate: "2026-10-12", article: "CG3", silo: "SPF6", quantity: 101.61, shipmentType: "Vrac", lotNumber: "B-1012" },
    { shipmentId: 470, shipmentDate: "2026-10-26", article: "CG3", silo: "SPF6", quantity: 60.32, shipmentType: "Sac", lotNumber: "C-1026" },
  ];

  it("le restant du lot ouvert rejoint le stock de l'État des silos ; le lot fermé manuellement n'est pas touché", () => {
    const ledger = computeLotLedger(allocations, shipments);
    const lot = (lotNumber: string) => ledger.lots.find((item) => item.lotNumber === lotNumber)!;

    // Stock du silo (État des silos) : produit − expédié − part écartée du lot fermé.
    const produced = allocations.reduce((sum, item) => sum + item.quantity, 0);
    const shipped = shipments.reduce((sum, item) => sum + item.quantity, 0);
    const writeOff = manualDepletionWriteOffs(ledger.lots).reduce((sum, item) => sum + item.quantity, 0);
    expect(Math.round((produced - shipped - writeOff) * 100) / 100).toBe(25);

    expect(lot("C-1026").remainingQuantity).toBe(25); // 94,27 − 60,32 − 8,95 (au lieu de 33,95)
    expect(lot("C-1026").consumptions.at(-1)).toEqual({ quantity: 8.95, source: { type: "shipment", shipmentId: 174, date: "2026-10-03", shipmentType: "Sac" }, carriedOver: true });
    expect(writeOff).toBe(3.39); // la fermeture manuelle du lot B-1012 compte toujours pour 3,39 T
    expect(ledger.unattributed).toEqual([]);
    expect(ledger.carriedOver).toEqual([{ article: "CG3", silo: "SPF6", quantity: 8.95, source: { type: "shipment", shipmentId: 174, date: "2026-10-03", shipmentType: "Sac" }, lotNumber: "C-1026", entryId: 3 }]);
  });

  it("ce qu'aucun lot ouvert ne peut couvrir reste sans lot d'origine", () => {
    const ledger = computeLotLedger(allocations.slice(0, 1), shipments.slice(0, 2));

    expect(ledger.carriedOver).toEqual([]);
    expect(ledger.unattributed).toEqual([{ article: "CG3", silo: "SPF6", quantity: 8.95, source: { type: "shipment", shipmentId: 174, date: "2026-10-03", shipmentType: "Sac" } }]);
  });
});
