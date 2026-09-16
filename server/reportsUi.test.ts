import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = readFileSync(fileURLToPath(new URL("../client/src/App.tsx", import.meta.url)), "utf8");
const appShell = readFileSync(fileURLToPath(new URL("../client/src/components/AppShell.tsx", import.meta.url)), "utf8");
const reportsPage = readFileSync(fileURLToPath(new URL("../client/src/pages/Reports.tsx", import.meta.url)), "utf8");
const siloPf = readFileSync(fileURLToPath(new URL("../client/src/pages/SiloPf.tsx", import.meta.url)), "utf8");
const siloProduction = readFileSync(fileURLToPath(new URL("../client/src/pages/SiloProduction.tsx", import.meta.url)), "utf8");
const siloExpedition = readFileSync(fileURLToPath(new URL("../client/src/pages/SiloExpedition.tsx", import.meta.url)), "utf8");
const siloLots = readFileSync(fileURLToPath(new URL("../client/src/pages/SiloLots.tsx", import.meta.url)), "utf8");
const home = readFileSync(fileURLToPath(new URL("../client/src/pages/Home.tsx", import.meta.url)), "utf8");
const routers = readFileSync(fileURLToPath(new URL("./routers.ts", import.meta.url)), "utf8");

describe("Rapports (centre d’export)", () => {
  it("enregistre la page Rapports depuis le routeur, réservée à la session admin, avec son lien de navigation", () => {
    expect(app).toContain('path="/rapports"');
    expect(app).toContain("<AdminRoute><Reports /></AdminRoute>");
    expect(appShell).toContain('path: "/rapports", label: "Rapports"');
  });

  it("regroupe les 6 rapports attendus, chacun avec son propre export", () => {
    expect(reportsPage).toContain("trpc.useUtils().silo.exportExcel");
    expect(reportsPage).toContain("trpc.useUtils().silo.exportLotLedger");
    expect(reportsPage).toContain("trpc.production.syncFile.useQuery");
    expect(reportsPage).toContain("Registre filtré");
    expect(reportsPage).toContain("trpc.useUtils().production.exportFilteredExcel");
    expect(reportsPage).toContain("generateDayPdf");
    expect(reportsPage).toContain("generateDailyProgramPdf");
    expect(reportsPage).toContain("trpc.dailyProgram.byDate.useQuery");
  });

  it("exporte le registre filtré en Excel (plus en CSV), avec le même filtrage recherche + période côté serveur", () => {
    expect(reportsPage).not.toContain("text/csv");
    expect(reportsPage).not.toContain(".csv");
    expect(routers).toContain("exportFilteredExcel: publicProcedure");
    expect(routers).toContain("buildFilteredRegistryWorkbook");
  });

  it("classe les rapports par domaine plutôt qu’en une grille indifférenciée", () => {
    const groupMatches = reportsPage.match(/className="reports-group"/g) ?? [];
    expect(groupMatches.length).toBe(3);
    expect(reportsPage).toContain("État des silos");
    expect(reportsPage).toContain("reports-group-title");
  });

  it("retire les boutons d’export désormais dispersés sur Silo PF, Ajouter production/expédition et Traçabilité des lots", () => {
    expect(siloPf).not.toContain("exportExcel");
    expect(siloPf).not.toContain("Exporter le classeur");
    expect(siloProduction).not.toContain("exportExcel");
    expect(siloProduction).not.toContain("Exporter le classeur");
    expect(siloExpedition).not.toContain("exportExcel");
    expect(siloExpedition).not.toContain("Exporter le classeur");
    expect(siloLots).not.toContain("exportLotLedger");
    expect(siloLots).not.toContain("Exporter en Excel");
  });

  it("retire l’export CSV filtré de l’Accueil (déplacé dans Rapports)", () => {
    expect(home).not.toContain("csv");
    expect(home).not.toContain("Export CSV généré");
  });
});
