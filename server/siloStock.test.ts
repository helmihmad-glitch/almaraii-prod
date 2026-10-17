import { describe, expect, it } from "vitest";
import { computeArticleStock, computeShipmentAvailability, computeSiloMatrix, computeSiloOccupancy, computeTotalStock } from "./siloStock";

const SILOS = ["SPF1", "SPF2", "SPF3", "SPF4"];
const ARTICLES = ["CM1", "CG25", "CG3"];

describe("état des silos de produits finis", () => {
  it("soustrait les expéditions des entrées de production, silo par silo et article par article", () => {
    const matrix = computeSiloMatrix(
      [{ article: "CG3", silo: "SPF3", quantity: 40 }, { article: "CG3", silo: "SPF3", quantity: 15 }],
      [{ article: "CG3", silo: "SPF3", quantity: 29.52 }],
      SILOS,
      ARTICLES,
    );

    expect(matrix.SPF3.CG3).toBe(25.48);
    expect(matrix.SPF3.CM1).toBeNull();
  });

  it("laisse la case vide lorsque le solde est nul ou négatif, comme le classeur", () => {
    const matrix = computeSiloMatrix(
      [{ article: "CG3", silo: "SPF1", quantity: 10 }, { article: "CM1", silo: "SPF2", quantity: 10 }],
      [{ article: "CG3", silo: "SPF1", quantity: 10 }, { article: "CM1", silo: "SPF2", quantity: 12 }],
      SILOS,
      ARTICLES,
    );

    expect(matrix.SPF1.CG3).toBeNull();
    expect(matrix.SPF2.CM1).toBeNull();
  });

  it("prend en compte les corrections négatives saisies en production", () => {
    const matrix = computeSiloMatrix(
      [{ article: "CG3", silo: "SPF5", quantity: 55 }, { article: "CG3", silo: "SPF5", quantity: -40 }],
      [],
      ["SPF5"],
      ["CG3"],
    );

    expect(matrix.SPF5.CG3).toBe(15);
  });

  it("décrit l'occupation de chaque silo par l'article qu'il contient", () => {
    const matrix = computeSiloMatrix(
      [{ article: "CG3", silo: "SPF2", quantity: 3.5 }, { article: "CM1", silo: "SPF4", quantity: 16.92 }],
      [],
      SILOS,
      ARTICLES,
    );
    const occupancy = computeSiloOccupancy(matrix, SILOS, ARTICLES);

    expect(occupancy).toEqual([
      { silo: "SPF1", article: null, quantity: null, articles: [] },
      { silo: "SPF2", article: "CG3", quantity: 3.5, articles: [{ article: "CG3", quantity: 3.5 }] },
      { silo: "SPF3", article: null, quantity: null, articles: [] },
      { silo: "SPF4", article: "CM1", quantity: 16.92, articles: [{ article: "CM1", quantity: 16.92 }] },
    ]);
  });

  // Bug signalé : après des expéditions de DG3 et de DG4 depuis un même silo,
  // le stock du second article disparaissait des totaux (seul le premier
  // article du silo était compté, comme dans l'ancien classeur).
  it("compte tous les articles d'un silo partagé (DG3 et DG4 dans SPF11) dans le stock par article et le total", () => {
    const articles = ["DG3", "DG4"];
    const matrix = computeSiloMatrix(
      [{ article: "DG3", silo: "SPF11", quantity: 20 }, { article: "DG4", silo: "SPF11", quantity: 15 }],
      [{ article: "DG3", silo: "SPF11", quantity: 8 }, { article: "DG4", silo: "SPF11", quantity: 5 }],
      ["SPF11"],
      articles,
    );
    const occupancy = computeSiloOccupancy(matrix, ["SPF11"], articles);

    expect(occupancy).toEqual([
      { silo: "SPF11", article: "DG3", quantity: 22, articles: [{ article: "DG3", quantity: 12 }, { article: "DG4", quantity: 10 }] },
    ]);
    expect(computeArticleStock(occupancy, articles)).toEqual([
      { article: "DG3", quantity: 12 },
      { article: "DG4", quantity: 10 },
    ]);
    expect(computeTotalStock(occupancy)).toBe(22);
  });

  it("présente d'abord l'article le plus abondant d'un silo mixte (un reliquat ne masque pas la nouvelle production)", () => {
    const articles = ["DG3", "DG4"];
    const matrix = computeSiloMatrix(
      [{ article: "DG3", silo: "SPF5", quantity: 2 }, { article: "DG4", silo: "SPF5", quantity: 20 }],
      [],
      ["SPF5"],
      articles,
    );
    const [occupancy] = computeSiloOccupancy(matrix, ["SPF5"], articles);

    expect(occupancy.article).toBe("DG4");
    expect(occupancy.quantity).toBe(22);
    expect(occupancy.articles).toEqual([{ article: "DG4", quantity: 20 }, { article: "DG3", quantity: 2 }]);
  });

  it("totalise le stock par article à partir des silos occupés", () => {
    const matrix = computeSiloMatrix(
      [
        { article: "CG3", silo: "SPF2", quantity: 3.5 },
        { article: "CG3", silo: "SPF3", quantity: 25.48 },
        { article: "CG25", silo: "SPF4", quantity: 25.36 },
      ],
      [],
      SILOS,
      ARTICLES,
    );
    const occupancy = computeSiloOccupancy(matrix, SILOS, ARTICLES);

    expect(computeArticleStock(occupancy, ARTICLES)).toEqual([
      { article: "CM1", quantity: 0 },
      { article: "CG25", quantity: 25.36 },
      { article: "CG3", quantity: 28.98 },
    ]);
    expect(computeTotalStock(occupancy)).toBe(54.34);
  });

  it("neutralise les arrondis flottants hérités des sommes successives", () => {
    const matrix = computeSiloMatrix(
      [{ article: "CG3", silo: "SPF1", quantity: 55 }],
      [{ article: "CG3", silo: "SPF1", quantity: 29.52 }, { article: "CG3", silo: "SPF1", quantity: 0.93 }],
      ["SPF1"],
      ["CG3"],
    );

    expect(matrix.SPF1.CG3).toBe(24.55);
  });

  it("calcule la quantité encore disponible pour une expédition, comme sur la carte du silo", () => {
    // Reprend l'exemple observé à l'écran : SPF2/CG3 affiche 3,50 T disponibles.
    const allocations = [{ article: "CG3", silo: "SPF2", quantity: 15 }];
    const shipments = [{ id: 1, article: "CG3", silo: "SPF2", quantity: 11.5 }];

    expect(computeShipmentAvailability(allocations, shipments, "SPF2", "CG3")).toBe(3.5);
    // Une expédition de 5 T dépasserait donc ce disponible : c'est ce que le routeur doit bloquer.
    expect(computeShipmentAvailability(allocations, shipments, "SPF2", "CG3")).toBeLessThan(5);
  });

  it("rend à l'expédition modifiée sa propre quantité avant de calculer le disponible", () => {
    const allocations = [{ article: "CG3", silo: "SPF2", quantity: 15 }];
    const shipments = [{ id: 1, article: "CG3", silo: "SPF2", quantity: 11.5 }];

    // Sans exclusion : 15 - 11.5 = 3.5 (l'expédition existante compte double si on veut la modifier).
    expect(computeShipmentAvailability(allocations, shipments, "SPF2", "CG3")).toBe(3.5);
    // En excluant l'expédition #1 (celle qu'on modifie) : toute la quantité produite redevient disponible.
    expect(computeShipmentAvailability(allocations, shipments, "SPF2", "CG3", 1)).toBe(15);
  });

  it("ne renvoie jamais une disponibilité négative", () => {
    const allocations = [{ article: "CG3", silo: "SPF4", quantity: 10 }];
    const shipments = [{ id: 1, article: "CG3", silo: "SPF4", quantity: 12 }];

    expect(computeShipmentAvailability(allocations, shipments, "SPF4", "CG3")).toBe(0);
  });
});
