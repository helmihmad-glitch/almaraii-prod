import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const registryPage = readFileSync(fileURLToPath(new URL("../client/src/pages/Registry.tsx", import.meta.url)), "utf8");

describe("import Excel et rapport PDF du registre", () => {
  it("propose un import Excel xlsx protégé par une confirmation de mot de passe accessible", () => {
    expect(registryPage).toContain("trpc.production.importExcel.useMutation");
    expect(registryPage).toContain("Importer Excel");
    expect(registryPage).toContain("accept=\".xlsx");
    expect(registryPage).toContain("Confirmation d’import");
    expect(registryPage).toContain("Mot de passe d’action");
    expect(registryPage).not.toContain("window.prompt(\"Saisissez le mot de passe pour importer");
  });

  it("construit un PDF de la production J-1 et des cinq indicateurs demandés", () => {
    expect(registryPage).toContain('import("jspdf")');
    expect(registryPage).toContain("Production J-1");
    expect(registryPage).toContain("TRS global");
    expect(registryPage).toContain("Disponibilité");
    expect(registryPage).toContain("Performance");
    expect(registryPage).toContain("Rebuts / déchets");
    expect(registryPage).toContain("Temps total prod. (h) / Mois");
    expect(registryPage).toContain("Télécharger PDF");
  });
});
