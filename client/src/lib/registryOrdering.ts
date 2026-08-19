export type DatedProductionRow = {
  date: string;
  article: string;
};

/** Trie les lignes de la plus ancienne à la plus récente. L’interface inverse ensuite cet ordre pour afficher les dernières en premier. */
export function orderProductionRows<T extends DatedProductionRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.article.localeCompare(b.article));
}
