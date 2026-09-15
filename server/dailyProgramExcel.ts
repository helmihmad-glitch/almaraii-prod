// Import du classeur « Programme de Production » (Réf: For-Prod-09).
//
// Le classeur réel contient une feuille par mois/lot de jours, et CHAQUE
// feuille peut empiler plusieurs journées à la suite (un bloc « date : … »,
// « Pupitreur : … » puis un tableau, suivi d’une ligne vide, puis le bloc
// suivant). Le nom des feuilles n’est pas fiable pour retrouver la date : des
// feuilles observées portent un nom qui ne correspond pas à la date réelle
// écrite dans la cellule « date : » — on ne lit donc jamais que le contenu.
//
// Colonnes du tableau : N°, Article, Version, Quantité (Tonne) [Sac, Vrac],
// H début prévue, H fin prévue, Observation — retrouvées par leur intitulé
// (comme parseSiloWorkbook), pas par une position de colonne fixe, la ligne
// « Quantité (Tonne) » fusionnée au-dessus du couple Sac/Vrac n’étant pas la
// vraie ligne d’en-tête.

import ExcelJS from "exceljs";

export type ParsedProgramLine = {
  sequence: number;
  article: string | null;
  version: string | null;
  bagQuantity: string | null;
  bulkQuantity: string | null;
  plannedStart: string;
  plannedEnd: string;
  observation: string | null;
};

export type ParsedProgramDay = { programDate: string; operatorName: string; lines: ParsedProgramLine[] };
export type ParsedProgramWorkbook = { days: ParsedProgramDay[]; errors: string[] };

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function readText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return "";
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  if (value instanceof Date) return "";
  if (typeof value === "object" && "richText" in (value as { richText?: unknown })) {
    return (value as { richText: { text: string }[] }).richText.map((part) => part.text).join("").trim();
  }
  try {
    return String(cell.text ?? "").trim();
  } catch {
    return "";
  }
}

/** Heures stockées comme date Excel (sérialisées depuis 1899-12-30) ou en texte libre ("06:30"). */
function readTime(cell: ExcelJS.Cell | undefined): string | undefined {
  const value = cell?.value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hours = String(value.getUTCHours()).padStart(2, "0");
    const minutes = String(value.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  if (typeof value === "number") {
    const fraction = ((value % 1) + 1) % 1;
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  const match = readText(cell).match(/^(\d{1,2})[:h](\d{2})/i);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : undefined;
}

/** Renvoie le texte de la première cellule de la ligne qui correspond au motif, ou undefined. */
function findCellTextMatching(row: ExcelJS.Row, columnCount: number, pattern: RegExp): string | undefined {
  for (let col = 1; col <= columnCount; col += 1) {
    const text = readText(row.getCell(col));
    if (pattern.test(text)) return text;
  }
  return undefined;
}

function isRowEmpty(row: ExcelJS.Row, columnCount: number): boolean {
  for (let col = 1; col <= columnCount; col += 1) {
    if (readText(row.getCell(col))) return false;
  }
  return true;
}

const DATE_LABEL_RE = /date\s*:/i;
const PUPITREUR_LABEL_RE = /pupitreur\s*:/i;
/** Accepte un double slash accidentel ("01//09/2026"), observé dans le classeur réel. */
const DATE_VALUE_RE = /(\d{1,2})\s*\/+\s*(\d{1,2})\s*\/\s*(\d{4})/;
/** Fragments « de HH:MM à HH:MM » à retirer du texte du pupitreur : seuls les noms sont conservés. */
const SHIFT_RANGE_RE = /de\s*\d{1,2}[:h]\d{2}\s*[àa]\s*\d{1,2}[:h]\d{2}/gi;

function parseProgramDate(text: string): string | undefined {
  const match = text.match(DATE_VALUE_RE);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || day > 31 || month < 1 || month > 12) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Ne garde que les noms : les plages horaires par pupitreur ("de 06:00 à 15:00 Yosri") ne sont pas stockées. */
function parseOperatorNames(text: string): string[] {
  return text
    .replace(PUPITREUR_LABEL_RE, "")
    .replace(SHIFT_RANGE_RE, " ")
    .split(/[&\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

type ColumnMap = { sequence: number; article: number; version: number; bag: number; bulk: number; start: number; end: number; observation: number };
const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  sequence: ["N"],
  article: ["ARTICLE"],
  version: ["VERSION"],
  bag: ["SAC"],
  bulk: ["VRAC"],
  start: ["HDEBUTPREVUE", "HDEBUT"],
  end: ["HFINPREVUE", "HFIN"],
  observation: ["OBSERVATION"],
};

/** La vraie ligne d’en-tête a Sac ET Vrac ; la ligne fusionnée au-dessus n’a que « Quantité (Tonne) » répété. */
function findHeaderColumns(row: ExcelJS.Row, columnCount: number): ColumnMap | undefined {
  const found: Partial<Record<keyof ColumnMap, number>> = {};
  for (let col = 1; col <= columnCount; col += 1) {
    const header = normalizeHeader(readText(row.getCell(col)));
    if (!header) continue;
    for (const key of Object.keys(HEADER_ALIASES) as (keyof ColumnMap)[]) {
      if (found[key] === undefined && HEADER_ALIASES[key].includes(header)) found[key] = col;
    }
  }
  if (found.bag === undefined || found.bulk === undefined || found.sequence === undefined || found.start === undefined || found.end === undefined) return undefined;
  return found as ColumnMap;
}

export async function parseDailyProgramWorkbook(buffer: Buffer): Promise<ParsedProgramWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const days: ParsedProgramDay[] = [];
  const errors: string[] = [];

  for (const worksheet of workbook.worksheets) {
    const columnCount = Math.max(worksheet.columnCount, 9);
    let current: { programDate: string; operatorNames: string[]; lines: ParsedProgramLine[]; headerRow?: number } | null = null;
    let columns: ColumnMap | undefined;
    let awaitingHeader = false;

    const finalizeCurrent = () => {
      if (!current) return;
      if (!columns && current.lines.length === 0) {
        errors.push(`Feuille "${worksheet.name}" : tableau introuvable pour le ${current.programDate} (colonnes Sac/Vrac non trouvées).`);
      }
      days.push({ programDate: current.programDate, operatorName: current.operatorNames.join(" · "), lines: current.lines });
      current = null;
      columns = undefined;
      awaitingHeader = false;
    };

    for (let r = 1; r <= worksheet.rowCount; r += 1) {
      const row = worksheet.getRow(r);

      const dateCellText = findCellTextMatching(row, columnCount, DATE_LABEL_RE);
      if (dateCellText) {
        const programDate = parseProgramDate(dateCellText);
        // Une étiquette "date :" qui ne contient pas de date au format JJ/MM/AAAA est presque
        // toujours le cartouche du modèle ("Réf: For-Prod-09 … Date : 13-11-2025 … Page"), pas
        // une vraie journée : on l'ignore silencieusement plutôt que de signaler une fausse erreur
        // à chaque feuille.
        if (programDate) {
          finalizeCurrent();
          current = { programDate, operatorNames: [], lines: [] };
          awaitingHeader = true;
        }
        continue;
      }

      if (!current) continue;

      const pupitreurCellText = findCellTextMatching(row, columnCount, PUPITREUR_LABEL_RE);
      if (pupitreurCellText) {
        current.operatorNames = parseOperatorNames(pupitreurCellText);
        continue;
      }

      if (awaitingHeader) {
        const found = findHeaderColumns(row, columnCount);
        if (found) {
          columns = found;
          awaitingHeader = false;
        }
        continue;
      }

      if (!columns) continue;

      if (isRowEmpty(row, columnCount)) {
        finalizeCurrent();
        continue;
      }

      const sequence = Number(readText(row.getCell(columns.sequence)));
      const plannedStart = readTime(row.getCell(columns.start));
      const plannedEnd = readTime(row.getCell(columns.end));
      if (!Number.isFinite(sequence) || !plannedStart || !plannedEnd) {
        errors.push(`Feuille "${worksheet.name}", ligne ${r} : ligne de planning illisible (N°, heure de début ou de fin manquante), ignorée.`);
        continue;
      }

      current.lines.push({
        sequence,
        article: readText(row.getCell(columns.article)) || null,
        version: readText(row.getCell(columns.version)) || null,
        bagQuantity: readText(row.getCell(columns.bag)) || null,
        bulkQuantity: readText(row.getCell(columns.bulk)) || null,
        plannedStart,
        plannedEnd,
        observation: readText(row.getCell(columns.observation)) || null,
      });
    }

    finalizeCurrent();
  }

  // Deux feuilles peuvent revendiquer la même date (observé dans un classeur réel, avec des
  // lignes différentes selon la feuille) : on avertit plutôt que de laisser la dernière écraser
  // la précédente en silence.
  const occurrences = new Map<string, number>();
  for (const day of days) occurrences.set(day.programDate, (occurrences.get(day.programDate) ?? 0) + 1);
  Array.from(occurrences.entries()).forEach(([programDate, count]) => {
    if (count > 1) errors.push(`Le ${programDate} apparaît ${count} fois dans le classeur : seule la dernière occurrence sera conservée.`);
  });

  return { days, errors };
}
