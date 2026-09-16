import { describe, expect, it } from "vitest";
import { importExpeditionShipments, parseExpeditionPdfText, type ParsedExpeditionShipment } from "./expeditionPdfImport";
import { createSiloProductionEntry, createSiloShipment, listSiloShipments } from "./siloDb";

// Texte réel extrait du rapport "Traçabilité Expédition — Rapport-35056"
// (système externe de pesée), tel que fourni par l'utilisateur — pages 1 et
// 2 concaténées comme le ferait l'extraction de texte du PDF complet.
const REAL_REPORT_TEXT = `
Al Maraii Aliments
Téléphone: +216 28 995 465
Adresse: Route Somaa km 6, Beni Khiar Nabeul, Tunisie
Email: contact@almaraii-na.com.tn
Date | 16/09/2026
ID | Rapport-35056
Traçabilité Expédition
Date du : 16/09/2026 00:00 au : 16/09/2026 23:59
COV-MA2609086 LIVRE VRAC | LIVRAISON
Client: al maraii du cap bon chair Camion: 9467 TU 259 Chauffeur: wajdi aziza Société liv.: -
Date BC: 16/09/2026 14:58 Entrée: 16/09/2026 16:41 Sortie: 16/09/2026 17:15
Tare entrée: 13460.00 Kg Poids sortie: 16160.00 Kg Poids net: 2700.00 Kg Qualité: 3 éch. (tout conforme)
Événements: 9
Code Désignation Qté théo Qté réelle Écart Lots Silo source
PCCV03 CG 25 Vrac 2700 Kg 2700.00 Kg +0.00 Kg 2600656-0910 (1660 Kg)
2600656-0910 (1040 Kg) SPF4
COV-MA2609085 LIVRE VRAC | LIVRAISON
Client: ABDERAZEK GODDI Camion: 7742 tu 249 Chauffeur: zouahir chetioui Société liv.: -
Date BC: 16/09/2026 13:38 Entrée: 16/09/2026 15:15 Sortie: 16/09/2026 16:29
Tare entrée: 24960.00 Kg Poids sortie: 32960.00 Kg Poids net: 8000.00 Kg Qualité: 2 éch. (tout conforme)
Événements: 7
Code Désignation Qté théo Qté réelle Écart Lots Silo source
PCDV01 CM1 Vrac 8000 Kg 8000.00 Kg +0.00 Kg 2600666-0914 (4520 Kg)
2600667-0915 (3480 Kg) SPF7
COV-MA2609084 LIVRE VRAC | LIVRAISON
Client: mounir haffar Camion: 7742 tu 249 Chauffeur: zouahir chetioui Société liv.: -
Date BC: 16/09/2026 13:37 Entrée: 16/09/2026 15:06 Sortie: 16/09/2026 15:14
Tare entrée: 22520.00 Kg Poids sortie: 24960.00 Kg Poids net: 2440.00 Kg Qualité: 1 éch. (tout conforme)
Événements: 4
Code Désignation Qté théo Qté réelle Écart Lots Silo source
PCCV03 CG 25 Vrac 2500 Kg 2440.00 Kg -60.00 Kg 2600656-0910 (2440 Kg) SPF4
Rapport généré automatiquement par le système de 2CM Industries +216 28 335 816. Utilisateur : admin
Page 1 / 2
COV-MA2609083 LIVRE VRAC | LIVRAISON
Client: wael baatout Camion: 7742 tu 249 Chauffeur: zouahir chetioui Société liv.: -
Date BC: 16/09/2026 13:36 Entrée: 16/09/2026 14:54 Sortie: 16/09/2026 15:06
Tare entrée: 18520.00 Kg Poids sortie: 22520.00 Kg Poids net: 4000.00 Kg Qualité: 2 éch. (tout conforme)
Événements: 5
Code Désignation Qté théo Qté réelle Écart Lots Silo source
PCCV03 CG 25 Vrac 4000 Kg 4000.00 Kg +0.00 Kg 2600656-0910 (2680 Kg)
2600656-0910 (1320 Kg) SPF4
COV-MA2609082 LIVRE VRAC | LIVRAISON
Client: ste deamagri Camion: 7742 tu 249 Chauffeur: zouahir chetioui Société liv.: -
Date BC: 16/09/2026 13:36 Entrée: 16/09/2026 14:19 Sortie: 16/09/2026 14:57
Tare entrée: 15480.00 Kg Poids sortie: 18520.00 Kg Poids net: 3040.00 Kg Qualité: 2 éch. (1 NC) Événements: 7
Code Désignation Qté théo Qté réelle Écart Lots Silo source
PCCV03 CG 25 Vrac 3000 Kg 3040.00 Kg +40.00 Kg 2600656-0910 (3040 Kg) SPF2
COV-MA2609077 LIVRE VRAC | LIVRAISON
Client: al maraii du cap bon dinde Camion: 9467 TU 259 Chauffeur: wajdi aziza Société liv.: -
Date BC: 17/09/2026 10:39 Entrée: 16/09/2026 13:05 Sortie: 16/09/2026 14:11
Tare entrée: 13460.00 Kg Poids sortie: 23740.00 Kg Poids net: 10280.00 Kg Qualité: 3 éch. (tout conforme)
Événements: 9
Code Désignation Qté théo Qté réelle Écart Lots Silo source
DCCV01 DG 3 10000 Kg 10280.00 Kg +280.00 Kg 2600668-0915 (5270.6 Kg)
2600669-0916 (4640 Kg) SPF11
COV-MA2609073 LIVRE VRAC | LIVRAISON
Client: al maraii du cap bon dinde Camion: 9467 TU 259 Chauffeur: wajdi aziza Société liv.: -
Date BC: 16/09/2026 10:28 Entrée: 16/09/2026 10:39 Sortie: 16/09/2026 11:12
Tare entrée: 13460.00 Kg Poids sortie: 28500.00 Kg Poids net: 15040.00 Kg Qualité: 1 éch. (tout conforme)
Événements: 4
Code Désignation Qté théo Qté réelle Écart Lots Silo source
DCCV01 DG 3 15000 Kg 15040.00 Kg +40.00 Kg 2600662-0912 (5429.8 Kg)
2600668-0915 (9610.2 Kg) SPF11
Rapport généré automatiquement par le système de 2CM Industries +216 28 335 816. Utilisateur : admin
Page 2 / 2
`;

describe("parseExpeditionPdfText (rapport « Traçabilité Expédition »)", () => {
  it("extrait les 7 expéditions du rapport réel, avec date/article/quantité/silo corrects", () => {
    const { shipments, errors } = parseExpeditionPdfText(REAL_REPORT_TEXT);
    expect(errors).toEqual([]);
    expect(shipments).toHaveLength(7);

    expect(shipments[0]).toEqual({ reference: "COV-MA2609086", shipmentDate: "2026-09-16", article: "CG25", quantity: 2.7, silo: "SPF4" });
    expect(shipments[1]).toEqual({ reference: "COV-MA2609085", shipmentDate: "2026-09-16", article: "CM1", quantity: 8, silo: "SPF7" });
    expect(shipments[2]).toEqual({ reference: "COV-MA2609084", shipmentDate: "2026-09-16", article: "CG25", quantity: 2.44, silo: "SPF4" });
    expect(shipments[3]).toEqual({ reference: "COV-MA2609083", shipmentDate: "2026-09-16", article: "CG25", quantity: 4, silo: "SPF4" });
    expect(shipments[4]).toEqual({ reference: "COV-MA2609082", shipmentDate: "2026-09-16", article: "CG25", quantity: 3.04, silo: "SPF2" });
    expect(shipments[5]).toEqual({ reference: "COV-MA2609077", shipmentDate: "2026-09-17", article: "DG3", quantity: 10.28, silo: "SPF11" });
    expect(shipments[6]).toEqual({ reference: "COV-MA2609073", shipmentDate: "2026-09-16", article: "DG3", quantity: 15.04, silo: "SPF11" });
  });

  it("retire le mot « Vrac » et les espaces de la désignation (CG 25 Vrac -> CG25, DG 3 -> DG3)", () => {
    const { shipments } = parseExpeditionPdfText(REAL_REPORT_TEXT);
    const articles = new Set(shipments.map((shipment) => shipment.article));
    expect(articles).toEqual(new Set(["CG25", "CM1", "DG3"]));
    expect(shipments.some((shipment) => /vrac/i.test(shipment.article))).toBe(false);
    expect(shipments.some((shipment) => shipment.article.includes(" "))).toBe(false);
  });

  it("signale un rapport sans référence « COV-... » plutôt que de planter", () => {
    const { shipments, errors } = parseExpeditionPdfText("Un document quelconque sans aucune expédition.");
    expect(shipments).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Aucune expédition");
  });

  it("ignore un bloc sans Date BC ou sans silo reconnu, avec un message d’erreur, sans bloquer les autres", () => {
    const text = `
COV-TEST01 LIVRE VRAC | LIVRAISON
Client: x Camion: y Chauffeur: z Société liv.: -
Entrée: 16/09/2026 10:00 Sortie: 16/09/2026 10:30
Code Désignation Qté théo Qté réelle Écart Lots Silo source
PCCV03 CG 25 Vrac 100 Kg 100.00 Kg +0.00 Kg SPF4
COV-TEST02 LIVRE VRAC | LIVRAISON
Date BC: 16/09/2026 11:00
Code Désignation Qté théo Qté réelle Écart Lots Silo source
PCCV03 CG 25 Vrac 200 Kg 200.00 Kg +0.00 Kg 2600000-0000 (200 Kg)
COV-MA2609073 LIVRE VRAC | LIVRAISON
Client: al maraii du cap bon dinde Camion: 9467 TU 259 Chauffeur: wajdi aziza Société liv.: -
Date BC: 16/09/2026 10:28 Entrée: 16/09/2026 10:39 Sortie: 16/09/2026 11:12
Code Désignation Qté théo Qté réelle Écart Lots Silo source
DCCV01 DG 3 15000 Kg 15040.00 Kg +40.00 Kg 2600662-0912 (5429.8 Kg) SPF11
`;
    const { shipments, errors } = parseExpeditionPdfText(text);
    expect(shipments).toHaveLength(1);
    expect(shipments[0].reference).toBe("COV-MA2609073");
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("COV-TEST01");
    expect(errors[0]).toContain("date BC");
    expect(errors[1]).toContain("COV-TEST02");
    expect(errors[1]).toContain("silo");
  });
});

describe("importExpeditionShipments (calcul du lot FIFO à la date de l’expédition)", () => {
  it("choisit le lot actif le plus ancien pour l’article et le silo, type Vrac systématique", async () => {
    await createSiloProductionEntry({ entryDate: "2026-02-01", article: "PDFART-A", lotNumber: "LOT-OLD", totalQuantity: "10.00" }, [{ silo: "SPF3", quantity: 10 }]);
    await createSiloProductionEntry({ entryDate: "2026-02-05", article: "PDFART-A", lotNumber: "LOT-NEW", totalQuantity: "10.00" }, [{ silo: "SPF3", quantity: 10 }]);

    const parsed: ParsedExpeditionShipment[] = [{ reference: "COV-A", shipmentDate: "2026-02-10", article: "PDFART-A", quantity: 4, silo: "SPF3" }];
    const result = await importExpeditionShipments(parsed);
    expect(result).toEqual({ imported: 1, warnings: [] });

    const shipments = await listSiloShipments();
    const created = shipments.find((shipment) => shipment.article === "PDFART-A");
    expect(created?.lotNumber).toBe("LOT-OLD");
    expect(created?.shipmentType).toBe("Vrac");
    expect(created?.silo).toBe("SPF3");
    expect(Number(created?.quantity)).toBe(4);
  });

  it("ignore les mouvements postérieurs à la date de l’expédition importée (bon lot pour une date rétroactive)", async () => {
    await createSiloProductionEntry({ entryDate: "2026-03-01", article: "PDFART-B", lotNumber: "LOT-EARLY", totalQuantity: "3.00" }, [{ silo: "SPF5", quantity: 3 }]);
    await createSiloProductionEntry({ entryDate: "2026-03-05", article: "PDFART-B", lotNumber: "LOT-LATER", totalQuantity: "10.00" }, [{ silo: "SPF5", quantity: 10 }]);
    // Expédition déjà enregistrée qui épuise LOT-EARLY, mais seulement le 08/03 — après la date de l'import rétroactif ci-dessous (03/03).
    await createSiloShipment({ shipmentDate: "2026-03-08", article: "PDFART-B", lotNumber: "LOT-EARLY", quantity: "3.00", silo: "SPF5", shipmentType: "Vrac" });

    const parsed: ParsedExpeditionShipment[] = [{ reference: "COV-B", shipmentDate: "2026-03-03", article: "PDFART-B", quantity: 2, silo: "SPF5" }];
    await importExpeditionShipments(parsed);

    const shipments = await listSiloShipments();
    const created = shipments.find((shipment) => shipment.article === "PDFART-B" && shipment.shipmentDate === "2026-03-03");
    // Au 03/03, LOT-EARLY n'est pas encore épuisé (la sortie qui l'épuise date du 08/03) : c'est donc bien lui le bon lot, pas LOT-LATER.
    expect(created?.lotNumber).toBe("LOT-EARLY");
  });

  it("traite les expéditions dans l’ordre chronologique, pas dans l’ordre du fichier", async () => {
    await createSiloProductionEntry({ entryDate: "2026-04-01", article: "PDFART-C", lotNumber: "LOT-C1", totalQuantity: "5.00" }, [{ silo: "SPF6", quantity: 5 }]);

    // Volontairement dans le désordre : la plus récente d'abord.
    const parsed: ParsedExpeditionShipment[] = [
      { reference: "COV-D2", shipmentDate: "2026-04-10", article: "PDFART-C", quantity: 1, silo: "SPF6" },
      { reference: "COV-D1", shipmentDate: "2026-04-05", article: "PDFART-C", quantity: 1, silo: "SPF6" },
    ];
    const result = await importExpeditionShipments(parsed);
    expect(result.imported).toBe(2);

    const shipments = await listSiloShipments();
    const created = shipments.filter((shipment) => shipment.article === "PDFART-C").sort((a, b) => (a.shipmentDate ?? "").localeCompare(b.shipmentDate ?? ""));
    expect(created.map((shipment) => shipment.lotNumber)).toEqual(["LOT-C1", "LOT-C1"]);
  });

  it("signale l’absence de lot actif plutôt que d’échouer, et importe quand même l’expédition sans numéro de lot", async () => {
    const parsed: ParsedExpeditionShipment[] = [{ reference: "COV-E", shipmentDate: "2026-05-01", article: "PDFART-INCONNU", quantity: 1, silo: "SPF9" }];
    const result = await importExpeditionShipments(parsed);
    expect(result.imported).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("COV-E");
    expect(result.warnings[0]).toContain("aucun lot actif");

    const shipments = await listSiloShipments();
    const created = shipments.find((shipment) => shipment.article === "PDFART-INCONNU");
    expect(created?.lotNumber).toBeNull();
  });
});
