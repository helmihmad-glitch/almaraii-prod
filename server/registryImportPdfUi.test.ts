import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const registryPage = readFileSync(fileURLToPath(new URL("../client/src/pages/Registry.tsx", import.meta.url)), "utf8");
const reportsPage = readFileSync(fileURLToPath(new URL("../client/src/pages/Reports.tsx", import.meta.url)), "utf8");
const dayPdfReport = readFileSync(fileURLToPath(new URL("../client/src/lib/dayPdfReport.ts", import.meta.url)), "utf8");
const routers = readFileSync(fileURLToPath(new URL("./routers.ts", import.meta.url)), "utf8");

describe("import Excel du registre et rapport PDF journalier (centralisé dans Rapports)", () => {
  it("propose un import Excel xlsx via une confirmation accessible, protégée par la session admin", () => {
    expect(registryPage).toContain("trpc.production.prepareExcelUpload.useMutation");
    expect(registryPage).toContain("trpc.production.importExcelFromStorage.useMutation");
    expect(registryPage).toContain("prepared.uploadUrl");
    expect(registryPage).not.toContain("fileBase64");
    expect(routers).toContain("prepareExcelUpload:");
    expect(routers).toContain("importExcelFromStorage:");
    expect(routers).toContain("storageCreatePresignedUpload");
    expect(registryPage).toContain("Importer Excel");
    expect(registryPage).toContain("accept=\".xlsx");
    expect(registryPage).toContain("Confirmation d’import");
    expect(registryPage).not.toContain("Mot de passe d’action");
    expect(registryPage).not.toContain("actionPassword");
    expect(registryPage).toContain("window.confirm(\"Supprimer cette ligne du registre ?\")");
  });

  it("ne propose plus le PDF journalier ni l’export CSV/Excel directement depuis le Registre : un lien renvoie vers Rapports", () => {
    expect(registryPage).not.toContain("generateDayPdf");
    expect(registryPage).not.toContain("requestDayPdf");
    expect(registryPage).not.toContain("exportRows");
    expect(registryPage).not.toContain("downloadSynchronizedExcel");
    expect(registryPage).not.toContain("synchronizedFileQuery");
    expect(registryPage).toContain('href="/rapports"');
    expect(registryPage).toContain("Voir les rapports");
  });

  it("construit un PDF journalier depuis le centre de rapports", () => {
    expect(reportsPage).toContain("generateDayPdf");
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
    expect(reportsPage).toContain("Rapport PDF (par jour)");
    expect(reportsPage).toContain("Exporter le PDF");
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
    expect(dayPdfReport).toContain("BRAND_LOGO_URL");
    expect(dayPdfReport).toContain("ACTIVES");
    expect(dayPdfReport).toContain("PERDUES");
    expect(dayPdfReport).toContain("COMMENTAIRE AJOUTÉ À L’EXPORT");
    expect(reportsPage).toContain("Commentaire d’export (facultatif)");
    expect(reportsPage).toContain("exportComment: pdfComment");
  });
});
