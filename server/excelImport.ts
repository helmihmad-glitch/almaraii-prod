import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { productionRecords } from "../drizzle/schema";
import { addProductionArticle, createProductionRecord, deleteProductionRecord, getDb, listProductionRecords, updateProductionRecord } from "./db";

export type ImportedProductionRow = {
  rowNumber: number;
  id?: number;
  productionDate: string;
  article: string;
  totalProductionHours: number;
  plannedStopsHours: number;
  unplannedStopsHours: number;
  productionTons: number;
  wasteTons: number;
  standardRate: number;
  comment?: string;
};

type ParsedImport = { rows: ImportedProductionRow[]; errors: string[]; restDays: string[] };

type ProductionFingerprintInput = {
  productionDate: string;
  article: string;
  totalProductionHours: number | string;
  plannedStopsHours: number | string;
  unplannedStopsHours: number | string;
  productionTons: number | string;
  wasteTons: number | string;
  standardRate: number | string;
  comment?: string | null;
};

const requiredHeaders = {
  date: ["DATE", "DATEDEPRODUCTION", "JOUR"],
  article: ["ARTICLE", "ARTICLES", "PRODUIT", "PRODUITS", "CODEARTICLE", "DESIGNATION"],
  totalProductionHours: ["TEMPSTOTALPRODH", "TEMPSTOTALPRODHPARARTICLE", "TEMPSTOTALPRODUCTION", "TEMPSTOTALPRODUCTIONH", "TEMPSTOTALPRODUCTIONPARARTICLE", "TEMPSPRODH", "TEMPSPRODUCTION", "TEMPSPRODUCTIONH", "TEMPSDEPRODUCTION", "TEMPSDEPRODUCTIONH", "DUREEPROD", "DUREEPRODH", "DUREEDEPRODUCTION", "DUREEDEPRODUCTIONH", "HEURESPROD", "HEURESPRODUCTION", "NBHEURESPROD"],
  plannedStopsHours: ["ARRETSPLANH"],
  unplannedStopsHours: ["ARRETSNONPLH"],
  productionTons: ["PRODT", "PRODUCTIONT"],
  wasteTons: ["REBUTST"],
  standardRate: ["CADENCESTD", "CADENCESTDDARTICLE"],
} as const;

const optionalHeaders = {
  realHours: ["HRELLES", "HREELLES", "HEURESRELLES", "HEUREREELLES", "TEMPSREEL", "TEMPSREELH"],
} as const;

const frenchMonthNumbers: Record<string, string> = {
  janv: "01", janvier: "01", fev: "02", fevr: "02", fevrier: "02", mars: "03", avr: "04", avril: "04", mai: "05", juin: "06", juil: "07", juillet: "07", aout: "08", sept: "09", septembre: "09", oct: "10", octobre: "10", nov: "11", novembre: "11", dec: "12", decembre: "12",
};

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function matchesHeader(header: string, aliases: readonly string[]) {
  return aliases.some((alias) => header === alias || header.startsWith(alias) || (alias.length >= 5 && header.includes(alias)));
}

function readCellText(cell: ExcelJS.Cell) {
  try {
    return cell.text?.trim() ?? "";
  } catch {
    const value = cell.value;
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  }
}

function parseNumeric(value: ExcelJS.CellValue, text: string) {
  if (typeof value === "number") return value;
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toIsoDate(value: ExcelJS.CellValue, text: string, fallbackYear?: number): string | undefined {
  // Getters UTC, pas locaux : voir la note équivalente sur readDate dans siloExcel.ts.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const french = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (french) return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`;
  const localized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\./g, "").match(/^(\d{1,2})[-\s]([a-z]+)/);
  const month = localized ? frenchMonthNumbers[localized[2]] : undefined;
  if (localized && month && fallbackYear) return `${fallbackYear}-${month}-${localized[1].padStart(2, "0")}`;
  return undefined;
}

function findSheetYear(worksheet: ExcelJS.Worksheet) {
  const firstRows = Array.from({ length: Math.min(8, worksheet.rowCount) }, (_, index) => {
    const values = worksheet.getRow(index + 1).values;
    return Array.isArray(values) ? values.map((value) => String(value ?? "")).join(" ") : "";
  }).join(" ");
  const year = `${firstRows} ${worksheet.name}`.match(/(20\d{2})/)?.[1];
  return year ? Number(year) : undefined;
}

function findHeaderRow(worksheet: ExcelJS.Worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(100, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rowValues = Array.isArray(row.values) ? row.values : [];
    const headers = rowValues.map((value: ExcelJS.CellValue) => normalizeHeader(String(value ?? "")));
    if (headers.some((header) => matchesHeader(header, requiredHeaders.date)) && headers.some((header) => matchesHeader(header, requiredHeaders.article))) return row;
  }
  return undefined;
}

function calculateRow(row: ImportedProductionRow) {
  const realHours = Math.max(row.totalProductionHours - row.plannedStopsHours - row.unplannedStopsHours, 0);
  const availability = row.totalProductionHours > 0 ? Math.max((row.totalProductionHours - row.unplannedStopsHours) / row.totalProductionHours, 0) : 0;
  const performance = realHours > 0 ? row.productionTons / (realHours * row.standardRate) : 0;
  const quality = row.productionTons > 0 ? Math.max((row.productionTons - row.wasteTons) / row.productionTons, 0) : 1;
  return {
    productionDate: row.productionDate,
    article: row.article,
    totalProductionHours: row.totalProductionHours.toFixed(2),
    plannedStopsHours: row.plannedStopsHours.toFixed(2),
    unplannedStopsHours: row.unplannedStopsHours.toFixed(2),
    productionTons: row.productionTons.toFixed(2),
    wasteTons: row.wasteTons.toFixed(2),
    standardRate: row.standardRate.toFixed(2),
    availability: availability.toFixed(6),
    performance: performance.toFixed(6),
    quality: quality.toFixed(6),
    trs: (availability * performance * quality).toFixed(6),
    realHours: realHours.toFixed(2),
    comment: row.comment?.trim() || null,
    source: "excel-import",
  };
}

/** Empreinte stable des données métier : source et indicateurs recalculés sont volontairement exclus. */
export function productionRowFingerprint(row: ProductionFingerprintInput) {
  const number = (value: number | string) => Number(value).toFixed(2);
  const comment = (row.comment ?? "").trim().replace(/\s+/g, " ");
  return [
    row.productionDate,
    row.article.trim().toUpperCase(),
    number(row.totalProductionHours),
    number(row.plannedStopsHours),
    number(row.unplannedStopsHours),
    number(row.productionTons),
    number(row.wasteTons),
    number(row.standardRate),
    comment,
  ].join("|");
}

export async function parseImportedWorkbook(buffer: Buffer): Promise<ParsedImport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  if (workbook.worksheets.length === 0) return { rows: [], errors: ["Le fichier Excel ne contient aucune feuille."], restDays: [] };
  const rows: ImportedProductionRow[] = [];
  const errors: string[] = [];
  const restDaySet = new Set<string>();
  let foundRegistrySheet = false;
  for (const worksheet of workbook.worksheets) {
    const headerRow = findHeaderRow(worksheet);
    if (!headerRow) continue;
    foundRegistrySheet = true;
    const sheetYear = findSheetYear(worksheet);
    // Première occurrence gagnante : certaines feuilles répètent un intitulé (ex. un
    // second « Date » dans un bloc d'analyse plus loin sur la ligne) — la colonne du
    // registre, toujours la plus à gauche, ne doit jamais être écrasée par un doublon.
    const headerIndexes = new Map<string, number>();
    headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const normalized = normalizeHeader(readCellText(cell));
      if (!headerIndexes.has(normalized)) headerIndexes.set(normalized, columnNumber);
    });
    const findColumn = (aliases: readonly string[]) => Array.from(headerIndexes.entries()).find(([header]) => matchesHeader(header, aliases))?.[1];
    const columns = Object.fromEntries(Object.entries(requiredHeaders).map(([key, aliases]) => [key, findColumn(aliases)])) as Record<keyof typeof requiredHeaders, number | undefined>;
    const realHoursColumn = findColumn(optionalHeaders.realHours);
    const missingHeaders = Object.entries(columns).filter(([key, column]) => !column && !(key === "totalProductionHours" && realHoursColumn)).map(([key]) => key);
    if (missingHeaders.length) {
      errors.push(`Feuille ${worksheet.name} : colonnes obligatoires manquantes : ${missingHeaders.join(", ")}.`);
      continue;
    }
    const idColumn = findColumn(["ID"]);
    const commentColumn = findColumn(["COMMENTAIRE", "COMMENT"]);
    for (let rowNumber = headerRow.number + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const articleCell = row.getCell(columns.article!);
      const article = readCellText(articleCell).toUpperCase();
      const dateCell = row.getCell(columns.date!);
      if (!article && !readCellText(dateCell)) continue;
      const productionDate = toIsoDate(dateCell.value, readCellText(dateCell), sheetYear);
      // Un jour marqué « Repos » reste signalé par les règles de validation ci-dessous
      // (comportement voulu : l'utilisateur voit la ligne dans l'import), mais est
      // capturé à part pour s'afficher comme jour de repos dans Rapports plutôt que
      // de rester une simple erreur silencieuse.
      if (article === "REPOS" && productionDate) restDaySet.add(productionDate);
      const asZeroWhenBlank = (column: number | undefined) => {
        if (!column) return 0;
        const cell = row.getCell(column);
        const value = parseNumeric(cell.value, readCellText(cell));
        return Number.isNaN(value) && !readCellText(cell) ? 0 : value;
      };
      const plannedStopsHours = asZeroWhenBlank(columns.plannedStopsHours);
      const unplannedStopsHours = asZeroWhenBlank(columns.unplannedStopsHours);
      const importedRealHours = realHoursColumn ? parseNumeric(row.getCell(realHoursColumn).value, readCellText(row.getCell(realHoursColumn))) : Number.NaN;
      const values = {
        totalProductionHours: columns.totalProductionHours ? parseNumeric(row.getCell(columns.totalProductionHours).value, readCellText(row.getCell(columns.totalProductionHours))) : importedRealHours + plannedStopsHours + unplannedStopsHours,
        plannedStopsHours,
        unplannedStopsHours,
        productionTons: parseNumeric(row.getCell(columns.productionTons!).value, readCellText(row.getCell(columns.productionTons!))),
        wasteTons: asZeroWhenBlank(columns.wasteTons),
        standardRate: parseNumeric(row.getCell(columns.standardRate!).value, readCellText(row.getCell(columns.standardRate!))),
      };
      if (!productionDate || !article || Object.values(values).some((value: number) => !Number.isFinite(value))) {
        errors.push(`Feuille ${worksheet.name}, ligne ${rowNumber} : date, article ou valeurs numériques invalides.`);
        continue;
      }
      if (values.totalProductionHours <= 0 || values.productionTons <= 0 || values.standardRate <= 0 || values.plannedStopsHours < 0 || values.unplannedStopsHours < 0 || values.wasteTons < 0 || values.wasteTons > values.productionTons || values.plannedStopsHours + values.unplannedStopsHours > values.totalProductionHours) {
        errors.push(`Feuille ${worksheet.name}, ligne ${rowNumber} : les temps, la production ou les rebuts ne respectent pas les règles du registre.`);
        continue;
      }
      const idValue = idColumn ? parseNumeric(row.getCell(idColumn).value, readCellText(row.getCell(idColumn))) : Number.NaN;
      rows.push({ rowNumber, id: Number.isInteger(idValue) && idValue > 0 ? idValue : undefined, productionDate, article, ...values, comment: commentColumn ? readCellText(row.getCell(commentColumn)) : undefined });
    }
  }
  if (!foundRegistrySheet) return { rows: [], errors: ["Les en-têtes de date et d’article sont introuvables dans les cent premières lignes de toutes les feuilles du fichier."], restDays: [] };
  return { rows, errors, restDays: Array.from(restDaySet) };
}

type ExistingProductionRecord = ProductionFingerprintInput & { id: number };

export type ImportDecision =
  | { kind: "unchanged"; row: ImportedProductionRow }
  | { kind: "create"; row: ImportedProductionRow; values: ReturnType<typeof calculateRow> }
  | { kind: "update"; row: ImportedProductionRow; existingId: number; before: ExistingProductionRecord; values: ReturnType<typeof calculateRow> }
  | { kind: "delete"; record: ExistingProductionRecord };

/** Même jour + même article : la ligne du fichier remplace celle du registre (demande de l'utilisateur). */
function dayArticleKey(productionDate: string, article: string) {
  return `${productionDate}::${article.trim().toUpperCase()}`;
}

/**
 * Compare les lignes importées à l'état actuel du registre, sans rien écrire.
 * Une ligne existante n'est jamais associée à deux lignes importées à la fois
 * (claimedIds) : chaque ligne du fichier est mise en correspondance avec au
 * plus une ligne du registre, dans cet ordre —
 *   1. même ID (colonne ID du fichier, rarement présente) ;
 *   2. même jour, même article ET même production : deux lots du même article
 *      le même jour (ex. 40 T et 10 T) retrouvent chacun le leur ;
 *   3. à défaut, même jour et même article : la ligne du fichier remplace celle
 *      du registre (ex. CM1 du 21/10 passé de 100 T à 105 T dans le fichier).
 *   Dans chaque étape, les lignes existantes sont prises de la plus ancienne à
 *   la plus récente.
 * Une ligne sans correspondance est "create". Une ligne mise en correspondance
 * dont le contenu (hors indicateurs recalculés) est identique est "unchanged"
 * (jamais réimportée en double) ; sinon "update". Une ligne du registre restée
 * sans correspondance alors que le fichier a ce jour et cet article est
 * remplacée par le fichier : "delete". Modifications et suppressions ne sont
 * jamais appliquées sans confirmation — voir previewProductionImport et
 * importProductionRows.
 */
function planImportDecisions(rows: ImportedProductionRow[], existing: ExistingProductionRecord[]): ImportDecision[] {
  const byId = new Map(existing.map((record) => [record.id, record]));
  const byDayArticle = new Map<string, ExistingProductionRecord[]>();
  for (const record of existing) {
    const key = dayArticleKey(record.productionDate, record.article);
    byDayArticle.set(key, [...(byDayArticle.get(key) ?? []), record]);
  }
  for (const group of Array.from(byDayArticle.values())) group.sort((a, b) => a.id - b.id);
  const claimedIds = new Set<number>();
  const allValues = rows.map((row) => calculateRow(row));
  const matches: (ExistingProductionRecord | undefined)[] = rows.map(() => undefined);
  const claim = (index: number, record: ExistingProductionRecord | undefined) => {
    if (!record || matches[index] || claimedIds.has(record.id)) return;
    matches[index] = record;
    claimedIds.add(record.id);
  };
  rows.forEach((row, index) => { if (row.id) claim(index, byId.get(row.id)); });
  const candidates = (index: number) => (byDayArticle.get(dayArticleKey(allValues[index].productionDate, allValues[index].article)) ?? []).filter((record) => !claimedIds.has(record.id));
  rows.forEach((_, index) => {
    if (!matches[index]) claim(index, candidates(index).find((record) => Number(record.productionTons).toFixed(2) === allValues[index].productionTons));
  });
  rows.forEach((_, index) => { if (!matches[index]) claim(index, candidates(index)[0]); });
  // Deux lignes identiques dans le même fichier (copier-coller involontaire, sans
  // correspondance existante) ne doivent pas non plus créer deux lignes.
  const seenNewFingerprints = new Set<string>();

  const decisions: ImportDecision[] = [];
  rows.forEach((row, index) => {
    const values = allValues[index];
    const existingRecord = matches[index];
    // Fichier sans colonne Commentaire (cas du Dashboard_Production) : le commentaire
    // saisi sur le site est conservé, jamais effacé par l'import.
    if (row.comment === undefined && existingRecord) values.comment = existingRecord.comment?.trim() || null;
    const fingerprint = productionRowFingerprint(values);

    if (existingRecord) {
      if (productionRowFingerprint(existingRecord) === fingerprint) {
        decisions.push({ kind: "unchanged", row });
      } else {
        decisions.push({ kind: "update", row, existingId: existingRecord.id, before: existingRecord, values });
      }
    } else if (seenNewFingerprints.has(fingerprint)) {
      decisions.push({ kind: "unchanged", row });
    } else {
      decisions.push({ kind: "create", row, values });
      seenNewFingerprints.add(fingerprint);
    }
  });
  const fileDayArticles = new Set(allValues.map((values) => dayArticleKey(values.productionDate, values.article)));
  for (const record of existing) {
    if (!claimedIds.has(record.id) && fileDayArticles.has(dayArticleKey(record.productionDate, record.article))) decisions.push({ kind: "delete", record });
  }
  return decisions;
}

async function loadExistingProductionRecords(): Promise<ExistingProductionRecord[]> {
  const db = await getDb();
  return db ? await db.select().from(productionRecords) : await listProductionRecords();
}

const CHANGE_FIELDS: Array<{ field: keyof ProductionFingerprintInput; label: string }> = [
  { field: "productionDate", label: "Date" },
  { field: "article", label: "Article" },
  { field: "totalProductionHours", label: "Temps total prod. (h)" },
  { field: "plannedStopsHours", label: "Arrêts plan. (h)" },
  { field: "unplannedStopsHours", label: "Arrêts non pl. (h)" },
  { field: "productionTons", label: "Production (T)" },
  { field: "wasteTons", label: "Rebuts (T)" },
  { field: "standardRate", label: "Cadence std" },
  { field: "comment", label: "Commentaire" },
];

function formatChangeValue(field: keyof ProductionFingerprintInput, value: unknown): string {
  if (field === "productionDate" || field === "article") return String(value ?? "");
  if (field === "comment") return String(value ?? "").trim() || "—";
  return Number(value).toFixed(2);
}

/** Ne garde que les champs dont la valeur affichée diffère réellement entre l'ancienne et la nouvelle ligne. */
function describeChanges(before: ExistingProductionRecord, after: ReturnType<typeof calculateRow>) {
  return CHANGE_FIELDS
    .map(({ field, label }) => ({ field, label, before: formatChangeValue(field, before[field]), after: formatChangeValue(field, after[field]) }))
    .filter((change) => change.before !== change.after);
}

export type ProductionImportPreview = {
  toCreate: number;
  toUpdate: Array<{ id: number; productionDate: string; article: string; changes: Array<{ field: string; label: string; before: string; after: string }> }>;
  unchanged: number;
  /** Lignes du registre remplacées par le fichier (même jour, même article) et supprimées. */
  toDelete: Array<{ id: number; productionDate: string; article: string; productionTons: string }>;
};

/**
 * Aperçu d'un import Excel, sans écrire quoi que ce soit : combien de lignes
 * seraient ajoutées, combien correspondent à une modification d'une ligne
 * existante (avec le détail des champs qui changeraient) et combien sont déjà
 * identiques et n'apporteraient rien. Sert à demander la permission de
 * l'utilisateur avant de modifier une ancienne saisie (voir Registry.tsx).
 */
export async function previewProductionImport(rows: ImportedProductionRow[]): Promise<ProductionImportPreview> {
  const decisions = planImportDecisions(rows, await loadExistingProductionRecords());
  const toUpdate = decisions
    .filter((decision): decision is Extract<ImportDecision, { kind: "update" }> => decision.kind === "update")
    .map((decision) => ({ id: decision.existingId, productionDate: decision.values.productionDate, article: decision.values.article, changes: describeChanges(decision.before, decision.values) }));
  return {
    toCreate: decisions.filter((decision) => decision.kind === "create").length,
    toUpdate,
    unchanged: decisions.filter((decision) => decision.kind === "unchanged").length,
    toDelete: decisions
      .filter((decision): decision is Extract<ImportDecision, { kind: "delete" }> => decision.kind === "delete")
      .map(({ record }) => ({ id: record.id, productionDate: record.productionDate, article: record.article, productionTons: Number(record.productionTons).toFixed(2) })),
  };
}

/**
 * Applique un import Excel : les lignes nouvelles sont toujours ajoutées et
 * les doublons (par ID inchangé ou par contenu identique) toujours ignorés,
 * mais une ligne qui modifierait ou remplacerait (suppression) une ligne existante n'est écrite que si
 * `applyModifications` vaut true — après que l'utilisateur a confirmé
 * l'aperçu de previewProductionImport ci-dessus. Par défaut à true pour les
 * appels directs (scripts, tests) ; le routeur tRPC passe explicitement false
 * tant que l'utilisateur n'a pas confirmé.
 */
export async function importProductionRows(rows: ImportedProductionRow[], options: { applyModifications?: boolean } = {}) {
  const applyModifications = options.applyModifications ?? true;
  const db = await getDb();
  const decisions = planImportDecisions(rows, await loadExistingProductionRecords());
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;
  let pendingModifications = 0;
  for (const decision of decisions) {
    if (decision.kind === "unchanged") {
      skipped += 1;
      continue;
    }
    if (decision.kind === "delete") {
      if (!applyModifications) {
        pendingModifications += 1;
        continue;
      }
      await deleteProductionRecord(decision.record.id);
      deleted += 1;
      continue;
    }
    if (decision.kind === "create") {
      if (db) {
        await db.insert(productionRecords).values(decision.values);
      } else {
        await createProductionRecord(decision.values);
      }
      created += 1;
    } else {
      if (!applyModifications) {
        pendingModifications += 1;
        continue;
      }
      if (db) {
        await db.update(productionRecords).set({ ...decision.values, updatedAt: new Date() }).where(eq(productionRecords.id, decision.existingId));
      } else {
        await updateProductionRecord(decision.existingId, decision.values);
      }
      updated += 1;
    }
    await addProductionArticle(decision.row.article);
  }
  return { created, updated, deleted, skipped, pendingModifications, total: rows.length };
}
