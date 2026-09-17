import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildLotLedgerWorkbook, computeLotLedger, manualDepletionWriteOffs } from "./siloLots";

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
