import { useEffect, useMemo, useState } from "react";

/**
 * Découpe `items` en pages côté client, avec une taille de page ajustable par
 * l'utilisateur (voir ListPagination). `resetKey` doit changer (ex. les
 * filtres actifs, sous forme de tableau/chaîne) chaque fois que la LISTE de
 * résultats change de nature plutôt que son simple contenu (nouvelle
 * recherche, nouveau filtre) : sans lui, changer de filtre laisserait
 * l'utilisateur sur la page 3 d'un tout autre jeu de résultats plutôt que de
 * revenir à la page 1. La page est aussi ramenée automatiquement à la
 * dernière page valide si le nombre total de pages diminue (ex. suppression
 * d'une ligne pendant qu'on est sur la dernière page, ou choix d'une taille
 * de page plus grande).
 */
export function usePagination<T>(items: T[], initialPageSize: number, resetKey?: unknown) {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, pageCount);

  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage);
  }, [page, clampedPage]);

  const pageItems = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, clampedPage, pageSize]);

  return { page: clampedPage, setPage, pageCount, pageItems, totalCount: items.length, pageSize, setPageSize };
}
