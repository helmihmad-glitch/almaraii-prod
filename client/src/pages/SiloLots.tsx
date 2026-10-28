import { Fragment, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Ban, Boxes, ChevronDown, Database, Menu, PackageSearch, Pencil, RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { LIVE_QUERY_OPTIONS, trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";
import { SiloEstimateTools, useSiloEstimate } from "@/components/SiloEstimateTools";
import { estimateLotKey, formatSignedTons, type SiloEstimateLot } from "@/lib/siloEstimate";
import ListPagination from "@/components/ListPagination";
import { usePagination } from "@/hooks/usePagination";
import type { LotConsumptionSource } from "../../../server/siloLots";
import "./silo.css";

const PAGE_SIZE = 10;
const fmt = (value: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";
const describeSource = (source: LotConsumptionSource) =>
  source.type === "shipment" ? `Expédition ${source.shipmentType.toLowerCase()} · ${formatDate(source.date)}` : `Correction · ${formatDate(source.date)}`;
// Départage deux lots entrés à la même date : le n° de lot (attribué par le
// système externe à la fabrication) reflète l'ordre réel bien mieux que
// l'ordre de saisie — voir compareLotOrder côté serveur (server/siloLots.ts),
// dupliqué ici plutôt qu'importé pour ne pas embarquer le code serveur dans le bundle client.
const compareLotOrder = (a: { lotNumber: string | null; entryId: number }, b: { lotNumber: string | null; entryId: number }) => {
  if (a.lotNumber && b.lotNumber) return a.lotNumber.localeCompare(b.lotNumber);
  if (a.lotNumber) return -1;
  if (b.lotNumber) return 1;
  return a.entryId - b.entryId;
};

export default function SiloLots() {
  const { openSidebar } = useSidebar();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [siloFilter, setSiloFilter] = useState("all");
  const [articleFilter, setArticleFilter] = useState("all");
  const [lotQuery, setLotQuery] = useState("");
  const [showDepleted, setShowDepleted] = useState(true);
  const [expandedEntryId, setExpandedEntryId] = useState<number | null>(null);

  const meQuery = trpc.auth.me.useQuery();
  const isAdmin = meQuery.data?.role === "admin";

  // Voir client/src/lib/trpc.ts (LIVE_QUERY_OPTIONS) : cette vue de lecture
  // doit refléter les modifications faites depuis un autre onglet ou par
  // une autre personne sans recharger la page manuellement.
  const ledgerQuery = trpc.silo.lotLedger.useQuery(undefined, LIVE_QUERY_OPTIONS);
  const lots = ledgerQuery.data?.lots ?? [];
  const unattributed = ledgerQuery.data?.unattributed ?? [];

  const setDepletion = trpc.silo.setLotDepletion.useMutation({
    onSuccess: async () => { await utils.silo.lotLedger.invalidate(); },
    onError: (error) => toast.error(error.message || "Impossible de modifier le statut de ce lot."),
  });
  const toggleDepletion = (lot: { entryId: number; silo: string; lotNumber: string | null; manuallyDepleted: boolean }) => {
    const confirmMessage = lot.manuallyDepleted
      ? `Réactiver le lot ${lot.lotNumber || "sans numéro"} ? Son statut redeviendra celui calculé automatiquement.`
      : `Marquer le lot ${lot.lotNumber || "sans numéro"} comme épuisé ? Il ne sera plus proposé comme disponible, quelle que soit la quantité restante calculée.`;
    if (!window.confirm(confirmMessage)) return;
    setDepletion.mutate({ entryId: lot.entryId, silo: lot.silo, manuallyDepleted: !lot.manuallyDepleted });
  };
  const editLot = (lot: { entryId: number }) => setLocation(`/silo-pf-production?edit=${lot.entryId}`);

  const silos = useMemo(() => Array.from(new Set(lots.map((lot) => lot.silo))).sort(), [lots]);
  const articles = useMemo(() => Array.from(new Set(lots.map((lot) => lot.article))).sort(), [lots]);

  const filteredLots = useMemo(() => lots
    .filter((lot) => siloFilter === "all" || lot.silo === siloFilter)
    .filter((lot) => articleFilter === "all" || lot.article === articleFilter)
    .filter((lot) => showDepleted || lot.status === "active")
    .filter((lot) => !lotQuery.trim() || (lot.lotNumber ?? "").toLowerCase().includes(lotQuery.trim().toLowerCase()))
    .sort((a, b) => a.silo.localeCompare(b.silo) || (a.entryDate ?? "").localeCompare(b.entryDate ?? "") || compareLotOrder(a, b)),
  [lots, siloFilter, articleFilter, showDepleted, lotQuery]);
  const { page: lotsPage, setPage: setLotsPage, pageCount: lotsPageCount, pageItems: pageLots, pageSize: lotsPageSize, setPageSize: setLotsPageSize } = usePagination(filteredLots, PAGE_SIZE, `${siloFilter}|${articleFilter}|${showDepleted}|${lotQuery}`);

  const activeCount = lots.filter((lot) => lot.status === "active").length;
  const totalRemaining = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);

  // Estimation importée (dernière feuille du classeur « Traçabilité des lots ») : chaque lot
  // estimé retrouve le lot réel du même silo et du même n° de lot ; un lot réel encore
  // actif dans un silo estimé mais absent du fichier est estimé à 0 ; un lot du fichier
  // sans lot réel correspondant est listé à part, en transparence.
  const estimateTools = useSiloEstimate();
  const { estimate } = estimateTools;
  const estimateMatch = useMemo(() => {
    const byRealLot = new Map<string, SiloEstimateLot>();
    const estimateOnly: (SiloEstimateLot & { silo: string })[] = [];
    if (!estimate) return { byRealLot, estimateOnly, silos: new Set<string>() };
    const realByKey = new Map<string, typeof lots>();
    lots.forEach((lot) => {
      const key = estimateLotKey(lot.silo, lot.lotNumber);
      realByKey.set(key, [...(realByKey.get(key) ?? []), lot]);
    });
    const claimed = new Set<string>();
    estimate.silos.forEach((silo) => (silo.lots ?? []).forEach((estimated) => {
      const candidates = (realByKey.get(estimateLotKey(silo.silo, estimated.lotNumber)) ?? [])
        .filter((lot) => !claimed.has(`${lot.entryId}-${lot.silo}`) && (estimated.lotNumber || lot.article === estimated.article))
        .sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
      const match = candidates[0];
      if (match) {
        claimed.add(`${match.entryId}-${match.silo}`);
        byRealLot.set(`${match.entryId}-${match.silo}`, estimated);
      } else {
        estimateOnly.push({ ...estimated, silo: silo.silo });
      }
    }));
    return { byRealLot, estimateOnly, silos: new Set(estimate.silos.map((silo) => silo.silo)) };
  }, [estimate, lots]);
  const estimatedTotal = estimate ? estimate.silos.reduce((sum, silo) => sum + silo.quantity, 0) : 0;
  const estimatedSilosRealTotal = lots.filter((lot) => estimateMatch.silos.has(lot.silo)).reduce((sum, lot) => sum + lot.remainingQuantity, 0);
  const estimateOnlyLots = estimateMatch.estimateOnly
    .filter((lot) => siloFilter === "all" || lot.silo === siloFilter)
    .filter((lot) => articleFilter === "all" || lot.article === articleFilter)
    .filter((lot) => !lotQuery.trim() || (lot.lotNumber ?? "").toLowerCase().includes(lotQuery.trim().toLowerCase()));
  const tableColumns = 9 + (isAdmin ? 1 : 0) + (estimate ? 1 : 0);

  if (ledgerQuery.error) {
    return (
      <main className="silo-screen">
        <header className="silo-topbar"><Link href="/silo-pf" className="silo-back"><ArrowLeft size={16} />État des silos</Link><div className="silo-brand"><div className="silo-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div></header>
        <section className="silo-page"><div className="silo-error-card"><Database size={22} /><div><strong>La traçabilité des lots ne peut pas être chargée</strong><span>{ledgerQuery.error.message}</span></div></div></section>
      </main>
    );
  }

  return (
    <main className="silo-screen">
      <header className="silo-topbar">
        <button className="mobile-menu" onClick={openSidebar} aria-label="Ouvrir le menu"><Menu size={20} /></button>
        <Link href="/silo-pf" className="silo-back"><ArrowLeft size={16} />État des silos</Link>
        <div className="silo-brand"><div className="silo-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div>
      </header>

      <section className="silo-page">
        <div className="silo-hero">
          <div>
            <span className="silo-kicker"><PackageSearch size={14} />Produits finis</span>
            <h1>Traçabilité des <em>lots</em></h1>
          </div>
          <div className="silo-hero-actions">
            <div className="silo-total-card">
              <span>Quantité tracée restante</span>
              <strong>{ledgerQuery.isLoading ? "…" : `${fmt(totalRemaining)} T`}</strong>
              <small>{activeCount} lot(s) actif(s) sur {lots.length}</small>
              {estimate && <small className="silo-estimate-note">≈ {fmt(estimatedTotal)} T estimés sur {estimate.silos.length} silo(s) · écart {formatSignedTons(estimatedTotal - estimatedSilosRealTotal)}</small>}
            </div>
          </div>
        </div>
        <section className="silo-section">
          <div className="silo-section-head">
            <div><span className="silo-section-label"><Boxes size={14} />Détail</span><h2>Historique de Lots</h2></div>
            <div className="silo-filters">
              <label>Silo<select value={siloFilter} onChange={(event) => setSiloFilter(event.target.value)}><option value="all">Tous</option>{silos.map((silo) => <option key={silo} value={silo}>{silo}</option>)}</select></label>
              <label>Article<select value={articleFilter} onChange={(event) => setArticleFilter(event.target.value)}><option value="all">Tous</option>{articles.map((article) => <option key={article} value={article}>{article}</option>)}</select></label>
              <label>N° Lot<input value={lotQuery} onChange={(event) => setLotQuery(event.target.value)} placeholder="Rechercher…" /></label>
              <label className="silo-toggle"><input type="checkbox" checked={showDepleted} onChange={(event) => setShowDepleted(event.target.checked)} />Afficher les lots épuisés</label>
            </div>
          </div>
          <div className="silo-estimate-tools silo-estimate-tools-start"><SiloEstimateTools {...estimateTools} /></div>
          {estimate && <p className="silo-estimate-legend"><b className="silo-estimate-swatch" />Colonne « Estimation » en italique : quantité de chaque lot dans {estimate.fileName}{estimate.sheet ? ` (feuille ${estimate.sheet})` : ""}, affichée pour comparaison avec le restant réel. Rien n’est modifié.</p>}

          {ledgerQuery.isLoading ? <p className="silo-empty">Chargement de la traçabilité…</p> : filteredLots.length === 0 ? <div className="silo-empty-cell">Aucun lot ne correspond à ces filtres.</div> : (
            <div className="silo-table-wrap">
              <table className="silo-list-table silo-lot-table">
                <thead><tr><th></th><th>Silo</th><th>Article</th><th>N° Lot</th><th>Date</th><th>Produit (T)</th><th>Sorti (T)</th><th>Restant (T)</th>{estimate && <th className="silo-estimate-head">Estimation (T)</th>}<th>Statut</th>{isAdmin && <th>Actions</th>}</tr></thead>
                <tbody>
                  {pageLots.map((lot) => {
                    const key = `${lot.entryId}-${lot.silo}`;
                    const expanded = expandedEntryId === lot.entryId;
                    return (
                      <Fragment key={key}>
                        <tr className={lot.status === "depleted" ? "silo-lot-row-depleted" : ""} onClick={() => setExpandedEntryId(expanded ? null : lot.entryId)}>
                          <td className="silo-lot-expand"><ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : undefined }} /></td>
                          <td>{lot.silo}</td>
                          <td className="silo-strong-cell">{lot.article}</td>
                          <td>{lot.lotNumber || "—"}</td>
                          <td>{formatDate(lot.entryDate)}</td>
                          <td>{fmt(lot.producedQuantity)}</td>
                          <td>{fmt(lot.consumedQuantity)}</td>
                          <td className="silo-strong-cell">{fmt(lot.remainingQuantity)}</td>
                          {estimate && (() => {
                            const estimated = estimateMatch.byRealLot.get(key);
                            // Lot réel encore actif dans un silo du fichier, mais absent de l'estimation : estimé vide.
                            const quantity = estimated ? estimated.quantity : estimateMatch.silos.has(lot.silo) && lot.remainingQuantity > 0 ? 0 : undefined;
                            if (quantity === undefined) return <td className="silo-estimate-cell">—</td>;
                            const gap = quantity - lot.remainingQuantity;
                            return (
                              <td className="silo-estimate-cell">
                                ≈ {fmt(quantity)}{!estimated && <small> absent du fichier</small>}
                                {Math.abs(gap) >= 0.005 && <small className="silo-estimate-gap">{formatSignedTons(gap)}</small>}
                              </td>
                            );
                          })()}
                          <td><span className={`silo-lot-status silo-lot-status-${lot.status}`} title={lot.manuallyDepleted ? "Fermé manuellement, quelle que soit la quantité réellement sortie." : undefined}>{lot.status === "active" ? "Actif" : lot.manuallyDepleted ? "Épuisé (manuel)" : "Épuisé"}</span></td>
                          {isAdmin && (
                            <td onClick={(event) => event.stopPropagation()}>
                              <span className="silo-row-actions">
                                <button type="button" onClick={() => editLot(lot)} aria-label="Modifier ce lot" title="Modifier ce lot"><Pencil size={14} /></button>
                                <button type="button" onClick={() => toggleDepletion(lot)} disabled={setDepletion.isPending} aria-label={lot.manuallyDepleted ? "Réactiver ce lot" : "Marquer ce lot comme épuisé"} title={lot.manuallyDepleted ? "Réactiver ce lot" : "Marquer ce lot comme épuisé"}>
                                  {lot.manuallyDepleted ? <RotateCcw size={14} /> : <Ban size={14} />}
                                </button>
                              </span>
                            </td>
                          )}
                        </tr>
                        {expanded && (
                          <tr className="silo-lot-detail-row">
                            <td colSpan={tableColumns}>
                              {lot.consumptions.length === 0 ? <p className="silo-lot-detail-empty">Aucune sortie n’a encore consommé ce lot.</p> : (
                                <ul className="silo-lot-detail-list">
                                  {lot.consumptions.map((consumption, index) => (
                                    <li key={index}><span>{describeSource(consumption.source)}</span><strong>-{fmt(consumption.quantity)} T</strong></li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <ListPagination page={lotsPage} pageCount={lotsPageCount} onPageChange={setLotsPage} totalCount={filteredLots.length} itemLabel="lot" pageSize={lotsPageSize} onPageSizeChange={setLotsPageSize} />
          {estimate && estimateOnlyLots.length > 0 && (
            <div className="silo-estimate-only">
              <h3>{estimateOnlyLots.length} lot(s) présent(s) seulement dans l’estimation</h3>
              <div className="silo-table-wrap">
                <table className="silo-list-table silo-lot-table">
                  <thead><tr><th>Silo</th><th>Article</th><th>N° Lot</th><th>Date</th><th>Estimation (T)</th></tr></thead>
                  <tbody>
                    {estimateOnlyLots.map((lot, index) => (
                      <tr key={`${lot.silo}-${lot.lotNumber ?? "sans"}-${index}`} className="silo-lot-row-estimate-only">
                        <td>{lot.silo}</td>
                        <td className="silo-strong-cell">{lot.article}</td>
                        <td>{lot.lotNumber || "—"}</td>
                        <td>{lot.date || "—"}</td>
                        <td className="silo-estimate-cell">≈ {fmt(lot.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
           {unattributed.length > 0 && (
          <div className="silo-error-card silo-warning-card">
            <TriangleAlert size={20} />
            <div>
              <strong>{unattributed.length} sortie(s) sans lot d’origine connu</strong>
              <span>Une expédition ou une correction dépasse la production tracée pour cet article et ce silo — vérifiez si un lot ancien manque à la saisie.</span>
              <ul>
                {unattributed.map((item, index) => (
                  <li key={index}>{item.silo} · {item.article} : {fmt(item.quantity)} T non attribuée ({describeSource(item.source)})</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
