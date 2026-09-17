import { Fragment, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Ban, Boxes, ChevronDown, Database, Menu, PackageSearch, Pencil, RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { LIVE_QUERY_OPTIONS, trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";
import { SILOS } from "@shared/silo";
import type { LotConsumptionSource } from "../../../server/siloLots";
import "./silo.css";

const fmt = (value: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";
const describeSource = (source: LotConsumptionSource) =>
  source.type === "shipment" ? `Expédition ${source.shipmentType.toLowerCase()} · ${formatDate(source.date)}` : `Correction · ${formatDate(source.date)}`;

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
    // `lot.silo` vient de la traçabilité déjà calculée côté serveur : c'est
    // toujours l'un des silos connus, d'où ce recadrage de type.
    setDepletion.mutate({ entryId: lot.entryId, silo: lot.silo as (typeof SILOS)[number], manuallyDepleted: !lot.manuallyDepleted });
  };
  const editLot = (lot: { entryId: number }) => setLocation(`/silo-pf-production?edit=${lot.entryId}`);

  const silos = useMemo(() => Array.from(new Set(lots.map((lot) => lot.silo))).sort(), [lots]);
  const articles = useMemo(() => Array.from(new Set(lots.map((lot) => lot.article))).sort(), [lots]);

  const filteredLots = useMemo(() => lots
    .filter((lot) => siloFilter === "all" || lot.silo === siloFilter)
    .filter((lot) => articleFilter === "all" || lot.article === articleFilter)
    .filter((lot) => showDepleted || lot.status === "active")
    .filter((lot) => !lotQuery.trim() || (lot.lotNumber ?? "").toLowerCase().includes(lotQuery.trim().toLowerCase()))
    .sort((a, b) => a.silo.localeCompare(b.silo) || (a.entryDate ?? "").localeCompare(b.entryDate ?? "") || a.entryId - b.entryId),
  [lots, siloFilter, articleFilter, showDepleted, lotQuery]);

  const activeCount = lots.filter((lot) => lot.status === "active").length;
  const totalRemaining = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);

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

          {ledgerQuery.isLoading ? <p className="silo-empty">Chargement de la traçabilité…</p> : filteredLots.length === 0 ? <div className="silo-empty-cell">Aucun lot ne correspond à ces filtres.</div> : (
            <div className="silo-table-wrap">
              <table className="silo-list-table silo-lot-table">
                <thead><tr><th></th><th>Silo</th><th>Article</th><th>N° Lot</th><th>Date</th><th>Produit (T)</th><th>Sorti (T)</th><th>Restant (T)</th><th>Statut</th>{isAdmin && <th>Actions</th>}</tr></thead>
                <tbody>
                  {filteredLots.map((lot) => {
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
                            <td colSpan={isAdmin ? 10 : 9}>
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
