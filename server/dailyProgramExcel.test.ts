import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseDailyProgramWorkbook } from "./dailyProgramExcel";

/** Reproduit l'en-tête « Réf: For-Prod-09 » présent en haut de chaque feuille du classeur réel. */
function writeTemplateHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(3).getCell(2).value = "Programme de Production ";
  sheet.getRow(3).getCell(9).value = "Réf: For-Prod-09";
  sheet.getRow(4).getCell(9).value = "Indice :00";
  sheet.getRow(5).getCell(9).value = "Date : 13-11-2025"; // Date du modèle, au format JJ-MM-AAAA : jamais une vraie journée.
  sheet.getRow(6).getCell(9).value = "Page 1/1";
}

/** Écrit un bloc « date : … / Pupitreur : … / en-tête / lignes » à partir de la ligne donnée, comme dans le classeur réel. */
function writeDayBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  options: { date: string; pupitreur: string; lines: (string | number | { time: string })[][] },
) {
  sheet.getRow(startRow).getCell(2).value = `date :  ${options.date}`;
  sheet.getRow(startRow + 1).getCell(2).value = `Pupitreur :   ${options.pupitreur}`;
  const headerTop = startRow + 3;
  ["N°", "Article ", "Version ", "Quantité (Tonne) ", "Quantité (Tonne) ", "H début prévue ", "H fin prévue", "Observation "].forEach((label, index) => {
    sheet.getRow(headerTop).getCell(2 + index).value = label;
  });
  ["N°", "Article ", "Version ", "Sac ", "Vrac ", "H début prévue ", "H fin prévue", "Observation "].forEach((label, index) => {
    sheet.getRow(headerTop + 1).getCell(2 + index).value = label;
  });
  options.lines.forEach((line, lineIndex) => {
    const row = sheet.getRow(headerTop + 2 + lineIndex);
    line.forEach((value, columnIndex) => {
      const cell = row.getCell(2 + columnIndex);
      if (value && typeof value === "object" && "time" in value) {
        const [hours, minutes] = value.time.split(":").map(Number);
        cell.value = new Date(Date.UTC(1899, 11, 30, hours, minutes));
      } else if (value !== "") {
        cell.value = value;
      }
    });
  });
  return headerTop + 2 + options.lines.length; // première ligne libre après ce bloc
}

async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("import du classeur Programme de Production (Réf: For-Prod-09)", () => {
  it("lit une journée simple : article, version, sac/vrac, heures et observation", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("16092026");
    writeTemplateHeader(sheet);
    writeDayBlock(sheet, 9, {
      date: "16/09/2026",
      pupitreur: "Yosri  & youssef & hamza ",
      lines: [
        [1, "DG3", 14, "", 50, { time: "06:30" }, { time: "12:00" }, ""],
      ],
    });

    const { days, errors } = await parseDailyProgramWorkbook(await toBuffer(workbook));

    expect(errors).toEqual([]);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ programDate: "2026-09-16", operatorName: "Yosri · youssef · hamza" });
    expect(days[0].lines).toEqual([
      { sequence: 1, article: "DG3", version: "14", bagQuantity: null, bulkQuantity: "50", plannedStart: "06:30", plannedEnd: "12:00", observation: null },
    ]);
  });

  it("lit une ligne « changement article » sans article, version ni quantité — seules l'observation et les heures comptent", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("16092026");
    writeTemplateHeader(sheet);
    writeDayBlock(sheet, 9, {
      date: "16/09/2026",
      pupitreur: "Yosri & youssef & hamza",
      lines: [
        [1, "DG3", 14, "", 50, { time: "06:30" }, { time: "12:00" }, ""],
        [2, "", "", "", "", { time: "12:00" }, { time: "12:30" }, "changement article DG3 → DM1"],
        [3, "DM1", 1, "", 20, { time: "12:30" }, { time: "15:30" }, ""],
      ],
    });

    const { days, errors } = await parseDailyProgramWorkbook(await toBuffer(workbook));

    expect(errors).toEqual([]);
    expect(days[0].lines[1]).toEqual({
      sequence: 2, article: null, version: null, bagQuantity: null, bulkQuantity: null,
      plannedStart: "12:00", plannedEnd: "12:30", observation: "changement article DG3 → DM1",
    });
  });

  it("extrait seulement les noms d'un pupitreur à plages horaires (« de HH:MM à HH:MM Nom »)", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("16092026");
    writeTemplateHeader(sheet);
    writeDayBlock(sheet, 9, {
      date: "16/09/2026",
      pupitreur: "de 06:00 à 15:00 Yosri  \n                          de 14:00 à 23:00  youssef & hamza ",
      lines: [[1, "CG3", 93, "", 140, { time: "06:30" }, { time: "22:00" }, ""]],
    });

    const { days } = await parseDailyProgramWorkbook(await toBuffer(workbook));

    expect(days[0].operatorName).toBe("Yosri · youssef · hamza");
  });

  it("ignore silencieusement la date du cartouche du modèle (« Date : 13-11-2025 », format JJ-MM-AAAA)", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("16092026");
    writeTemplateHeader(sheet);
    writeDayBlock(sheet, 9, { date: "16/09/2026", pupitreur: "Yosri", lines: [[1, "CG3", 93, "", 140, { time: "06:30" }, { time: "22:00" }, ""]] });

    const { days, errors } = await parseDailyProgramWorkbook(await toBuffer(workbook));

    expect(days).toHaveLength(1); // pas de faux jour créé pour le cartouche
    expect(errors).toEqual([]); // et aucune fausse alerte « date illisible »
  });

  it("empile plusieurs journées dans une même feuille, séparées par une ligne vide", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("01&02092026");
    writeTemplateHeader(sheet);
    const nextRow = writeDayBlock(sheet, 8, { date: "30/08/2026", pupitreur: "Yosri & youssef & hamza", lines: [[1, "CG3", 92, "", 140, { time: "06:00" }, { time: "22:00" }, ""]] });
    writeDayBlock(sheet, nextRow + 1, { date: "31/08/2026", pupitreur: "Yosri & youssef & hamza", lines: [[1, "CM1", 66, "", 100, { time: "06:00" }, { time: "22:00" }, ""]] });

    const { days, errors } = await parseDailyProgramWorkbook(await toBuffer(workbook));

    expect(errors).toEqual([]);
    expect(days.map((day) => day.programDate)).toEqual(["2026-08-30", "2026-08-31"]);
  });

  it("signale une ligne de planning sans heure de début/fin, sans interrompre le reste de l'import", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("test");
    writeTemplateHeader(sheet);
    writeDayBlock(sheet, 9, {
      date: "01/09/2026",
      pupitreur: "Yosri",
      lines: [
        [1, "DG3", 12, "", 50, "", "", ""], // heures manquantes dans le fichier réel observé
        [1, "DG4", 25, "", 50, { time: "06:00" }, { time: "22:00" }, ""],
      ],
    });

    const { days, errors } = await parseDailyProgramWorkbook(await toBuffer(workbook));

    expect(days[0].lines).toHaveLength(1);
    expect(days[0].lines[0].article).toBe("DG4");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ligne de planning illisible");
  });

  it("avertit quand la même date apparaît deux fois, et conserve la dernière occurrence", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheetA = workbook.addWorksheet("09092026");
    writeTemplateHeader(sheetA);
    writeDayBlock(sheetA, 9, { date: "09/08/2026", pupitreur: "Yosri", lines: [[3, "CG25", 43, "", 50, { time: "11:00" }, { time: "16:00" }, ""]] });
    const sheetB = workbook.addWorksheet("10092026");
    writeTemplateHeader(sheetB);
    writeDayBlock(sheetB, 9, { date: "09/08/2026", pupitreur: "Yosri", lines: [[3, "CG25", 43, "", 80, { time: "11:00" }, { time: "15:00" }, ""]] });

    const { days, errors } = await parseDailyProgramWorkbook(await toBuffer(workbook));

    expect(days.filter((day) => day.programDate === "2026-08-09")).toHaveLength(2);
    expect(errors.some((message) => message.includes("2026-08-09") && message.includes("2 fois"))).toBe(true);
  });

  it("lit plusieurs feuilles du même classeur", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet1 = workbook.addWorksheet("14092026");
    writeTemplateHeader(sheet1);
    writeDayBlock(sheet1, 9, { date: "14/09/2026", pupitreur: "Yosri", lines: [[1, "CG3", 93, "", 140, { time: "06:30" }, { time: "22:00" }, ""]] });
    const sheet2 = workbook.addWorksheet("15092026");
    writeTemplateHeader(sheet2);
    writeDayBlock(sheet2, 9, { date: "15/09/2026", pupitreur: "Yosri", lines: [[1, "CM1", 66, "", 100, { time: "06:30" }, { time: "22:30" }, ""]] });

    const { days } = await parseDailyProgramWorkbook(await toBuffer(workbook));

    expect(days.map((day) => day.programDate)).toEqual(["2026-09-14", "2026-09-15"]);
  });
});
