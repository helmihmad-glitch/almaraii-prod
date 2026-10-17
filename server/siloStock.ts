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
//  · Feuille « Silo_Article » : le classeur ne retenait qu’un article par
//    silo (le premier de la ligne) et ne comptait que lui dans « Stock
//    _Article ». Un silo peut pourtant contenir deux articles à la fois (un
//    reliquat de DG3 sous une nouvelle production de DG4, par exemple) : le
//    stock de l’article suivant disparaissait alors des totaux. L’occupation
//    liste donc ici tous les articles présents, et les totaux reprennent
//    chaque case de la matrice.

export type SiloAllocationInput = { article: string; silo: string; quantity: number };
export type SiloShipmentInput = { article: string; silo: string; quantity: number };

export type SiloMatrix = Record<string, Record<string, number | null>>;
export type SiloArticleQuantity = { article: string; quantity: number };
/**
 * `article` : l’article principal du silo (la plus grande quantité), `quantity` :
 * le total du silo, tous articles confondus, et `articles` : le détail de chaque
 * article présent (plusieurs dès qu’un silo est mixte).
 */
export type SiloOccupancy = { silo: string; article: string | null; quantity: number | null; articles: SiloArticleQuantity[] };
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
 * Occupation de chaque silo : tous les articles au solde positif, du plus
 * abondant au moins abondant (à quantité égale, dans l’ordre configuré).
 */
export function computeSiloOccupancy(matrix: SiloMatrix, silos: readonly string[], articles: readonly string[]): SiloOccupancy[] {
  return silos.map((silo) => {
    const row = matrix[silo] ?? {};
    const present = articles
      .map((article, index) => ({ article, quantity: row[article] ?? null, index }))
      .filter((item): item is { article: string; quantity: number; index: number } => item.quantity !== null)
      .sort((a, b) => b.quantity - a.quantity || a.index - b.index)
      .map(({ article, quantity }) => ({ article, quantity }));
    if (present.length === 0) return { silo, article: null, quantity: null, articles: [] };
    return { silo, article: present[0].article, quantity: roundQuantity(present.reduce((total, item) => total + item.quantity, 0)), articles: present };
  });
}

/** Stock par article : chaque silo où l’article est présent compte, y compris un silo partagé avec un autre article. */
export function computeArticleStock(occupancy: SiloOccupancy[], articles: readonly string[]): ArticleStock[] {
  return articles.map((article) => ({
    article,
    quantity: roundQuantity(occupancy.reduce(
      (total, row) => total + row.articles.filter((item) => item.article === article).reduce((sum, item) => sum + item.quantity, 0),
      0,
    )),
  }));
}

/** Total général du produit fini stocké, tous silos et tous articles confondus. */
export function computeTotalStock(occupancy: SiloOccupancy[]) {
  return roundQuantity(occupancy.reduce((total, row) => total + (row.quantity ?? 0), 0));
}

export type SiloShipmentRecord = SiloShipmentInput & { id: number };

/**
 * Quantité d'un article encore disponible dans un silo pour une expédition :
 * la même formule que `computeSiloMatrix`, mais en excluant au besoin
 * l'expédition en cours de modification (`excludeShipmentId`) de ses propres
 * expéditions déjà comptées — sans quoi modifier une expédition existante se
 * heurterait à sa propre quantité déjà déduite du stock.
 */
export function computeShipmentAvailability(
  allocations: SiloAllocationInput[],
  shipments: SiloShipmentRecord[],
  silo: string,
  article: string,
  excludeShipmentId?: number,
): number {
  const remainingShipments = excludeShipmentId === undefined
    ? shipments
    : shipments.filter((shipment) => shipment.id !== excludeShipmentId);
  const matrix = computeSiloMatrix(allocations, remainingShipments, [silo], [article]);
  return matrix[silo]?.[article] ?? 0;
}
