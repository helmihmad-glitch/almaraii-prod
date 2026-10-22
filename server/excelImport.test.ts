import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { createProductionRecord, listProductionRecords, listRestDays, upsertRestDays } from "./db";
import { importProductionRows, parseImportedWorkbook, previewProductionImport, productionRowFingerprint } from "./excelImport";

async function buildWorkbook(values: unknown[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Registre journalier");
  worksheet.addRow(["DATE", "ARTICLE", "TEMPS TOTAL PROD. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL. (h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD", "COMMENTAIRE"]);
  worksheet.addRow(values);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("parseImportedWorkbook", () => {
  it("reconnaît une ligne strictement identique mais distingue une production différente le même jour", () => {
    const base = { productionDate: "2026-08-05", article: "CG3", totalProductionHours: 7, plannedStopsHours: 0, unplannedStopsHours: 1, productionTons: 60, wasteTons: 0, standardRate: 15, comment: "RAS" };
    const equivalent = { ...base, totalProductionHours: "7.00", productionTons: "60.00" };
    const distinct = { ...base, productionTons: 65 };

    expect(productionRowFingerprint(equivalent)).toBe(productionRowFingerprint(base));
    expect(productionRowFingerprint(distinct)).not.toBe(productionRowFingerprint(base));
  });

  it("lit les colonnes du registre, convertit la date et prépare une ligne importable", async () => {
    // Ancrée UTC : comme un vrai numéro de série Excel, sans fuseau (voir excelDate côté export).
    const buffer = await buildWorkbook([new Date(Date.UTC(2026, 7, 24)), "CM1", 12, 1, 0.5, 90, 2, 15, "Import validé"]);

    const parsed = await parseImportedWorkbook(buffer);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([expect.objectContaining({
      productionDate: "2026-08-24",
      article: "CM1",
      totalProductionHours: 12,
      plannedStopsHours: 1,
      unplannedStopsHours: 0.5,
      productionTons: 90,
      wasteTons: 2,
      standardRate: 15,
      comment: "Import validé",
    })]);
  });

  it("signale une ligne dont les arrêts excèdent le temps total", async () => {
    const buffer = await buildWorkbook(["24/08/2026", "CM1", 4, 3, 2, 30, 0, 15, ""]);

    const parsed = await parseImportedWorkbook(buffer);

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0]).toContain("ne respectent pas les règles du registre");
  });

  it("ignore un second intitulé Date répété plus loin sur la ligne d'en-têtes (bloc d'analyse) et garde la colonne du registre", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Septembre_2026");
    const header = ["DATE", "ARTICLE", "TEMPS TOTAL PROD. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL. (h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD"];
    while (header.length < 44) header.push(null);
    header.push("Date"); // bloc d'analyse annexe, sans rapport avec le registre
    worksheet.addRow(header);
    worksheet.addRow(["2026-09-01", "CM1", 10, 1, 0, 90, 0, 15]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([expect.objectContaining({ productionDate: "2026-09-01", article: "CM1" })]);
  });

  it("repère une ligne Article = Repos comme jour de repos tout en la gardant signalée dans les erreurs", async () => {
    const buffer = await buildWorkbook(["05/08/2026", "Repos", null, null, null, null, null, null, ""]);

    const parsed = await parseImportedWorkbook(buffer);

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0]).toContain("ne respectent pas les règles du registre");
    expect(parsed.restDays).toEqual(["2026-08-05"]);
  });

  it("persiste les jours de repos détectés à l'import sans dupliquer une date déjà connue (voir Rapports)", async () => {
    await upsertRestDays(["2026-08-05", "2026-08-12"]);
    await upsertRestDays(["2026-08-12", "2026-08-19"]); // 12/08 déjà connu : ne doit pas créer de doublon

    const restDays = await listRestDays();

    expect(restDays.filter((day) => day.restDate === "2026-08-12")).toHaveLength(1);
    expect(restDays.map((day) => day.restDate)).toEqual(expect.arrayContaining(["2026-08-05", "2026-08-12", "2026-08-19"]));
  });

  it("reconnaît des en-têtes placés après un titre et libellés Date de production et Produit", async () => {
    const workbook = new ExcelJS.Workbook();
    const coverSheet = workbook.addWorksheet("Couverture");
    coverSheet.addRow(["Rapport de production"]);
    const worksheet = workbook.addWorksheet("Saisie août");
    for (let index = 0; index < 12; index += 1) worksheet.addRow([`Information ${index + 1}`]);
    worksheet.addRow(["Date de production", "Produit", "Temps total prod. (h)", "Arrêts plan. (h)", "Arrêts non pl. (h)", "Production (T)", "Rebuts (T)", "Cadence std"]);
    worksheet.addRow(["24/08/2026", "DG3", 10, 1, 0, 90, 0, 15]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([expect.objectContaining({ productionDate: "2026-08-24", article: "DG3" })]);
  });

  it("reconnaît le temps total libellé Temps de production (heures)", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Import");
    worksheet.addRow(["Date", "Produit", "Temps de production (heures)", "Arrêts plan. (h)", "Arrêts non pl. (h)", "Production (T)", "Rebuts (T)", "Cadence std"]);
    worksheet.addRow(["24/08/2026", "CM1", 9, 1, 0, 75, 0, 15]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({ totalProductionHours: 9, article: "CM1" }));
  });

  it("accepte le mapping Date, article, prod(T), rebuts(t) et h.relles en déduisant le temps total", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Import");
    worksheet.addRow(["Date", "article", "h.relles", "arrêts plan.(h)", "arrêts non pl.(h)", "prod(T)", "rebuts(t)", "cadence std"]);
    worksheet.addRow(["24/08/2026", "CG3", 8.5, 1, 0.5, 100, 1, 15]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      productionDate: "2026-08-24",
      article: "CG3",
      totalProductionHours: 10,
      productionTons: 100,
      wasteTons: 1,
    }));
  });

  it("conserve les lignes valides et isole les lignes incohérentes dans le diagnostic", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Import");
    worksheet.addRow(["Date", "article", "Temps total prod. (h)", "arrêts plan.(h)", "arrêts non pl.(h)", "prod(T)", "rebuts(t)", "cadence std"]);
    worksheet.addRow(["24/08/2026", "CM1", 10, 1, 0, 80, 0, 15]);
    worksheet.addRow(["25/08/2026", "CM1", 4, 3, 2, 30, 0, 15]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({ productionDate: "2026-08-24" }));
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toContain("ligne 3");
  });

  it("importe les feuilles mensuelles au format du Dashboard Production avec dates françaises et arrêts vides", async () => {
    const workbook = new ExcelJS.Workbook();
    for (const [sheetName, day, article] of [["Avril 2026", "1-avr.", "CG3"], ["Aout2026", "3-août", "CM1"]] as const) {
      const worksheet = workbook.addWorksheet(sheetName);
      worksheet.addRow([`TABLEAU DE BORD DE PERFORMANCE (${sheetName})`]);
      worksheet.addRow([]);
      worksheet.addRow(["REGISTRE DE PRODUCTION JOURNALIER"]);
      worksheet.addRow(["DATE", "ARTICLE", "TEMPS OUV. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL.(h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD", "H. RÉELLES"]);
      worksheet.addRow([day, article, 4, "", 0.5, 40, "", 15, 3.5]);
    }

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ productionDate: "2026-04-01", article: "CG3", plannedStopsHours: 0, wasteTons: 0 }),
      expect.objectContaining({ productionDate: "2026-08-03", article: "CM1", plannedStopsHours: 0, wasteTons: 0 }),
    ]));
  });

  it("ignore sans erreur les cellules fusionnées vides autour de la ligne d’en-têtes", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Juillet 2026");
    worksheet.mergeCells("A1:B1");
    worksheet.getCell("A1").value = "Tableau de bord";
    worksheet.addRow([]);
    worksheet.addRow(["DATE", "ARTICLE", "TEMPS OUV. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL.(h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD", "H. RÉELLES"]);
    worksheet.addRow(["1-juil.", "CM1", 10, 0, 1, 70, 0, 10, 9]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toEqual(expect.objectContaining({ productionDate: "2026-07-01" }));
  });

  it("préserve plusieurs lignes source portant la même date comme des entrées distinctes", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Aout2026");
    worksheet.addRow(["DATE", "ARTICLE", "TEMPS OUV. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL.(h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD", "H. RÉELLES"]);
    worksheet.addRow(["5-août", "DG3", 6, 0, 0.5, 50, 0, 15, 5.5]);
    worksheet.addRow(["5-août", "CG3", 7, 0, 1, 60, 0, 15, 6]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    const augustFifth = parsed.rows.filter((row) => row.productionDate === "2026-08-05");

    expect(parsed.errors).toEqual([]);
    expect(augustFifth).toHaveLength(2);
    expect(augustFifth.map((row) => row.article)).toEqual(["DG3", "CG3"]);
  });

  it("importe une ligne Excel dans le fallback local sans base de données", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Test local");
    worksheet.addRow(["DATE", "ARTICLE", "TEMPS TOTAL PROD. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL. (h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD"]);
    worksheet.addRow(["12/09/2026", "TESTLOCAL", 12, 1, 0, 90, 2, 15]);

    const parsed = await parseImportedWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    const result = await importProductionRows(parsed.rows);

    expect(parsed.errors).toEqual([]);
    expect(result.total).toBe(1);
    expect(result.created).toBeGreaterThanOrEqual(1);
  });
});

// Ajouter uniquement les nouvelles valeurs, ne jamais insérer une ligne deux
// fois, et demander la permission avant de modifier une ancienne saisie déjà
// enregistrée (au lieu de l'écraser silencieusement comme avant).
describe("previewProductionImport / importProductionRows (aperçu et confirmation des modifications)", () => {
  it("ne crée qu'une seule fois deux lignes strictement identiques présentes dans le même fichier (copier-coller involontaire)", async () => {
    const row = { rowNumber: 2, productionDate: "2026-10-05", article: "PREVIEW-DUP", totalProductionHours: 8, plannedStopsHours: 0, unplannedStopsHours: 0, productionTons: 40, wasteTons: 0, standardRate: 15 };
    const duplicateInSameFile = { ...row, rowNumber: 3 };

    const preview = await previewProductionImport([row, duplicateInSameFile]);
    expect(preview.toCreate).toBe(1);
    expect(preview.unchanged).toBe(1);

    const result = await importProductionRows([row, duplicateInSameFile]);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    const rows = (await listProductionRecords()).filter((record) => record.productionDate === "2026-10-05" && record.article === "PREVIEW-DUP");
    expect(rows).toHaveLength(1);
  });

  it("propose une nouvelle ligne en création, sans jamais l'appliquer deux fois", async () => {
    const row = { rowNumber: 2, productionDate: "2026-10-01", article: "PREVIEW-NEW", totalProductionHours: 8, plannedStopsHours: 0, unplannedStopsHours: 0, productionTons: 40, wasteTons: 0, standardRate: 15 };

    const preview = await previewProductionImport([row]);
    expect(preview.toCreate).toBe(1);
    expect(preview.toUpdate).toEqual([]);

    const firstImport = await importProductionRows([row]);
    expect(firstImport.created).toBe(1);

    // Le même fichier réimporté (ex. par erreur) ne doit pas dupliquer la ligne.
    const secondPreview = await previewProductionImport([row]);
    expect(secondPreview.toCreate).toBe(0);
    expect(secondPreview.unchanged).toBe(1);
    const secondImport = await importProductionRows([row]);
    expect(secondImport.created).toBe(0);
    expect(secondImport.skipped).toBe(1);
  });

  it("détaille les champs qui changeraient pour une ligne existante modifiée, sans l'appliquer avant confirmation", async () => {
    const created = await createProductionRecord({
      productionDate: "2026-10-02", article: "PREVIEW-UPD", totalProductionHours: "8.00", plannedStopsHours: "0.00", unplannedStopsHours: "0.00",
      productionTons: "40.00", wasteTons: "0.00", standardRate: "15.00", availability: "1.000000", performance: "0.333333", quality: "1.000000", trs: "0.333333", realHours: "8.00", comment: null, source: "manual",
    });
    const modifiedRow = { rowNumber: 2, id: created.id, productionDate: "2026-10-02", article: "PREVIEW-UPD", totalProductionHours: 8, plannedStopsHours: 0, unplannedStopsHours: 0, productionTons: 45, wasteTons: 0, standardRate: 15 };

    const preview = await previewProductionImport([modifiedRow]);
    expect(preview.toCreate).toBe(0);
    expect(preview.toUpdate).toEqual([{ id: created.id, productionDate: "2026-10-02", article: "PREVIEW-UPD", changes: [{ field: "productionTons", label: "Production (T)", before: "40.00", after: "45.00" }] }]);

    // Sans confirmation (applyModifications par défaut à false côté routeur) : la ligne d'origine reste intacte.
    const declined = await importProductionRows([modifiedRow], { applyModifications: false });
    expect(declined.updated).toBe(0);
    expect(declined.pendingModifications).toBe(1);
    const stillOriginal = await previewProductionImport([modifiedRow]);
    expect(stillOriginal.toUpdate).toHaveLength(1); // la modification est toujours proposée, donc pas encore appliquée.

    // Une fois confirmée : la modification est appliquée et n'est plus proposée au prochain import du même fichier.
    const confirmed = await importProductionRows([modifiedRow], { applyModifications: true });
    expect(confirmed.updated).toBe(1);
    const afterConfirmation = await previewProductionImport([modifiedRow]);
    expect(afterConfirmation.toUpdate).toEqual([]);
    expect(afterConfirmation.unchanged).toBe(1);
  });

  it("ajoute les lignes nouvelles d'un fichier même quand d'autres lignes du même fichier attendent une confirmation", async () => {
    const created = await createProductionRecord({
      productionDate: "2026-10-03", article: "PREVIEW-MIX", totalProductionHours: "8.00", plannedStopsHours: "0.00", unplannedStopsHours: "0.00",
      productionTons: "40.00", wasteTons: "0.00", standardRate: "15.00", availability: "1.000000", performance: "0.333333", quality: "1.000000", trs: "0.333333", realHours: "8.00", comment: null, source: "manual",
    });
    const modifiedRow = { rowNumber: 2, id: created.id, productionDate: "2026-10-03", article: "PREVIEW-MIX", totalProductionHours: 8, plannedStopsHours: 0, unplannedStopsHours: 0, productionTons: 50, wasteTons: 0, standardRate: 15 };
    const newRow = { rowNumber: 3, productionDate: "2026-10-04", article: "PREVIEW-MIX", totalProductionHours: 8, plannedStopsHours: 0, unplannedStopsHours: 0, productionTons: 20, wasteTons: 0, standardRate: 15 };

    const result = await importProductionRows([modifiedRow, newRow], { applyModifications: false });
    expect(result.created).toBe(1);
    expect(result.pendingModifications).toBe(1);
    expect(result.updated).toBe(0);
  });

  // Reproduit le doublon signalé par l'utilisateur : un classeur maintenu à la
  // main (comme le sien) n'a jamais de colonne ID — une ligne modifiée doit
  // donc quand même être reconnue comme une modification de la ligne
  // existante (même date, même article, même production), pas dupliquée en
  // une nouvelle ligne.
  it("reconnaît la modification d'une ligne existante sans colonne ID (par date + article + production), au lieu de la dupliquer", async () => {
    await createProductionRecord({
      productionDate: "2026-09-19", article: "CG3", totalProductionHours: "6.00", plannedStopsHours: "0.00", unplannedStopsHours: "0.00",
      productionTons: "55.00", wasteTons: "0.00", standardRate: "15.00", availability: "1.000000", performance: "0.611111", quality: "1.000000", trs: "0.611111", realHours: "6.00", comment: null, source: "manual",
    });
    // Même date, même article, même production que la ligne enregistrée — mais sans ID (fichier maintenu à la main) et les rebuts corrigés à 2 au lieu de 0.
    const editedRow = { rowNumber: 2, productionDate: "2026-09-19", article: "CG3", totalProductionHours: 6, plannedStopsHours: 0, unplannedStopsHours: 0, productionTons: 55, wasteTons: 2, standardRate: 15 };

    const preview = await previewProductionImport([editedRow]);
    expect(preview.toCreate).toBe(0); // pas une nouvelle ligne : une modification de l'existante.
    expect(preview.toUpdate).toHaveLength(1);
    expect(preview.toUpdate[0].changes).toEqual([{ field: "wasteTons", label: "Rebuts (T)", before: "0.00", after: "2.00" }]);

    await importProductionRows([editedRow], { applyModifications: true });
    const rows = (await listProductionRecords()).filter((record) => record.productionDate === "2026-09-19" && record.article === "CG3");
    expect(rows).toHaveLength(1); // toujours une seule ligne, jamais doublée.
    expect(Number(rows[0].wasteTons)).toBe(2);
  });

  // Demande de l'utilisateur : même jour + même article dans le registre et dans le
  // fichier → la ligne du fichier remplace celle du registre, même si la production
  // diffère (ex. le 21/10, CM1 100 T dans le registre, 105 T dans le fichier : on garde 105 T).
  it("même jour et même article : la ligne du fichier remplace celle du registre, même avec une production différente", async () => {
    const tableRow = await createProductionRecord({
      productionDate: "2029-10-21", article: "CM1", totalProductionHours: "12.00", plannedStopsHours: "0.50", unplannedStopsHours: "1.00",
      productionTons: "100.00", wasteTons: "0.00", standardRate: "10.00", availability: "0.916667", performance: "0.952381", quality: "1.000000", trs: "0.873016", realHours: "10.50", comment: null, source: "manual",
    });
    const fileRow = { rowNumber: 2, productionDate: "2029-10-21", article: "CM1", totalProductionHours: 12, plannedStopsHours: 0.5, unplannedStopsHours: 1, productionTons: 105, wasteTons: 0, standardRate: 10 };

    const preview = await previewProductionImport([fileRow]);
    expect(preview).toMatchObject({ toCreate: 0, toDelete: [] });
    expect(preview.toUpdate).toEqual([{ id: tableRow.id, productionDate: "2029-10-21", article: "CM1", changes: [{ field: "productionTons", label: "Production (T)", before: "100.00", after: "105.00" }] }]);

    const result = await importProductionRows([fileRow], { applyModifications: true });
    expect(result).toMatchObject({ created: 0, updated: 1, deleted: 0 });
    const rows = (await listProductionRecords()).filter((record) => record.productionDate === "2029-10-21" && record.article === "CM1");
    expect(rows.map((record) => Number(record.productionTons))).toEqual([105]); // une seule ligne : celle du fichier.
  });

  it("deux lots du même article le même jour retrouvent chacun le leur (même production d'abord), sans rien changer", async () => {
    const record = (productionTons: string) => createProductionRecord({
      productionDate: "2029-09-16", article: "DG3", totalProductionHours: "4.00", plannedStopsHours: "0.00", unplannedStopsHours: "0.00",
      productionTons, wasteTons: "0.00", standardRate: "15.00", availability: "1.000000", performance: "0.500000", quality: "1.000000", trs: "0.500000", realHours: "4.00", comment: null, source: "excel-import",
    });
    await record("10.00");
    await record("40.00");
    const lot = (rowNumber: number, productionTons: number) => ({ rowNumber, productionDate: "2029-09-16", article: "DG3", totalProductionHours: 4, plannedStopsHours: 0, unplannedStopsHours: 0, productionTons, wasteTons: 0, standardRate: 15 });

    // Ordre du fichier inverse de l'ordre d'enregistrement : 40 T puis 10 T.
    const preview = await previewProductionImport([lot(2, 40), lot(3, 10)]);

    expect(preview).toMatchObject({ toCreate: 0, toUpdate: [], unchanged: 2, toDelete: [] });
  });

  it("supprime, après confirmation, les lignes en trop du registre quand le fichier en a moins pour ce jour et cet article", async () => {
    const record = (productionTons: string) => createProductionRecord({
      productionDate: "2029-08-05", article: "CG3", totalProductionHours: "6.00", plannedStopsHours: "0.00", unplannedStopsHours: "0.00",
      productionTons, wasteTons: "0.00", standardRate: "15.00", availability: "1.000000", performance: "0.500000", quality: "1.000000", trs: "0.500000", realHours: "6.00", comment: null, source: "manual",
    });
    const first = await record("45.00");
    const second = await record("20.00");
    const otherDay = await createProductionRecord({
      productionDate: "2029-08-06", article: "CG3", totalProductionHours: "6.00", plannedStopsHours: "0.00", unplannedStopsHours: "0.00",
      productionTons: "30.00", wasteTons: "0.00", standardRate: "15.00", availability: "1.000000", performance: "0.333333", quality: "1.000000", trs: "0.333333", realHours: "6.00", comment: null, source: "manual",
    });
    const fileRow = { rowNumber: 2, productionDate: "2029-08-05", article: "CG3", totalProductionHours: 6, plannedStopsHours: 0, unplannedStopsHours: 0, productionTons: 50, wasteTons: 0, standardRate: 15 };

    const preview = await previewProductionImport([fileRow]);
    expect(preview.toUpdate.map((update) => update.id)).toEqual([first.id]);
    expect(preview.toDelete).toEqual([{ id: second.id, productionDate: "2029-08-05", article: "CG3", productionTons: "20.00" }]);

    const declined = await importProductionRows([fileRow], { applyModifications: false });
    expect(declined).toMatchObject({ updated: 0, deleted: 0, pendingModifications: 2 });

    const confirmed = await importProductionRows([fileRow], { applyModifications: true });
    expect(confirmed).toMatchObject({ updated: 1, deleted: 1 });
    const remaining = (await listProductionRecords()).filter((row) => row.article === "CG3" && row.productionDate.startsWith("2029-08-0"));
    expect(remaining.map((row) => [row.productionDate, Number(row.productionTons)]).sort()).toEqual([["2029-08-05", 50], ["2029-08-06", 30]]);
    expect(remaining.map((row) => row.id)).toContain(otherDay.id); // un autre jour n'est jamais touché.
  });

  it("conserve le commentaire saisi sur le site quand le fichier n'a pas de colonne Commentaire", async () => {
    await createProductionRecord({
      productionDate: "2029-07-16", article: "DM1", totalProductionHours: "9.00", plannedStopsHours: "0.50", unplannedStopsHours: "1.00",
      productionTons: "20.00", wasteTons: "20.00", standardRate: "10.00", availability: "0.888889", performance: "0.266667", quality: "0.000000", trs: "0.000000", realHours: "7.50", comment: "Montage les tamis PF incompatible", source: "manual",
    });
    const fileRow = { rowNumber: 2, productionDate: "2029-07-16", article: "DM1", totalProductionHours: 9, plannedStopsHours: 0.5, unplannedStopsHours: 1, productionTons: 20, wasteTons: 20, standardRate: 10 };

    const preview = await previewProductionImport([fileRow]);

    expect(preview).toMatchObject({ toCreate: 0, toUpdate: [], unchanged: 1, toDelete: [] });
  });

  // Cas réel signalé : deux saisies du même jour, même article, même tonnage,
  // mais des rebuts et un commentaire différents (montage de tamis
  // incompatible sur l'une d'elles) — la production seule ne suffit donc pas à
  // les distinguer entre elles, d'où l'association par position.
  it("associe par position deux lignes existantes qui partagent date, article ET production, sans les mélanger ni les dupliquer", async () => {
    const first = await createProductionRecord({
      productionDate: "2026-09-21", article: "DM1", totalProductionHours: "7.50", plannedStopsHours: "0.00", unplannedStopsHours: "0.83",
      productionTons: "20.00", wasteTons: "20.00", standardRate: "15.00", availability: "0.889000", performance: "0.238000", quality: "0.000000", trs: "0.000000", realHours: "6.67", comment: null, source: "manual",
    });
    const second = await createProductionRecord({
      productionDate: "2026-09-21", article: "DM1", totalProductionHours: "7.50", plannedStopsHours: "0.00", unplannedStopsHours: "0.83",
      productionTons: "20.00", wasteTons: "0.00", standardRate: "15.00", availability: "0.889000", performance: "0.238000", quality: "1.000000", trs: "0.238000", realHours: "6.67", comment: "Montage les tamis PF incompatible d'article DM1", source: "manual",
    });
    // Le fichier reprend les deux lignes dans le même ordre (aucune colonne ID) : la première inchangée, le commentaire de la seconde corrigé.
    const unchangedRow = { rowNumber: 2, productionDate: "2026-09-21", article: "DM1", totalProductionHours: 7.5, plannedStopsHours: 0, unplannedStopsHours: 0.83, productionTons: 20, wasteTons: 20, standardRate: 15 };
    const editedRow = { rowNumber: 3, productionDate: "2026-09-21", article: "DM1", totalProductionHours: 7.5, plannedStopsHours: 0, unplannedStopsHours: 0.83, productionTons: 20, wasteTons: 0, standardRate: 15, comment: "Tamis remplacés, article de nouveau compatible" };

    const preview = await previewProductionImport([unchangedRow, editedRow]);
    expect(preview.toCreate).toBe(0);
    expect(preview.unchanged).toBe(1);
    expect(preview.toUpdate).toEqual([{ id: second.id, productionDate: "2026-09-21", article: "DM1", changes: [{ field: "comment", label: "Commentaire", before: "Montage les tamis PF incompatible d'article DM1", after: "Tamis remplacés, article de nouveau compatible" }] }]);

    await importProductionRows([unchangedRow, editedRow], { applyModifications: true });
    const rows = (await listProductionRecords()).filter((record) => record.productionDate === "2026-09-21" && record.article === "DM1");
    expect(rows).toHaveLength(2); // toujours deux lignes, jamais une troisième.
    expect(rows.find((record) => record.id === first.id)!.comment).toBeNull(); // la première n'a pas bougé.
    expect(rows.find((record) => record.id === second.id)!.comment).toBe("Tamis remplacés, article de nouveau compatible"); // seule la seconde a été corrigée.
  });
});
