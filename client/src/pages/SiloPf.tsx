import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Boxes, Database, Layers, Menu, PackageSearch, Truck, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { LIVE_QUERY_OPTIONS, trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";
import { getSiloFillStatus, SILO_CAPACITY_TONS } from "@shared/silo";
import "./silo.css";

const fmt = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? "—" : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";
const signedTons = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${fmt(Math.abs(value), 2)} T`;

/**
 * Estimation importée (classeur « Traçabilité des lots » retouché) : affichée en
 * transparence à côté du stock réel, jamais enregistrée. Gardée dans ce navigateur
 * jusqu'à « Retirer », pour survivre à un rechargement de la page.
 */
type SiloEstimate = { silo: string; quantity: number; articles: { article: string; quantity: number }[] };
type StoredEstimate = { fileName: string; sheet?: string | null; label: string | null; silos: SiloEstimate[] };
const ESTIMATE_STORAGE_KEY = "silo-pf-estimate";

function loadStoredEstimate(): StoredEstimate | null {
  try {
    const raw = window.localStorage.getItem(ESTIMATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as StoredEstimate : null;
    return parsed && Array.isArray(parsed.silos) ? parsed : null;
  } catch {
    return null;
  }
}

function storeEstimate(estimate: StoredEstimate | null) {
  try {
    if (estimate) window.localStorage.setItem(ESTIMATE_STORAGE_KEY, JSON.stringify(estimate));
    else window.localStorage.removeItem(ESTIMATE_STORAGE_KEY);
  } catch {
    // Stockage indisponible (navigation privée) : l'estimation reste affichée jusqu'au rechargement.
  }
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Le fichier n’a pas pu être lu."));
    reader.readAsDataURL(file);
  });
}

export default function SiloPf() {
  const { openSidebar } = useSidebar();
  const [showEmptySilos, setShowEmptySilos] = useState(true);
  // Les silos sont souvent modifiés depuis un autre onglet (page de saisie) ou
  // par une autre personne : on rafraîchit systématiquement au retour sur la
  // page et à intervalle régulier, plutôt que de dépendre uniquement de
  // l’invalidation déclenchée par la page de saisie.
  const stateQuery = trpc.silo.state.useQuery(undefined, LIVE_QUERY_OPTIONS);
  const entriesQuery = trpc.silo.listEntries.useQuery(undefined, LIVE_QUERY_OPTIONS);
  const shipmentsQuery = trpc.silo.listShipments.useQuery(undefined, LIVE_QUERY_OPTIONS);

  const [estimate, setEstimate] = useState<StoredEstimate | null>(loadStoredEstimate);
  const estimateInputRef = useRef<HTMLInputElement>(null);
  const parseEstimate = trpc.silo.parseEstimate.useMutation();
  const estimateBySilo = useMemo(() => new Map((estimate?.silos ?? []).map((item) => [item.silo, item])), [estimate]);

  const state = stateQuery.data;
  const silos = state?.silos ?? [];
  const occupancy = state?.occupancy ?? [];
  const visibleOccupancy = showEmptySilos ? occupancy : occupancy.filter((row) => row.article || (estimateBySilo.get(row.silo)?.quantity ?? 0) > 0);
  const occupiedCount = occupancy.filter((row) => row.article).length;
  const totalCapacity = silos.length * SILO_CAPACITY_TONS;
  const estimatedTotal = estimate ? estimate.silos.reduce((sum, item) => sum + item.quantity, 0) : 0;
  // Écart total sur les seuls silos présents dans le fichier : un silo absent n'a pas d'estimation.
  const estimatedSilosRealTotal = occupancy.filter((row) => estimateBySilo.has(row.silo)).reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  const estimatedArticleStock = useMemo(() => {
    const totals = new Map<string, number>();
    (estimate?.silos ?? []).forEach((item) => item.articles.forEach((line) => totals.set(line.article, (totals.get(line.article) ?? 0) + line.quantity)));
    return totals;
  }, [estimate]);

  const handleEstimateFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) { toast.error("Sélectionnez un classeur Excel au format .xlsx."); return; }
    if (file.size > 2_500_000) { toast.error("Le fichier Excel est trop volumineux (2,5 Mo maximum)."); return; }
    try {
      const result = await parseEstimate.mutateAsync({ fileName: file.name, fileBase64: await readFileAsBase64(file) });
      const next: StoredEstimate = { fileName: file.name, sheet: result.sheet, label: result.label, silos: result.silos.map(({ silo, quantity, articles }) => ({ silo, quantity, articles })) };
      setEstimate(next);
      storeEstimate(next);
      toast.success("Estimation affichée", { description: `${result.silos.length} silo(s) lus dans ${file.name}${result.sheet ? `, feuille « ${result.sheet} »` : ""}. Le stock réel n’est pas modifié.` });
      if (result.errors.length) toast.warning(`${result.errors.length} remarque(s) sur le fichier`, { description: result.errors.slice(0, 4).join(" ") });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’import de l’estimation a échoué.");
    }
  };
  const clearEstimate = () => { setEstimate(null); storeEstimate(null); };

  const recentEntries = useMemo(() => (entriesQuery.data ?? []).slice(0, 8), [entriesQuery.data]);
  const recentShipments = useMemo(() => (shipmentsQuery.data ?? []).slice(0, 8), [shipmentsQuery.data]);

  if (stateQuery.error) {
    return (
      <main className="silo-screen">
        <header className="silo-topbar"><Link href="/" className="silo-back"><ArrowLeft size={16} />Accueil</Link><div className="silo-brand"><div className="silo-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div></header>
        <section className="silo-page"><div className="silo-error-card"><Database size={22} /><div><strong>Les silos ne peuvent pas être chargés</strong><span>{stateQuery.error.message}</span></div></div></section>
      </main>
    );
  }

  return (
    <main className="silo-screen">
      <header className="silo-topbar">
        <button className="mobile-menu" onClick={openSidebar} aria-label="Ouvrir le menu"><Menu size={20} /></button>
        <Link href="/" className="silo-back"><ArrowLeft size={16} />Accueil</Link>
        <div className="silo-brand"><div className="silo-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div>
        <div className="silo-manage-links">
          <Link href="/silo-pf-production" className="silo-manage-link"><Boxes size={15} />Production</Link>
          <Link href="/silo-pf-expedition" className="silo-manage-link"><Truck size={15} />Expédition</Link>
        </div>
      </header>

      <section className="silo-page">
        <div className="silo-hero">
          <div>
            <span className="silo-kicker"><Boxes size={14} />Produits finis</span>
            <h1>État des <em>silos</em></h1>
          </div>
          <div className="silo-hero-actions">
            <div className="silo-total-card">
              <span>Stock total PF</span>
              <strong>{stateQuery.isLoading ? "…" : `${fmt(state?.totalStock ?? 0, 2)} T`}</strong>
              <div className="silo-total-bar">
                <i style={{ width: `${Math.min((state?.totalStock ?? 0) / totalCapacity * 100, 100)}%` }} />
                {estimate && <b className="silo-estimate-layer" style={{ width: `${Math.min(estimatedTotal / totalCapacity * 100, 100)}%` }} />}
              </div>
              <small>{occupiedCount} silo(s) occupé(s) sur {silos.length} · capacité totale {totalCapacity} T</small>
              {estimate && <small className="silo-estimate-note">≈ {fmt(estimatedTotal, 2)} T estimés sur {estimate.silos.length} silo(s) · écart {signedTons(estimatedTotal - estimatedSilosRealTotal)}</small>}
            </div>
          </div>
        </div>

        <section className="silo-section">
          <div className="silo-section-head">
            <div><span className="silo-section-label"><Layers size={14} />Occupation</span><h2>Silos</h2></div>
            <div className="silo-estimate-tools">
              <input ref={estimateInputRef} type="file" accept=".xlsx" onChange={handleEstimateFile} hidden />
              {estimate ? (
                <span className="silo-estimate-chip" title={estimate.fileName}>
                  Estimation{estimate.sheet ? ` · feuille ${estimate.sheet}` : ""}{estimate.label ? ` · ${estimate.label}` : ""}
                  <button type="button" onClick={clearEstimate} aria-label="Retirer l’estimation"><X size={13} />Retirer</button>
                </span>
              ) : null}
              <button type="button" className="silo-manage-link" onClick={() => estimateInputRef.current?.click()} disabled={parseEstimate.isPending}>
                <Upload size={14} />{parseEstimate.isPending ? "Lecture…" : estimate ? "Remplacer l’estimation" : "Importer une estimation"}
              </button>
              <label className="silo-toggle"><input type="checkbox" checked={showEmptySilos} onChange={(event) => setShowEmptySilos(event.target.checked)} />Afficher les silos vides</label>
            </div>
          </div>
          {estimate && <p className="silo-estimate-legend"><b className="silo-estimate-swatch" />Partie hachurée et texte en italique : estimation importée depuis {estimate.fileName}, affichée pour comparaison. Le stock réel n’est pas modifié.</p>}
          {stateQuery.isLoading ? <p className="silo-empty">Chargement de l’état des silos…</p> : (
            <div className="silo-grid">
              {visibleOccupancy.map((row) => {
                const { percent, status } = getSiloFillStatus(row.quantity);
                const siloEstimate = estimateBySilo.get(row.silo);
                const estimatePercent = siloEstimate ? getSiloFillStatus(siloEstimate.quantity).percent : 0;
                return (
                  <article key={row.silo} className={`silo-card ${row.article ? "silo-card-filled" : "silo-card-empty"} silo-card-status-${status}${siloEstimate ? " silo-card-has-estimate" : ""}`}>
                    <div className="silo-card-head">
                      <strong className="silo-card-name">{row.silo}</strong>
                      {status !== "empty" && <span className={`silo-card-percent silo-card-percent-${status}`}>{percent}%</span>}
                    </div>
                    {row.articles.length > 1 ? (
                      // Silo partagé (un reliquat sous une nouvelle production, par exemple) : chaque article avec sa quantité.
                      <div className="silo-badge-list">
                        {row.articles.map((item) => <span key={item.article} className="silo-badge silo-badge-mixed">{item.article}<small>{fmt(item.quantity, 2)} T</small></span>)}
                      </div>
                    ) : row.article ? <span className="silo-badge">{row.article}</span> : <span className="silo-badge silo-badge-muted">Vide</span>}
                    <p className="silo-card-qty">{row.quantity === null ? "—" : `${fmt(row.quantity, 2)} T`}</p>
                    <div className="silo-card-bar">
                      <i className={`silo-card-bar-fill silo-card-bar-fill-${status}`} style={{ width: `${Math.min(percent, 100)}%` }} />
                      {siloEstimate && <b className="silo-estimate-layer" style={{ width: `${Math.min(estimatePercent, 100)}%` }} />}
                    </div>
                    {siloEstimate && (
                      <p className="silo-card-estimate">
                        <span>≈ {fmt(siloEstimate.quantity, 2)} T estimés{siloEstimate.articles.length ? ` · ${siloEstimate.articles.map((item) => item.article).join(", ")}` : " · vide"}</span>
                        <small>écart {signedTons(siloEstimate.quantity - (row.quantity ?? 0))}</small>
                      </p>
                    )}
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
            {(state?.articleStock ?? []).filter((row) => row.quantity > 0 || estimatedArticleStock.has(row.article)).map((row) => (
              <div key={row.article} className="silo-article-chip">
                <strong>{row.article}</strong><span>{fmt(row.quantity, 2)} T</span>
                {estimate && <small className="silo-estimate-note">≈ {fmt(estimatedArticleStock.get(row.article) ?? 0, 2)} T estimés</small>}
              </div>
            ))}
            {Array.from(estimatedArticleStock.entries()).filter(([article]) => !(state?.articleStock ?? []).some((row) => row.article === article)).map(([article, quantity]) => (
              <div key={`estimate-${article}`} className="silo-article-chip silo-article-chip-estimate"><strong>{article}</strong><span>—</span><small className="silo-estimate-note">≈ {fmt(quantity, 2)} T estimés</small></div>
            ))}
            {!stateQuery.isLoading && (state?.articleStock ?? []).every((row) => row.quantity <= 0) && <p className="silo-empty">Aucun stock enregistré.</p>}
          </div>
        </section>
        
        <div className="silo-recent-grid">
          <section className="silo-section">
            <div className="silo-section-head"><div><span className="silo-section-label"><Boxes size={14} />Entrées</span><h2>Dernières productions</h2></div><Link href="/silo-pf-production" className="silo-inline-link">Gérer</Link></div>
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
            <div className="silo-section-head"><div><span className="silo-section-label"><Truck size={14} />Sorties</span><h2>Dernières expéditions</h2></div><Link href="/silo-pf-expedition" className="silo-inline-link">Gérer</Link></div>
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
