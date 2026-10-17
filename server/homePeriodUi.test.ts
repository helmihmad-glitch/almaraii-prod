import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homePage = readFileSync(fileURLToPath(new URL("../client/src/pages/Home.tsx", import.meta.url)), "utf8");

describe("sélection de période de la page d’accueil", () => {
  it("propose un calendrier limité au mois et à l’année", () => {
    expect(homePage).toContain('type="month"');
    expect(homePage).toContain("Choisir le mois et l’année");
  });

  // Audit des calculs : les tuiles affichaient une tendance figée (« +4,2 pts »,
  // « +2,1 pts ») quel que soit le mois, et le TRS global suivait les filtres du
  // journal alors que Disponibilité, Performance et Rebuts portaient sur tout le mois.
  it("calcule les tendances TRS et Disponibilité sur le mois précédent, et le TRS global sur tout le mois comme les autres tuiles", () => {
    expect(homePage).not.toContain("+4,2 pts");
    expect(homePage).not.toContain("+2,1 pts");
    expect(homePage).toContain("previousMonthStats");
    expect(homePage).toContain("monthTrend(monthlyStats.trs, previousMonthStats?.trs)");
    expect(homePage).toContain("monthTrend(monthlyStats.availability, previousMonthStats?.availability)");
    expect(homePage).toContain('value={hasMonthData ? pct(monthlyStats.trs) : "—"}');
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

  it("affiche de nouveau les heures perdues dans le graphique quotidien", () => {
    expect(homePage).toContain('<Bar dataKey="lostHours" fill="#e8b53a"');
    expect(homePage).toContain('<Bar dataKey="activeHours" fill="#4d7b40"');
  });

  it("affiche les initiales HH dans l’avatar de l’en-tête", () => {
    expect(homePage).toContain('className="avatar">HH</div>');
  });

  it("propose des filtres actifs et une période directement dans Dernières productions", () => {
    expect(homePage).toContain('aria-label="Filtrer par article"');
    expect(homePage).toContain('aria-label="Choisir la période de la table"');
    expect(homePage).toContain("setDateTo(event.target.value)");
    expect(homePage).toContain("clearRegistryFilters");
  });
});
