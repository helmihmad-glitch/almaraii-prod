import ExcelJS from "exceljs";
import { columnLetter, TITLE_FILL, writeTitle } from "./siloExcel";
import { SILOS } from "../shared/silo";

// Tracabilite FIFO des lots de produits finis, silo par silo.
//
// Chaque entree de production depose un lot dans un silo (une meme entree
// peut etre repartie sur plusieurs silos ; chaque silo recoit alors sa
// propre part, tracee separement, puisqu'un meme lot physique peut se
// trouver dans deux silos en meme temps). Les expeditions et les corrections
// (quantite negative saisie directement en production, comme dans le
// classeur d'origine) consomment ensuite le plus ANCIEN lot disponible en
// premier -- la regle FIFO standard de gestion de stock -- jusqu'a
// epuisement de la quantite a retirer.
//
// Exemple (celui qui a motive cette fonctionnalite) :
//   10 T de CM1, lot 2600655-0905, entrent dans SPF1
//   10 T de CM1, lot 2600659-0906, entrent ensuite dans SPF1
//   5 T de CM1 sortent de SPF1 (expedition)
//   -> le lot 2600655-0905 (le plus ancien) tombe a 5 T restantes ;
//      le lot 2600659-0906 reste intact a 10 T.

export type LotAllocationInput = {
  entryId: number;
  entryDate: string | null;
  article: string;
  lotNumber: string | null;
  silo: string;
  /** Positive : depot de production. Negative : correction manuelle (retrait sans lot d'origine). */
  quantity: number;
};

export type LotShipmentInput = {
  shipmentId: number;
  shipmentDate: string | null;
  article: string;
  silo: string;
  quantity: number;
  shipmentType: string;
};

export type LotConsumptionSource =
  | { type: "shipment"; shipmentId: number; date: string | null; shipmentType: string }
  | { type: "correction"; entryId: number; date: string | null };

export type LotConsumption = { quantity: number; source: LotConsumptionSource };

export type LotBalance = {
  entryId: number;
  article: string;
  silo: string;
  lotNumber: string | null;
  entryDate: string | null;
  producedQuantity: number;
  consumedQuantity: number;
  remainingQuantity: number;
  status: "active" | "depleted";
  consumptions: LotConsumption[];
};

/** Consommation qu'aucun lot n'a pu couvrir (retraits excedant la production connue). */
export type UnattributedConsumption = { article: string; silo: string; quantity: number; source: LotConsumptionSource };

export type LotLedger = { lots: LotBalance[]; unattributed: UnattributedConsumption[] };

type QueueEvent =
  | { kind: "produce"; date: string; sequence: number; entryId: number; lotNumber: string | null; entryDate: string | null; quantity: number }
  | { kind: "consume"; date: string; sequence: number; quantity: number; source: LotConsumptionSource };

/** Les mouvements sans date sont rares (saisie manuelle incomplete) ; on les place apres les mouvements dates plutot que de les laisser perturber l'ordre chronologique connu. */
const UNDATED_SORT_KEY = "9999-99-99";

function roundTons(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

export function computeLotLedger(allocations: LotAllocationInput[], shipments: LotShipmentInput[]): LotLedger {
  const groups = new Map<string, { article: string; silo: string; events: QueueEvent[] }>();
  let sequence = 0;

  const pushEvent = (article: string, silo: string, event: QueueEvent) => {
    const key = article + "::" + silo;
    let group = groups.get(key);
    if (!group) {
      group = { article, silo, events: [] };
      groups.set(key, group);
    }
    group.events.push(event);
  };

  for (const allocation of allocations) {
    if (allocation.quantity === 0) continue;
    const date = allocation.entryDate ?? UNDATED_SORT_KEY;
    sequence += 1;
    if (allocation.quantity > 0) {
      pushEvent(allocation.article, allocation.silo, {
        kind: "produce",
        date,
        sequence,
        entryId: allocation.entryId,
        lotNumber: allocation.lotNumber,
        entryDate: allocation.entryDate,
        quantity: allocation.quantity,
      });
    } else {
      pushEvent(allocation.article, allocation.silo, {
        kind: "consume",
        date,
        sequence,
        quantity: -allocation.quantity,
        source: { type: "correction", entryId: allocation.entryId, date: allocation.entryDate },
      });
    }
  }

  for (const shipment of shipments) {
    if (shipment.quantity <= 0) continue;
    sequence += 1;
    pushEvent(shipment.article, shipment.silo, {
      kind: "consume",
      date: shipment.shipmentDate ?? UNDATED_SORT_KEY,
      sequence,
      quantity: shipment.quantity,
      source: { type: "shipment", shipmentId: shipment.shipmentId, date: shipment.shipmentDate, shipmentType: shipment.shipmentType },
    });
  }

  const lots: LotBalance[] = [];
  const unattributed: UnattributedConsumption[] = [];

  for (const group of Array.from(groups.values())) {
    const { article, silo, events } = group;
    events.sort((a: QueueEvent, b: QueueEvent) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sequence - b.sequence));

    // File d'attente FIFO des lots encore actifs pour ce couple (article, silo).
    const queue: LotBalance[] = [];

    for (const event of events) {
      if (event.kind === "produce") {
        const lot: LotBalance = {
          entryId: event.entryId,
          article,
          silo,
          lotNumber: event.lotNumber,
          entryDate: event.entryDate,
          producedQuantity: event.quantity,
          consumedQuantity: 0,
          remainingQuantity: event.quantity,
          status: "active",
          consumptions: [],
        };
        lots.push(lot);
        queue.push(lot);
        continue;
      }

      let remainingToConsume = event.quantity;
      while (remainingToConsume > 1e-9 && queue.length > 0) {
        const oldest = queue[0];
        const taken = Math.min(oldest.remainingQuantity, remainingToConsume);
        oldest.remainingQuantity = roundTons(oldest.remainingQuantity - taken);
        oldest.consumedQuantity = roundTons(oldest.consumedQuantity + taken);
        oldest.consumptions.push({ quantity: taken, source: event.source });
        remainingToConsume -= taken;
        if (oldest.remainingQuantity <= 1e-9) {
          oldest.remainingQuantity = 0;
          oldest.status = "depleted";
          queue.shift();
        }
      }
      if (remainingToConsume > 1e-9) {
        unattributed.push({ article, silo, quantity: roundTons(remainingToConsume), source: event.source });
      }
    }
  }

  return { lots, unattributed };
}

const LEDGER_SHEET_NAME = "Traçabilité des lots";
const LEDGER_FIRST_COL = 2; // colonne B : une marge à gauche, comme les classeurs existants de l'application.
const LEDGER_LAST_COL = LEDGER_FIRST_COL + 5; // Silo, Article, Date, N° Lot, Qté par lot, Qté silo.
const LEDGER_TITLE_ROW = 2;
const LEDGER_SUMMARY_ROW = 3;
const LEDGER_HEADER_ROW = 5;
const LEDGER_FIRST_DATA_ROW = 6;
const LEDGER_COLUMN_WIDTH = 25;
const LEDGER_ROW_HEIGHT = 30;

/** Couleur alignée sur la pastille « Actif » de la page à l'écran (voir silo.css `.silo-lot-status-active`). */
const ACTIVE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F2E4" } };
const ZEBRA_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FBF4" } };
const GRID_BORDER_SIDE: ExcelJS.Border = { style: "thin", color: { argb: "FFC4CEC0" } };
/** Quadrillage du tableau (en-tête, lignes de données et total) — pas la bannière titre/date au-dessus. */
const GRID_BORDER: Partial<ExcelJS.Borders> = { top: GRID_BORDER_SIDE, left: GRID_BORDER_SIDE, bottom: GRID_BORDER_SIDE, right: GRID_BORDER_SIDE };

const LEDGER_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const formatLedgerDate = (value: string | null) => (value ? LEDGER_DATE_FORMATTER.format(new Date(`${value}T00:00:00`)) : "—");

/**
 * Construit un classeur Excel de la traçabilité des lots : une ligne par lot
 * ENCORE ACTIF (silo, article, date d'entrée, n° lot, quantité restante DE CE
 * LOT) — les lots épuisés n'apportent rien à un inventaire courant et sont
 * exclus. Les silos regroupent leurs lots sous une cellule fusionnée (silo
 * par silo, dans l'ordre SPF1 → SPF12, pas un tri alphabétique qui placerait
 * SPF10 avant SPF2), avec la « Quantité silo » — la somme des quantités
 * restantes de tous ses lots (ex. 14,78 + 10 = 24,78) — indiquée une seule
 * fois pour tout le groupe ; à l'intérieur d'un silo, les lots consécutifs
 * d'un même article partagent aussi leur cellule Article. Un silo sans lot
 * actif reste visible avec une ligne « Vide », comme à l'écran. Un total en
 * pied de colonne clôt le tableau. Reprend les couleurs déjà utilisées pour
 * le classeur Silo_PF (voir server/siloExcel.ts) afin de rester cohérent.
 */
export async function buildLotLedgerWorkbook(ledger: LotLedger): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Almaraïi Production Pulse";
  workbook.created = new Date();
  workbook.modified = new Date();

  const activeLots = ledger.lots.filter((lot) => lot.status === "active");
  const groups: { silo: string; lots: LotBalance[] }[] = SILOS.map((silo) => ({
    silo,
    lots: activeLots
      .filter((lot) => lot.silo === silo)
      .sort((a, b) => (a.entryDate ?? "").localeCompare(b.entryDate ?? "") || a.entryId - b.entryId),
  }));
  const totalRemaining = activeLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);

  const worksheet = workbook.addWorksheet(LEDGER_SHEET_NAME, { views: [{ state: "frozen", ySplit: LEDGER_HEADER_ROW }] });

  writeTitle(worksheet, LEDGER_TITLE_ROW, LEDGER_FIRST_COL, LEDGER_LAST_COL, "🌾  TRAÇABILITÉ DES LOTS — Almaraïi Production");

  const summaryRow = worksheet.getRow(LEDGER_SUMMARY_ROW);
  const summaryCell = summaryRow.getCell(LEDGER_FIRST_COL);
  summaryCell.value = `Exporté le ${LEDGER_DATE_FORMATTER.format(new Date())}`;
  worksheet.mergeCells(LEDGER_SUMMARY_ROW, LEDGER_FIRST_COL, LEDGER_SUMMARY_ROW, LEDGER_LAST_COL);
  summaryCell.font = { italic: true, color: { argb: "FF356A40" } };
  summaryCell.alignment = { vertical: "middle", horizontal: "center" };
  summaryCell.fill = ACTIVE_FILL;
  summaryRow.height = 20;

  const headerRow = worksheet.getRow(LEDGER_HEADER_ROW);
  ["Silo", "Article", "Date d’entrée", "N° Lot", "Quantité par lot (T)", "Quantité silo (T)"].forEach((label, index) => {
    const cell = headerRow.getCell(LEDGER_FIRST_COL + index);
    cell.value = label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = TITLE_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = GRID_BORDER;
  });
  headerRow.height = LEDGER_ROW_HEIGHT;

  for (let col = LEDGER_FIRST_COL; col <= LEDGER_LAST_COL; col += 1) worksheet.getColumn(col).width = LEDGER_COLUMN_WIDTH;

  const ARTICLE_COL = LEDGER_FIRST_COL + 1;

  let currentRow = LEDGER_FIRST_DATA_ROW;
  groups.forEach((group, groupIndex) => {
    const startRow = currentRow;
    const shouldStripe = groupIndex % 2 === 1;

    if (group.lots.length === 0) {
      const row = worksheet.getRow(currentRow);
      const articleCell = row.getCell(ARTICLE_COL);
      articleCell.value = "Vide";
      articleCell.font = { italic: true, color: { argb: "FF86917F" } };
      articleCell.alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) articleCell.fill = ZEBRA_FILL;
      row.getCell(LEDGER_FIRST_COL + 2).value = "—";
      row.getCell(LEDGER_FIRST_COL + 3).value = "—";
      row.getCell(LEDGER_FIRST_COL + 4).value = "—";
      const emptyTotalCell = row.getCell(LEDGER_FIRST_COL + 5);
      emptyTotalCell.value = "—";
      emptyTotalCell.alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) emptyTotalCell.fill = ZEBRA_FILL;
      currentRow += 1;
    } else {
      group.lots.forEach((lot) => {
        const row = worksheet.getRow(currentRow);
        // Article et Quantité silo (colonnes fusionnables) sont renseignées plus bas, une fois par groupe.
        row.getCell(LEDGER_FIRST_COL + 2).value = formatLedgerDate(lot.entryDate);
        row.getCell(LEDGER_FIRST_COL + 3).value = lot.lotNumber || "—";
        // « Quantité par lot » = ce qu'il reste DE CE LOT précisément (et non la quantité produite à l'origine).
        row.getCell(LEDGER_FIRST_COL + 4).value = lot.remainingQuantity;
        row.getCell(LEDGER_FIRST_COL + 4).numFmt = '0.00" T"';
        currentRow += 1;
      });
    }

    const endRow = currentRow - 1;
    for (let r = startRow; r <= endRow; r += 1) {
      const row = worksheet.getRow(r);
      row.height = LEDGER_ROW_HEIGHT;
      for (let col = LEDGER_FIRST_COL; col <= LEDGER_LAST_COL; col += 1) row.getCell(col).border = GRID_BORDER;
      if (shouldStripe) {
        for (let col = LEDGER_FIRST_COL + 2; col < LEDGER_LAST_COL; col += 1) row.getCell(col).fill = ZEBRA_FILL;
      }
    }

    // Une cellule fusionnée ne peut être stylée (ou revalorisée) que via sa
    // cellule maîtresse (coin haut-gauche) : on fusionne d'abord, puis on la
    // stylise. Ordre appliqué au silo (tout le groupe), à l'article
    // (uniquement les lots consécutifs qui le partagent) et à la quantité
    // silo (somme des lots restants, une fois pour tout le groupe).
    if (endRow > startRow) worksheet.mergeCells(startRow, LEDGER_FIRST_COL, endRow, LEDGER_FIRST_COL);
    const siloCell = worksheet.getCell(startRow, LEDGER_FIRST_COL);
    siloCell.value = group.silo;
    siloCell.font = { bold: true };
    siloCell.alignment = { vertical: "middle", horizontal: "center" };
    if (shouldStripe) siloCell.fill = ZEBRA_FILL;

    let runStart = startRow;
    group.lots.forEach((lot, lotIndex) => {
      const isLastOfGroup = lotIndex === group.lots.length - 1;
      const sharesNextArticle = !isLastOfGroup && group.lots[lotIndex + 1].article === lot.article;
      if (sharesNextArticle) return;
      const runEnd = startRow + lotIndex;
      if (runEnd > runStart) worksheet.mergeCells(runStart, ARTICLE_COL, runEnd, ARTICLE_COL);
      const articleCell = worksheet.getCell(runStart, ARTICLE_COL);
      articleCell.value = lot.article;
      articleCell.alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) articleCell.fill = ZEBRA_FILL;
      runStart = runEnd + 1;
    });

    if (group.lots.length > 0) {
      // « Quantité silo » = la somme de ce qu'il reste sur TOUS les lots de ce silo (exemple demandé : 14,78 + 10 = 24,78).
      const siloRemaining = group.lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
      if (endRow > startRow) worksheet.mergeCells(startRow, LEDGER_FIRST_COL + 5, endRow, LEDGER_FIRST_COL + 5);
      const siloTotalCell = worksheet.getCell(startRow, LEDGER_FIRST_COL + 5);
      siloTotalCell.value = siloRemaining;
      siloTotalCell.numFmt = '0.00" T"';
      siloTotalCell.font = { bold: true };
      siloTotalCell.alignment = { vertical: "middle", horizontal: "center" };
      if (shouldStripe) siloTotalCell.fill = ZEBRA_FILL;
    }
  });

  if (currentRow > LEDGER_FIRST_DATA_ROW) {
    worksheet.autoFilter = {
      from: { row: LEDGER_HEADER_ROW, column: LEDGER_FIRST_COL },
      to: { row: currentRow - 1, column: LEDGER_LAST_COL },
    };
  }

  const totalRowNumber = currentRow;
  const totalRow = worksheet.getRow(totalRowNumber);
  totalRow.getCell(LEDGER_FIRST_COL).value = "Total";
  totalRow.getCell(LEDGER_FIRST_COL).font = { bold: true };
  worksheet.mergeCells(totalRowNumber, LEDGER_FIRST_COL, totalRowNumber, LEDGER_FIRST_COL + 3);
  const totalCell = totalRow.getCell(LEDGER_FIRST_COL + 5);
  if (totalRowNumber > LEDGER_FIRST_DATA_ROW) {
    const remainingColLetter = columnLetter(LEDGER_FIRST_COL + 5);
    const formula = `SUM(${remainingColLetter}${LEDGER_FIRST_DATA_ROW}:${remainingColLetter}${totalRowNumber - 1})`;
    totalCell.value = { formula, result: totalRemaining } as ExcelJS.CellFormulaValue;
  } else {
    totalCell.value = 0;
  }
  totalCell.numFmt = '0.00" T"';
  totalCell.font = { bold: true };
  totalRow.height = LEDGER_ROW_HEIGHT;
  for (let col = LEDGER_FIRST_COL; col <= LEDGER_LAST_COL; col += 1) totalRow.getCell(col).border = GRID_BORDER;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
