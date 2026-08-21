import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(fileURLToPath(new URL("../client/src/pages/Home.tsx", import.meta.url)), "utf8");

describe("sélection de période de la page d’accueil", () => {
  it("propose un calendrier limité au mois et à l’année", () => {
    expect(homePage).toContain('type="month"');
    expect(homePage).toContain("Choisir le mois et l’année");
  });

  it("place la période observée dans la carte d’objectif mensuel", () => {
    const heroStart = homePage.indexOf('className="hero-panel"');
    const periodControl = homePage.indexOf('className="hero-period-control"');
    expect(heroStart).toBeGreaterThan(-1);
    expect(periodControl).toBeGreaterThan(heroStart);
    expect(homePage).not.toContain('className="page-intro period-intro"');
  });

  it("retire l’ancienne accroche et prévoit un état sans données", () => {
    expect(homePage).not.toContain("La cadence tient l’objectif");
    expect(homePage).toContain("Aucune donnée disponible");
    expect(homePage).toContain("Aucune donnée de production n’est disponible pour ce mois.");
  });

  it("retire les blocs de commentaires de Production J-1 sans retirer le champ commentaire du registre", () => {
    expect(homePage).not.toContain('className="daily-comment-list"');
    expect(homePage).not.toContain('className="daily-comment-row"');
    expect(homePage).toContain('className="comment-fields"');
    expect(homePage).toContain("Le commentaire est ajouté librement.");
  });

  it("retire le sous-titre du graphique des heures quotidiennes sans retirer sa légende", () => {
    expect(homePage).not.toContain("Actives et perdues");
    expect(homePage).toContain("Heures quotidiennes");
    expect(homePage).toContain("hours-legend");
  });
});
