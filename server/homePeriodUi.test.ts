import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(fileURLToPath(new URL("../client/src/pages/Home.tsx", import.meta.url)), "utf8");

describe("sélection de période de la page d’accueil", () => {
  it("propose un calendrier limité au mois et à l’année", () => {
    expect(homePage).toContain('type="month"');
    expect(homePage).toContain("Choisir le mois et l’année");
  });

  it("retire l’ancienne accroche et prévoit un état sans données", () => {
    expect(homePage).not.toContain("La cadence tient l’objectif");
    expect(homePage).toContain("Aucune donnée disponible");
    expect(homePage).toContain("Aucune donnée de production n’est disponible pour ce mois.");
  });
});
