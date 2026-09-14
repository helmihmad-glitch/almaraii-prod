import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Boxes, Database, Download, Layers, Menu, PackageSearch, SlidersHorizontal, Truck } from "lucide-react";
import { toast } from "sonner";
import { LIVE_QUERY_OPTIONS, trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";
import { getSiloFillStatus, SILO_CAPACITY_TONS } from "@shared/silo";
import "./silo.css";

/** Hauteur utile du pictogramme (de haut de silo à pointe du cône) dans le viewBox 120×156. */
const SHAPE_FILL_HEIGHT = 144;
const SHAPE_TIP_Y = 150;

const fmt = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? "—" : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";

export default function SiloPf() {
  const { openSidebar } = useSidebar();
  const [showEmptySilos, setShowEmptySilos] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const exportWorkbook = trpc.useUtils().silo.exportExcel;

  const downloadWorkbook = async () => {
    setIsExporting(true);
    try {
      const { fileName, fileBase64 } = await exportWorkbook.fetch();
      const bytes = Uint8Array.from(atob(fileBase64), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Classeur Silo PF exporté", { description: fileName });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’export du classeur a échoué.");
    } finally {
      setIsExporting(false);
    }
  };
  // Les silos sont souvent modifiés depuis un autre onglet (page de saisie) ou
  // par une autre personne : on rafraîchit systématiquement au retour sur la
  // page et à intervalle régulier, plutôt que de dépendre uniquement de
  // l’invalidation déclenchée par la page de saisie.
  const stateQuery = trpc.silo.state.useQuery(undefined, LIVE_QUERY_OPTIONS);
  const entriesQuery = trpc.silo.listEntries.useQuery(undefined, LIVE_QUERY_OPTIONS);
  const shipmentsQuery = trpc.silo.listShipments.useQuery(undefined, LIVE_QUERY_OPTIONS);

  const state = stateQuery.data;
  const silos = state?.silos ?? [];
  const articles = state?.articles ?? [];
  const occupancy = state?.occupancy ?? [];
  const visibleOccupancy = showEmptySilos ? occupancy : occupancy.filter((row) => row.article);
  const occupiedCount = occupancy.filter((row) => row.article).length;
  const totalCapacity = silos.length * SILO_CAPACITY_TONS;

  const recentEntries = useMemo(() => (entriesQuery.data ?? []).slice(0, 8), [entriesQuery.data]);
  const recentShipments = useMemo(() => (shipmentsQuery.data ?? []).slice(0, 8), [shipmentsQuery.data]);

  if (stateQuery.error) {
    return (
      <main className="silo-screen">
        <header className="silo-topbar"><Link href="/" className="silo-back"><ArrowLeft size={16} />Vue d’ensemble</Link><div className="silo-brand"><div className="silo-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div></header>
        <section className="silo-page"><div className="silo-error-card"><Database size={22} /><div><strong>Les silos ne peuvent pas être chargés</strong><span>{stateQuery.error.message}</span></div></div></section>
      </main>
    );
  }

  return (
    <main className="silo-screen">
      <header className="silo-topbar">
        <button className="mobile-menu" onClick={openSidebar} aria-label="Ouvrir le menu"><Menu size={20} /></button>
        <Link href="/" className="silo-back"><ArrowLeft size={16} />Vue d’ensemble</Link>
        <div className="silo-brand"><div className="silo-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div>
        <Link href="/silo-pf-donnee" className="silo-manage-link"><SlidersHorizontal size={15} />Gérer les mouvements</Link>
      </header>

      <section className="silo-page">
        <div className="silo-hero">
          <div>
            <span className="silo-kicker"><Boxes size={14} />Produits finis</span>
            <h1>État des <em>silos</em></h1>
            <p>Chaque silo affiche l’article qu’il contient et la quantité restante : entrées de production moins expéditions, exactement comme le classeur Silo_PF.</p>
          </div>
          <div className="silo-hero-actions">
            <button type="button" className="silo-secondary" onClick={downloadWorkbook} disabled={isExporting}><Download size={15} />{isExporting ? "Export…" : "Exporter le classeur"}</button>
            <div className="silo-total-card">
              <span>Stock total PF</span>
              <strong>{stateQuery.isLoading ? "…" : `${fmt(state?.totalStock ?? 0, 2)} T`}</strong>
              <div className="silo-total-bar"><i style={{ width: `${Math.min((state?.totalStock ?? 0) / totalCapacity * 100, 100)}%` }} /></div>
              <small>{occupiedCount} silo(s) occupé(s) sur {silos.length} · capacité totale {totalCapacity} T</small>
            </div>
          </div>
        </div>

        <section className="silo-section">
          <div className="silo-section-head">
            <div><span className="silo-section-label"><Layers size={14} />Occupation</span><h2>Silos</h2></div>
            <label className="silo-toggle"><input type="checkbox" checked={showEmptySilos} onChange={(event) => setShowEmptySilos(event.target.checked)} />Afficher les silos vides</label>
          </div>
          {stateQuery.isLoading ? <p className="silo-empty">Chargement de l’état des silos…</p> : (
            <div className="silo-grid">
              {visibleOccupancy.map((row) => {
                const clipId = `silo-clip-${row.silo}`;
                const { percent, status } = getSiloFillStatus(row.quantity);
                const fillFraction = Math.min(percent, 100) / 100;
                const fillHeight = fillFraction * SHAPE_FILL_HEIGHT;
                return (
                  <article key={row.silo} className={`silo-shape ${row.article ? "silo-shape-filled" : "silo-shape-empty"} silo-shape-status-${status}`}>
                    <svg className="silo-shape-svg" viewBox="0 0 120 156" preserveAspectRatio="none" aria-hidden="true">
                      <defs><clipPath id={clipId}><path d="M6 6 H114 V96 L60 150 L6 96 Z" /></clipPath></defs>
                      <path className="silo-shape-outline" d="M6 6 H114 V96 L60 150 L6 96 Z" />
                      {fillHeight > 0 && <rect className={`silo-shape-fill silo-shape-fill-${status}`} x="0" y={SHAPE_TIP_Y - fillHeight} width="120" height={fillHeight + 8} clipPath={`url(#${clipId})`} />}
                    </svg>
                    <div className="silo-shape-content">
                      <div className="silo-shape-head">
                        <strong className="silo-shape-name">{row.silo}</strong>
                        {status !== "empty" && <span className={`silo-shape-percent silo-shape-percent-${status}`}>{percent}%</span>}
                      </div>
                      {row.article ? <span className="silo-badge">{row.article}</span> : <span className="silo-badge silo-badge-muted">Vide</span>}
                      <p className="silo-shape-qty">{row.quantity === null ? "—" : <>{fmt(row.quantity, 2)}<small> / {SILO_CAPACITY_TONS} T</small></>}</p>
                    </div>
                  </article>
                );
              })}
              {visibleOccupancy.length === 0 && <p className="silo-empty">Aucun silo occupé pour le moment.</p>}
            </div>
          )}
        </section>

        <section className="silo-section">
          <div className="silo-section-head"><div><span className="silo-section-label"><PackageSearch size={14} />Synthèse</span><h2>Stock par article</h2></div></div>
          <div className="silo-article-stock">
            {(state?.articleStock ?? []).filter((row) => row.quantity > 0).map((row) => (
              <div key={row.article} className="silo-article-chip"><strong>{row.article}</strong><span>{fmt(row.quantity, 2)} T</span></div>
            ))}
            {!stateQuery.isLoading && (state?.articleStock ?? []).every((row) => row.quantity <= 0) && <p className="silo-empty">Aucun stock enregistré.</p>}
          </div>
        </section>

        <section className="silo-section">
          <div className="silo-section-head"><div><span className="silo-section-label"><Layers size={14} />Détail</span><h2>Matrice silo × article</h2></div></div>
          <div className="silo-table-wrap">
            <table className="silo-matrix-table">
              <thead><tr><th>Silo</th>{articles.map((article) => <th key={article}>{article}</th>)}</tr></thead>
              <tbody>
                {silos.map((silo) => (
                  <tr key={silo}>
                    <th scope="row">{silo}</th>
                    {articles.map((article) => {
                      const value = state?.matrix?.[silo]?.[article] ?? null;
                      return <td key={article} className={value === null ? "silo-cell-empty" : "silo-cell-filled"}>{value === null ? "" : fmt(value, 2)}</td>;
                    })}
                  </tr>
                ))}
                {articles.length === 0 && <tr><td className="silo-empty-cell" colSpan={1}>Aucun article configuré.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <div className="silo-recent-grid">
          <section className="silo-section">
            <div className="silo-section-head"><div><span className="silo-section-label"><Boxes size={14} />Entrées</span><h2>Dernières productions</h2></div><Link href="/silo-pf-donnee" className="silo-inline-link">Gérer</Link></div>
            {recentEntries.length ? <div className="silo-table-wrap">
              <table className="silo-list-table">
                <thead><tr><th>Date</th><th>Article</th><th>N° Lot</th><th>Qté (T)</th><th>Répartition</th></tr></thead>
                <tbody>
                  {recentEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.entryDate)}</td>
                      <td className="silo-strong-cell">{entry.article}</td>
                      <td>{entry.lotNumber || "—"}</td>
                      <td>{entry.totalQuantity === null ? "—" : fmt(Number(entry.totalQuantity), 2)}</td>
                      <td className="silo-allocation-cell">{entry.allocations.length ? entry.allocations.map((allocation) => `${allocation.silo}: ${fmt(Number(allocation.quantity), 2)}`).join(" · ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div> : !entriesQuery.isLoading && <div className="silo-empty-cell">Aucune entrée de production enregistrée.</div>}
          </section>

          <section className="silo-section">
            <div className="silo-section-head"><div><span className="silo-section-label"><Truck size={14} />Sorties</span><h2>Dernières expéditions</h2></div><Link href="/silo-pf-donnee" className="silo-inline-link">Gérer</Link></div>
            {recentShipments.length ? <div className="silo-table-wrap">
              <table className="silo-list-table">
                <thead><tr><th>Date</th><th>Article</th><th>N° Lot</th><th>Qté (T)</th><th>Silo</th><th>Type</th></tr></thead>
                <tbody>
                  {recentShipments.map((shipment) => (
                    <tr key={shipment.id}>
                      <td>{formatDate(shipment.shipmentDate)}</td>
                      <td className="silo-strong-cell">{shipment.article}</td>
                      <td>{shipment.lotNumber || "—"}</td>
                      <td>{fmt(Number(shipment.quantity), 2)}</td>
                      <td>{shipment.silo}</td>
                      <td><span className={`silo-type-tag ${shipment.shipmentType === "Vrac" ? "silo-type-vrac" : ""}`}>{shipment.shipmentType}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div> : !shipmentsQuery.isLoading && <div className="silo-empty-cell">Aucune expédition enregistrée.</div>}
          </section>
        </div>
      </section>
    </main>
  );
}
