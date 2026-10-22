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
import { createRequire } from "node:module";

// ExcelJS convertit en date le résultat de TOUTE formule dont la cellule a un format horaire,
// même un texte : « Changement article DG2 → CG3 (0:30) » dans une Observation au format h:mm
// devenait « Invalid Date » et le texte était perdu. Un texte non numérique est désormais
// laissé tel quel ; les nombres (vraies heures) sont toujours convertis.
const excelUtils = createRequire(import.meta.url)("exceljs/lib/utils/utils.js") as { excelToDate: (value: unknown, date1904?: boolean) => unknown; textResultPatched?: boolean };
if (!excelUtils.textResultPatched) {
  const excelToDate = excelUtils.excelToDate;
  excelUtils.excelToDate = (value, date1904) => (typeof value === "string" && Number.isNaN(Number(value)) ? value : excelToDate(value, date1904));
  excelUtils.textResultPatched = true;
}

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
/** restDays : journées dont le tableau ne porte qu'une remarque « JOUR DE REPOS ». */
export type ParsedProgramWorkbook = { days: ParsedProgramDay[]; errors: string[]; restDays: string[] };

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
  // Formule : son résultat enregistré tel quel. cell.text le reformaterait selon le format
  // de la cellule — un texte calculé dans une cellule au format h:mm devient « Invalid Date ».
  if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
    const result = (value as ExcelJS.CellFormulaValue).result;
    if (typeof result === "string") return result.trim();
    if (typeof result === "number") return String(result);
    return "";
  }
  if (typeof value === "object" && "richText" in (value as { richText?: unknown })) {
    return (value as { richText: { text: string }[] }).richText.map((part) => part.text).join("").trim();
  }
  try {
    return String(cell.text ?? "").trim();
  } catch {
    return "";
  }
}

/** Valeur affichée d'une cellule : pour une formule (=TIME(6;30;0), =H14…), le résultat calculé enregistré par Excel. */
function cellResult(cell: ExcelJS.Cell | undefined): ExcelJS.CellValue | undefined {
  const value = cell?.value;
  if (value && typeof value === "object" && !(value instanceof Date) && ("formula" in value || "sharedFormula" in value)) {
    return (value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue | undefined;
  }
  return value;
}

/** Formule sans résultat enregistré (fichier jamais recalculé ni enregistré par Excel) : sa valeur est illisible. */
function isUncomputedFormula(cell: ExcelJS.Cell | undefined): boolean {
  const value = cell?.value;
  return Boolean(value && typeof value === "object" && ("formula" in value || "sharedFormula" in value) && cellResult(cell) === undefined);
}

/** Heures stockées comme date Excel (sérialisées depuis 1899-12-30), en texte libre ("06:30") ou calculées par une formule. */
function readTime(cell: ExcelJS.Cell | undefined): string | undefined {
  const value = cellResult(cell);
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
  const text = typeof value === "string" ? value.trim() : readText(cell);
  const match = text.match(/^(\d{1,2})[:h](\d{2})/i);
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

const REST_DAY_NOTE_RE = /\brepos\b/i;

function foldText(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function minutesOf(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function addMinutes(time: string, minutes: number) {
  const total = (((minutesOf(time) + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type ChangeoverMinutes = { article: number; filiere: number };

/**
 * Temps standards de changement de la feuille « Paramètres » du classeur (libellé
 * « Changement d'article » / « Changement de filière » suivi de sa durée), sinon 0:30 et 2:00.
 */
function readChangeoverMinutes(workbook: ExcelJS.Workbook): ChangeoverMinutes {
  const found: ChangeoverMinutes = { article: 30, filiere: 120 };
  for (const worksheet of workbook.worksheets) {
    if (!foldText(worksheet.name).startsWith("parametre")) continue;
    worksheet.eachRow((row) => {
      row.eachCell((cell, col) => {
        const label = foldText(readText(cell));
        const key = /changement\s+d.?\s*article/.test(label) ? "article" : /changement\s+de\s+filiere/.test(label) ? "filiere" : undefined;
        const duration = key && readTime(row.getCell(col + 1));
        if (key && duration) found[key] = minutesOf(duration);
      });
    });
  }
  return found;
}

/** Durée d'une remarque de changement saisie sans horaire (« changement Filière ⌀ 3.5 mm »), ou undefined. */
function changeoverDuration(note: string, standards: ChangeoverMinutes): number | undefined {
  const folded = foldText(note);
  if (!folded.includes("changement")) return undefined;
  if (folded.includes("filiere")) return standards.filiere;
  if (folded.includes("article")) return standards.article;
  return undefined;
}

export async function parseDailyProgramWorkbook(buffer: Buffer): Promise<ParsedProgramWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const changeoverStandards = readChangeoverMinutes(workbook);

  const days: ParsedProgramDay[] = [];
  /** Feuille d'origine de chaque journée (même ordre que `days`), pour nommer les doublons de date. */
  const daySheets: string[] = [];
  const errors: string[] = [];
  const restDays = new Set<string>();

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
      daySheets.push(worksheet.name);
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

      const sequenceValue = cellResult(row.getCell(columns.sequence));
      const sequence = typeof sequenceValue === "number" ? sequenceValue : Number(readText(row.getCell(columns.sequence)));
      const plannedStart = readTime(row.getCell(columns.start));
      const plannedEnd = readTime(row.getCell(columns.end));
      // Ligne du modèle laissée vide : seul son N° est pré-rempli, et ses formules d'heure
      // renvoient une valeur vide tant qu'aucun article n'est saisi. Rien à planifier.
      const hasPlanningContent = [columns.article, columns.version, columns.bag, columns.bulk, columns.start, columns.end]
        .some((column) => readText(row.getCell(column)) !== "" || cellResult(row.getCell(column)) instanceof Date);
      if (!hasPlanningContent) {
        const note = readText(row.getCell(columns.observation));
        if (!note) continue;
        const previous = current.lines[current.lines.length - 1];
        // « JOUR DE REPOS » seul dans le tableau : la journée est un jour de repos.
        if (!previous && REST_DAY_NOTE_RE.test(note)) {
          restDays.add(current.programDate);
          continue;
        }
        // Remarque de changement après le dernier article (le modèle ne calcule ses heures que
        // si un article suit) : elle commence à la fin de la ligne précédente et dure le temps
        // standard du changement indiqué dans la feuille Paramètres.
        const duration = changeoverDuration(note, changeoverStandards);
        if (previous && duration !== undefined) {
          current.lines.push({
            sequence: Number.isFinite(sequence) && sequence > 0 ? sequence : previous.sequence + 1,
            article: null,
            version: null,
            bagQuantity: null,
            bulkQuantity: null,
            plannedStart: previous.plannedEnd,
            plannedEnd: addMinutes(previous.plannedEnd, duration),
            observation: note,
          });
          continue;
        }
        // Toute autre remarque sans horaire ne peut pas devenir une ligne de planning :
        // simplement signalée, pour qu'elle ne disparaisse pas sans un mot.
        errors.push(`Feuille "${worksheet.name}", ligne ${r} : remarque « ${note} » sans horaire, non importée.`);
        continue;
      }
      if (!Number.isFinite(sequence) || !plannedStart || !plannedEnd) {
        const uncomputed = [columns.sequence, columns.start, columns.end].some((column) => isUncomputedFormula(row.getCell(column)));
        errors.push(uncomputed
          ? `Feuille "${worksheet.name}", ligne ${r} : heure ou N° calculé par une formule sans résultat enregistré, ligne ignorée. Ouvrez le fichier dans Excel et enregistrez-le pour que les formules soient calculées.`
          : `Feuille "${worksheet.name}", ligne ${r} : ligne de planning illisible (N°, heure de début ou de fin manquante), ignorée.`);
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
  const sheetsByDate = new Map<string, string[]>();
  days.forEach((day, index) => sheetsByDate.set(day.programDate, [...(sheetsByDate.get(day.programDate) ?? []), daySheets[index]]));
  Array.from(sheetsByDate.entries()).forEach(([programDate, sheets]) => {
    if (sheets.length < 2) return;
    const shown = programDate.split("-").reverse().join("/");
    const names = sheets.map((name) => `« ${name} »`).join(", ");
    errors.push(`Le ${shown} est écrit dans ${sheets.length} feuilles (${names}) : seule la dernière (« ${sheets[sheets.length - 1]} ») sera conservée. Vérifiez la date indiquée en haut des autres feuilles.`);
  });

  // Seule la dernière feuille d'une date est conservée : un repos qu'elle remplace par des lignes n'en est plus un.
  const keptDays = new Map(days.map((day) => [day.programDate, day]));
  return { days, errors, restDays: Array.from(restDays).filter((date) => keptDays.get(date)?.lines.length === 0) };
}
