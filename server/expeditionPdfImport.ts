// Import du rapport PDF "Traçabilité Expédition" d'un système de pesée
// externe (ex. 2CM Industries) : chaque bloc d'expédition (repéré par sa
// référence "COV-...") devient une ligne d'expédition Vrac. Le numéro de lot
// n'est jamais repris du PDF (numérotation d'un système externe, sans lien
// garanti avec celle de l'application) : il est recalculé depuis le grand
// livre FIFO de l'application à la date de l'expédition (voir
// computeLotLedger dans siloLots.ts) — le lot actif le plus ancien pour cet
// article et ce silo, tel qu'il se présentait à cette date-là. Même règle
// que la suggestion de lot affichée à la saisie manuelle d'une expédition.
import { PDFParse } from "pdf-parse";
import { computeLotLedger } from "./siloLots";
import { createSiloShipment, loadLotMovements } from "./siloDb";

/** Texte brut du PDF (toutes pages concaténées), pour parseExpeditionPdfText ci-dessous. */
export async function extractExpeditionPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export type ParsedExpeditionShipment = {
  /** Référence du bloc d'origine (ex. "COV-MA2609086"), pour les messages d'avertissement uniquement. */
  reference: string;
  shipmentDate: string; // AAAA-MM-JJ (Date BC du bloc)
  article: string; // Désignation normalisée : mot "Vrac" et espaces retirés (ex. "CG 25 Vrac" -> "CG25")
  quantity: number; // Tonnes (Qté réelle du bloc, convertie depuis les Kg)
  silo: string; // Silo source (ex. "SPF4")
};

export type ParsedExpeditionPdf = { shipments: ParsedExpeditionShipment[]; errors: string[] };

const REFERENCE_PATTERN = /\bCOV-[A-Z0-9]+\b/g;
const DATE_BC_PATTERN = /Date\s*BC\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i;
// En-tête du petit tableau de chaque bloc : sert d'ancre pour chercher la
// ligne de données juste après, plutôt que dans tout le bloc — la référence
// de l'expédition elle-même (ex. "COV-TEST99") peut sinon être confondue
// avec un code article si ses derniers chiffres tiennent sur 1 à 4 positions.
const HEADER_PATTERN = /Code\s+D[ée]signation\s+Qt[ée]\s*th[ée]o\s+Qt[ée]\s*r[ée]elle\s+[ÉE]cart\s+Lots\s+Silo\s*source/i;
// Code (ex. PCCV03) puis Désignation (texte libre) puis Qté théo / Qté réelle / Écart, chacune suivie de "Kg".
const DATA_LINE_PATTERN = /([A-Z]{2,8}\d{1,4})\s+(.+?)\s+([\d.,]+)\s*Kg\s+([\d.,]+)\s*Kg\s+[+-]\s*[\d.,]+\s*Kg/i;
const SILO_PATTERN = /\bSPF\d{1,2}\b/;

function roundTons(value: number) {
  return Math.round(value * 100) / 100;
}

/** "CG 25 Vrac" -> "CG25" ; "DG 3" -> "DG3" ; "CM1 Vrac" -> "CM1". */
function normalizeArticle(designation: string): string {
  return designation.replace(/vrac/gi, "").replace(/\s+/g, "").trim();
}

function parseAmount(text: string): number {
  return Number(text.replace(/\s/g, "").replace(",", "."));
}

/**
 * Découpe le texte extrait du PDF en lignes d'expédition prêtes à importer.
 * Un bloc illisible (date, article, quantité ou silo introuvable) est
 * ignoré avec un message d'erreur plutôt que de faire échouer tout l'import
 * — même philosophie tolérante que les autres imports de ce projet.
 */
export function parseExpeditionPdfText(text: string): ParsedExpeditionPdf {
  const shipments: ParsedExpeditionShipment[] = [];
  const errors: string[] = [];

  const matches = Array.from(text.matchAll(REFERENCE_PATTERN));
  if (matches.length === 0) {
    errors.push("Aucune expédition (référence « COV-... ») trouvée dans le PDF.");
    return { shipments, errors };
  }

  matches.forEach((match, index) => {
    const reference = match[0];
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
    // Les sauts de ligne du PDF découpent parfois la liste des lots au milieu
    // de la ligne de données : on aplatit tout le bloc en une seule chaîne
    // pour ne pas dépendre de la position exacte des retours à la ligne.
    const block = text.slice(start, end).replace(/\s+/g, " ").trim();

    const dateMatch = block.match(DATE_BC_PATTERN);
    if (!dateMatch) { errors.push(`${reference} : date BC introuvable, ligne ignorée.`); return; }
    const shipmentDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

    // On cherche la ligne de données après l'en-tête du tableau quand il est
    // présent (cas normal) : cela élimine tout risque de confondre la
    // référence de l'expédition, le client ou le camion avec un code article.
    const headerMatch = block.match(HEADER_PATTERN);
    const searchArea = headerMatch ? block.slice((headerMatch.index ?? 0) + headerMatch[0].length) : block;
    const dataMatch = searchArea.match(DATA_LINE_PATTERN);
    if (!dataMatch) { errors.push(`${reference} : ligne d’article introuvable ou illisible, ligne ignorée.`); return; }

    const article = normalizeArticle(dataMatch[2]);
    if (!article) { errors.push(`${reference} : désignation d’article vide après normalisation, ligne ignorée.`); return; }

    const quantityKg = parseAmount(dataMatch[4]);
    if (!Number.isFinite(quantityKg) || quantityKg <= 0) { errors.push(`${reference} : quantité réelle illisible, ligne ignorée.`); return; }

    // Le silo source suit la liste des lots : on le cherche après la ligne de
    // données déjà repérée (et, à défaut, dans tout le bloc) plutôt que de
    // dépendre du nombre de lots listés.
    const tail = searchArea.slice((dataMatch.index ?? 0) + dataMatch[0].length);
    const siloMatch = tail.match(SILO_PATTERN) ?? block.match(SILO_PATTERN);
    if (!siloMatch) { errors.push(`${reference} : silo source introuvable, ligne ignorée.`); return; }

    shipments.push({ reference, shipmentDate, article, quantity: roundTons(quantityKg / 1000), silo: siloMatch[0] });
  });

  return { shipments, errors };
}

/**
 * Lot FIFO actif le plus ancien pour cet article et ce silo, tel qu'il se
 * présentait à la date donnée : les mouvements postérieurs sont exclus du
 * grand livre recalculé pour cette recherche, afin de ne pas laisser une
 * production ou une expédition plus récente fausser le choix.
 */
async function resolveFifoLot(article: string, silo: string, date: string): Promise<string | null> {
  const { allocations, shipments } = await loadLotMovements();
  const ledger = computeLotLedger(
    allocations.filter((allocation) => !allocation.entryDate || allocation.entryDate <= date),
    shipments.filter((shipment) => !shipment.shipmentDate || shipment.shipmentDate <= date),
  );
  const candidates = ledger.lots
    .filter((lot) => lot.article === article && lot.silo === silo && lot.status === "active")
    .sort((a, b) => (a.entryDate ?? "").localeCompare(b.entryDate ?? ""));
  return candidates[0]?.lotNumber ?? null;
}

export type ExpeditionImportResult = { imported: number; warnings: string[] };

/**
 * Enregistre les expéditions extraites du PDF, une par une et par ordre
 * chronologique : le lot de chacune est calculé sur l'état du registre à cet
 * instant précis, ce qui inclut les expéditions du même import déjà
 * enregistrées juste avant (mêmes règles de dépôt que si elles avaient été
 * saisies à la main dans cet ordre).
 */
export async function importExpeditionShipments(shipments: ParsedExpeditionShipment[]): Promise<ExpeditionImportResult> {
  const warnings: string[] = [];
  const ordered = [...shipments].sort((a, b) => a.shipmentDate.localeCompare(b.shipmentDate));

  for (const shipment of ordered) {
    const lotNumber = await resolveFifoLot(shipment.article, shipment.silo, shipment.shipmentDate);
    if (!lotNumber) {
      warnings.push(`${shipment.reference} : aucun lot actif pour ${shipment.article} dans ${shipment.silo} au ${shipment.shipmentDate} — expédition importée sans numéro de lot.`);
    }
    await createSiloShipment({
      shipmentDate: shipment.shipmentDate,
      article: shipment.article,
      lotNumber,
      quantity: shipment.quantity.toFixed(2),
      silo: shipment.silo,
      shipmentType: "Vrac",
    });
  }

  return { imported: ordered.length, warnings };
}
