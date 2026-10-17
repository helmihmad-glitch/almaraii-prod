import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

function adminContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: true } as any;
}

async function restDaysOnlyWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Novembre_2026");
  worksheet.addRow(["DATE", "ARTICLE", "TEMPS TOTAL PROD. (h)", "ARRÊTS PLAN. (h)", "ARRÊTS NON PL. (h)", "PROD. (T)", "REBUTS (T)", "CADENCE STD"]);
  worksheet.addRow(["01/11/2026", "Repos"]);
  worksheet.addRow(["08/11/2026", "Repos"]);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64");
}

describe("import Excel du registre : fichier ne contenant que des jours de repos", () => {
  // Bug signalé par l'audit : un tel fichier était refusé (« aucune ligne de
  // production valide ») avant même d'enregistrer ses jours de repos.
  it("enregistre les jours de repos au lieu de refuser le fichier, et les lignes Repos restent signalées", async () => {
    const caller = appRouter.createCaller(adminContext());

    const result = await caller.production.importExcel({ fileName: "repos.xlsx", fileBase64: await restDaysOnlyWorkbook() });

    expect(result).toMatchObject({ created: 0, updated: 0, restDays: 2, rejected: 2 });
    const restDays = await caller.production.listRestDays();
    expect(restDays.map((day) => day.restDate)).toEqual(expect.arrayContaining(["2026-11-01", "2026-11-08"]));
  });
});
