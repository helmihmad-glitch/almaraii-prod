import { describe, expect, it } from "vitest";
import { calculateProductionGuideProgress, orderProductionRows } from "../client/src/lib/registryOrdering";

describe("ordre du registre journalier", () => {
  it("classe une nouvelle saisie par date avant de l’afficher de la plus récente à la plus ancienne", () => {
    const sorted = orderProductionRows([
      { date: "2026-08-20", article: "DG3" },
      { date: "2026-08-02", article: "CM1" },
      { date: "2026-08-20", article: "CG25" },
    ]);

    expect(sorted.map((row) => `${row.date}-${row.article}`)).toEqual([
      "2026-08-02-CM1",
      "2026-08-20-CG25",
      "2026-08-20-DG3",
    ]);
    expect(sorted.slice().reverse()[0]).toEqual({ date: "2026-08-20", article: "DG3" });
  });
});

// Repère « où l'on devrait en être aujourd'hui », affiché sous la barre de
// progression réelle de l'Accueil — voir calculateProductionGuideProgress.
describe("calculateProductionGuideProgress (guide de production, Accueil)", () => {
  it("cas signalé : le 24/09/2026, 3 dimanches déjà passés (6, 13, 20) → (24 - 3) / 26", () => {
    const progress = calculateProductionGuideProgress("2026-09", new Date(2026, 8, 24));
    expect(progress).toBeCloseTo((24 - 3) / 26);
    expect(progress).toBeCloseTo(0.8076923077, 5);
  });

  it("compte tous les jours d'un mois déjà entièrement passé", () => {
    // Août 2026 : 31 jours, 5 dimanches (2, 9, 16, 23, 30) → 26 jours ouvrés pile.
    const progress = calculateProductionGuideProgress("2026-08", new Date(2026, 8, 24));
    expect(progress).toBeCloseTo(1);
  });

  it("ne compte aucun jour d'un mois futur", () => {
    const progress = calculateProductionGuideProgress("2026-10", new Date(2026, 8, 24));
    expect(progress).toBe(0);
  });

  it("le premier jour du mois (avant le premier dimanche) ne retire aucun jour", () => {
    const progress = calculateProductionGuideProgress("2026-09", new Date(2026, 8, 1));
    expect(progress).toBeCloseTo(1 / 26);
  });
});
