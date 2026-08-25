import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const registryPage = readFileSync(fileURLToPath(new URL("../client/src/pages/Registry.tsx", import.meta.url)), "utf8");
const dayPdfReport = readFileSync(fileURLToPath(new URL("../client/src/lib/dayPdfReport.ts", import.meta.url)), "utf8");

describe("import Excel et rapport PDF du registre", () => {
  it("propose un import Excel xlsx protégé par une confirmation de mot de passe accessible", () => {
    expect(registryPage).toContain("trpc.production.importExcel.useMutation");
    expect(registryPage).toContain("Importer Excel");
    expect(registryPage).toContain("accept=\".xlsx");
    expect(registryPage).toContain("Confirmation d’import");
    expect(registryPage).toContain("Mot de passe d’action");
    expect(registryPage).not.toContain("window.prompt(\"Saisissez le mot de passe pour importer");
  });

  it("construit un PDF journalier accessible depuis chaque ligne du registre", () => {
    expect(registryPage).toContain("generateDayPdf");
    expect(registryPage).toContain("requestDayPdf");
    expect(dayPdfReport).toContain('import("jspdf")');
    expect(dayPdfReport).toContain("RAPPORT JOURNALIER");
    expect(dayPdfReport).toContain("PRODUCTION DE LA JOURNÉE");
    expect(dayPdfReport).toContain("Indicateurs de performance");
    expect(dayPdfReport).toContain("Détail des lignes de production");
    expect(dayPdfReport).toContain("TRS GLOBAL");
    expect(dayPdfReport).toContain("DISPONIBILITÉ");
    expect(dayPdfReport).toContain("PERFORMANCE");
    expect(dayPdfReport).toContain("REBUTS / DÉCHETS");
    expect(dayPdfReport).toContain("TEMPS TOTAL PROD.");
    expect(registryPage).toContain("Exporter le PDF de cette journée");
    expect(registryPage).not.toContain("Télécharger PDF");
  });

  it("ajoute l’objectif mensuel, le logo et un commentaire facultatif au rapport", () => {
    expect(dayPdfReport).toContain("OBJECTIF MENSUEL");
    expect(dayPdfReport).toContain("JUSQU’AU");
    expect(dayPdfReport).toContain("row.productionDate <= exportDate");
    expect(dayPdfReport).not.toContain("Données disponibles");
    expect(dayPdfReport).toContain("Progression réelle");
    expect(dayPdfReport).not.toContain("CUMUL ARRÊTÉ AU");
    expect(dayPdfReport).not.toContain("d'objectif");
    expect(dayPdfReport).not.toContain("ligne(s) de production enregistrée(s)");
    expect(dayPdfReport).toContain('doc.text("JOURNÉE"');
    expect(dayPdfReport).toContain("const dayArticleLabels");
    expect(dayPdfReport).toContain("dayArticleLabels.slice(0, 2)");
    expect(dayPdfReport).toContain("dayArticleLabels.slice(2)");
    expect(dayPdfReport).not.toContain("ATTEINTE DU PLAN");
    expect(dayPdfReport).toContain("almaraai-corn-logo");
    expect(dayPdfReport).toContain("ACTIVES");
    expect(dayPdfReport).toContain("PERDUES");
    expect(dayPdfReport).toContain("COMMENTAIRE AJOUTÉ À L’EXPORT");
    expect(registryPage).toContain("Ajouter un <em>commentaire</em> au PDF ?");
    expect(registryPage).toContain("Exporter sans commentaire");
  });
});
