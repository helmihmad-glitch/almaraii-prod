// Calculs d’état des silos de produits finis.
//
// Ces fonctions reproduisent à l’identique les formules du classeur
// Silo_PF.xlsx :
//
//  · Feuille « Etat final silo » (matrice silo × article) :
//      =IF((SUMIF(Production.Article, article, Production.<colonne du silo>)
//           - SUMIFS(Expédition.Qté, Expédition.Article, article,
//                                    Expédition.Silo, silo)) <= 0,
//          "", <la même différence>)
//    → une case vide dès que le solde est nul ou négatif.
//
//  · Feuille « Silo_Article » :
//      Article du silo = premier article (dans l’ordre des colonnes) dont la
//        case de la ligne du silo n’est pas vide ;
//      Qté du silo     = la valeur de cette case ;
//      Stock _Article  = SUMIF sur ces lignes, c’est-à-dire la somme des seules
//        quantités effectivement affichées par silo.

export type SiloAllocationInput = { article: string; silo: string; quantity: number };
export type SiloShipmentInput = { article: string; silo: string; quantity: number };

export type SiloMatrix = Record<string, Record<string, number | null>>;
export type SiloOccupancy = { silo: string; article: string | null; quantity: number | null };
export type ArticleStock = { article: string; quantity: number };

/** Arrondi de présentation : évite les 25.479999999999997 hérités des flottants. */
export function roundQuantity(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Matrice silo × article : entrées de production moins expéditions.
 * Une case vaut `null` (case vide du classeur) dès que le solde est ≤ 0.
 */
export function computeSiloMatrix(
  allocations: SiloAllocationInput[],
  shipments: SiloShipmentInput[],
  silos: readonly string[],
  articles: readonly string[],
): SiloMatrix {
  const produced = new Map<string, number>();
  const shipped = new Map<string, number>();
  const key = (silo: string, article: string) => `${silo}::${article}`;

  for (const allocation of allocations) {
    const mapKey = key(allocation.silo, allocation.article);
    produced.set(mapKey, (produced.get(mapKey) ?? 0) + allocation.quantity);
  }
  for (const shipment of shipments) {
    const mapKey = key(shipment.silo, shipment.article);
    shipped.set(mapKey, (shipped.get(mapKey) ?? 0) + shipment.quantity);
  }

  const matrix: SiloMatrix = {};
  for (const silo of silos) {
    matrix[silo] = {};
    for (const article of articles) {
      const mapKey = key(silo, article);
      const balance = roundQuantity((produced.get(mapKey) ?? 0) - (shipped.get(mapKey) ?? 0));
      matrix[silo][article] = balance <= 0 ? null : balance;
    }
  }
  return matrix;
}

/**
 * Occupation de chaque silo : le premier article de la ligne ayant un solde
 * positif, comme le fait l’INDEX/MATCH de la feuille « Silo_Article ».
 */
export function computeSiloOccupancy(matrix: SiloMatrix, silos: readonly string[], articles: readonly string[]): SiloOccupancy[] {
  return silos.map((silo) => {
    const row = matrix[silo] ?? {};
    const article = articles.find((candidate) => row[candidate] !== null && row[candidate] !== undefined) ?? null;
    return { silo, article, quantity: article ? row[article] ?? null : null };
  });
}

/**
 * Stock par article : somme des quantités affichées par silo, à l’identique du
 * SUMIF de la colonne « Stock _Article ». Un article présent dans un silo déjà
 * attribué à un autre article n’est donc pas compté, exactement comme dans le
 * classeur.
 */
export function computeArticleStock(occupancy: SiloOccupancy[], articles: readonly string[]): ArticleStock[] {
  return articles.map((article) => ({
    article,
    quantity: roundQuantity(occupancy
      .filter((row) => row.article === article)
      .reduce((total, row) => total + (row.quantity ?? 0), 0)),
  }));
}

/** Total général du produit fini stocké, tous silos confondus. */
export function computeTotalStock(occupancy: SiloOccupancy[]) {
  return roundQuantity(occupancy.reduce((total, row) => total + (row.quantity ?? 0), 0));
}
