import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type ListPaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  totalCount: number;
  /** Singulier du mot compté, ex. "ligne", "lot", "entrée". Le "s" du pluriel est ajouté automatiquement. */
  itemLabel: string;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
};

/**
 * Pagination générique (taille de page ajustable + navigation précédent/suivant)
 * pour les listes de l'application. Le sélecteur de taille reste visible dès
 * qu'il y a au moins un résultat ; les boutons de navigation n'apparaissent
 * que si tout ne tient pas sur une seule page.
 */
export default function ListPagination({ page, pageCount, onPageChange, totalCount, itemLabel, pageSize, onPageSizeChange, pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS }: ListPaginationProps) {
  if (totalCount === 0) return null;
  return (
    <nav className="list-pagination" aria-label="Pagination">
      <span className="list-pagination-count">{totalCount} {itemLabel}{totalCount > 1 ? "s" : ""}</span>
      <div className="list-pagination-right">
        <label className="list-pagination-size">
          Afficher
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label="Nombre de résultats par page">
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          par page
        </label>
        {pageCount > 1 && (
          <div className="list-pagination-controls">
            <button type="button" onClick={() => onPageChange(1)} disabled={page === 1} aria-label="Première page"><ChevronsLeft size={15} /></button>
            <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Page précédente"><ChevronLeft size={15} /></button>
            <span className="list-pagination-page">Page {page} / {pageCount}</span>
            <button type="button" onClick={() => onPageChange(page + 1)} disabled={page === pageCount} aria-label="Page suivante"><ChevronRight size={15} /></button>
            <button type="button" onClick={() => onPageChange(pageCount)} disabled={page === pageCount} aria-label="Dernière page"><ChevronsRight size={15} /></button>
          </div>
        )}
      </div>
    </nav>
  );
}
