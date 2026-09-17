import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Database, FileText, Menu, Pencil, Plus, Trash2, Truck, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadPresigned as uploadToVercelBlob } from "@vercel/blob/client";
import { LIVE_QUERY_OPTIONS, trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";
import { SHIPMENT_TYPES, SILOS } from "@shared/silo";
import "./silo.css";

type ShipmentDraft = { shipmentDate: string; article: string; lotNumber: string; quantity: string; silo: string; shipmentType: string };

const today = () => new Date().toISOString().slice(0, 10);
const emptyShipment = (): ShipmentDraft => ({ shipmentDate: today(), article: "", lotNumber: "", quantity: "", silo: "", shipmentType: SHIPMENT_TYPES[0] });
const siloRank = (value: string) => SILOS.indexOf(value as (typeof SILOS)[number]);
const fmt = (value: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";
/** Accepte « 12,5 » comme « 12.5 ». Renvoie undefined si la saisie est vide. */
const parseQuantity = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function SiloExpedition() {
  const { openSidebar } = useSidebar();
  const utils = trpc.useUtils();
  const [shipmentDraft, setShipmentDraft] = useState<ShipmentDraft>(emptyShipment);
  const [editingShipmentId, setEditingShipmentId] = useState<number | null>(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [pendingPdfImport, setPendingPdfImport] = useState<File | null>(null);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const pdfImportInputRef = useRef<HTMLInputElement>(null);
  const [shipmentSiloFilter, setShipmentSiloFilter] = useState("all");
  const [shipmentArticleFilter, setShipmentArticleFilter] = useState("all");
  const [shipmentLotQuery, setShipmentLotQuery] = useState("");

  const shipmentsQuery = trpc.silo.listShipments.useQuery(undefined, LIVE_QUERY_OPTIONS);
  const articlesQuery = trpc.settings.listArticles.useQuery();
  // Voir client/src/lib/trpc.ts (LIVE_QUERY_OPTIONS) : sert à suggérer automatiquement
  // le N° Lot puis le silo (ou l'inverse) à partir des lots encore actifs.
  const ledgerQuery = trpc.silo.lotLedger.useQuery(undefined, LIVE_QUERY_OPTIONS);
  // Sert à bloquer tout de suite une expédition supérieure au stock affiché sur les cartes silo,
  // sans attendre l'aller-retour serveur (qui reste la vérification faisant foi, y compris pour
  // les modifications — voir assertShipmentWithinStock côté serveur).
  const stateQuery = trpc.silo.state.useQuery(undefined, LIVE_QUERY_OPTIONS);
  const shipments = shipmentsQuery.data ?? [];
  const articles = articlesQuery.data ?? [];

  // Ordre SPF1 → SPF12 (jamais alphabétique, qui placerait SPF10 avant SPF2), silos réellement utilisés uniquement.
  const shipmentSiloOptions = useMemo(() => SILOS.filter((silo) => shipments.some((shipment) => shipment.silo === silo)), [shipments]);
  const shipmentArticleOptions = useMemo(() => Array.from(new Set(shipments.map((shipment) => shipment.article))).sort(), [shipments]);
  const filteredShipments = useMemo(() => shipments
    .filter((shipment) => shipmentSiloFilter === "all" || shipment.silo === shipmentSiloFilter)
    .filter((shipment) => shipmentArticleFilter === "all" || shipment.article === shipmentArticleFilter)
    .filter((shipment) => !shipmentLotQuery.trim() || (shipment.lotNumber ?? "").toLowerCase().includes(shipmentLotQuery.trim().toLowerCase())),
  [shipments, shipmentSiloFilter, shipmentArticleFilter, shipmentLotQuery]);

  // Lots encore actifs pour l'article en cours de saisie : la base des suggestions
  // de N° Lot et de silo ci-dessous (elles s'affinent l'une l'autre).
  const lotsForArticle = useMemo(() => {
    const activeLots = ledgerQuery.data?.lots.filter((lot) => lot.status === "active") ?? [];
    return activeLots.filter((lot) => lot.article === shipmentDraft.article);
  }, [ledgerQuery.data, shipmentDraft.article]);

  // N° Lot : actifs pour cet article, restreints en plus au silo déjà choisi le cas échéant,
  // triés du plus ancien au plus récent (ordre FIFO : celui à expédier en premier).
  const lotNumberSuggestions = useMemo(() => {
    const candidates = shipmentDraft.silo ? lotsForArticle.filter((lot) => lot.silo === shipmentDraft.silo) : lotsForArticle;
    const byLotNumber = new Map<string, string | null>();
    candidates.forEach((lot) => { if (lot.lotNumber && !byLotNumber.has(lot.lotNumber)) byLotNumber.set(lot.lotNumber, lot.entryDate); });
    return Array.from(byLotNumber.entries())
      .sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? ""))
      .map(([lotNumber]) => lotNumber);
  }, [lotsForArticle, shipmentDraft.silo]);

  // Silo : ceux où l'article est actif, restreints en plus au N° Lot déjà choisi le cas échéant.
  // Le silo déjà enregistré reste toujours proposé même hors de cette liste (édition d'une
  // expédition existante, ou article sans lot actuellement tracé).
  const siloSelectOptions = useMemo(() => {
    const candidates = shipmentDraft.lotNumber ? lotsForArticle.filter((lot) => lot.lotNumber === shipmentDraft.lotNumber) : lotsForArticle;
    const active = Array.from(new Set(candidates.map((lot) => lot.silo))).sort((a, b) => siloRank(a) - siloRank(b));
    const base = active.length > 0 ? active : [...SILOS];
    return shipmentDraft.silo && !base.includes(shipmentDraft.silo) ? [shipmentDraft.silo, ...base] : base;
  }, [lotsForArticle, shipmentDraft.lotNumber, shipmentDraft.silo]);

  const handleArticleChange = (value: string) => {
    // Un autre article change entièrement le stock disponible : on repart d'un lot et d'un silo vierges.
    setShipmentDraft({ ...shipmentDraft, article: value, lotNumber: "", silo: "" });
  };

  const handleLotChange = (value: string) => {
    const matchingSilos = Array.from(new Set(lotsForArticle.filter((lot) => lot.lotNumber === value).map((lot) => lot.silo)));
    setShipmentDraft((previous) => {
      if (matchingSilos.length === 1) return { ...previous, lotNumber: value, silo: matchingSilos[0] };
      if (matchingSilos.length > 1 && !matchingSilos.includes(previous.silo)) return { ...previous, lotNumber: value, silo: "" };
      return { ...previous, lotNumber: value };
    });
  };

  const handleSiloChange = (value: string) => {
    const matchingLots = Array.from(new Set(
      lotsForArticle.filter((lot) => lot.silo === value).map((lot) => lot.lotNumber).filter((lotNumber): lotNumber is string => Boolean(lotNumber)),
    ));
    setShipmentDraft((previous) => {
      if (matchingLots.length === 1) return { ...previous, silo: value, lotNumber: matchingLots[0] };
      if (matchingLots.length > 1 && !matchingLots.includes(previous.lotNumber)) return { ...previous, silo: value, lotNumber: "" };
      return { ...previous, silo: value };
    });
  };

  const refresh = async () => {
    await Promise.all([utils.silo.listEntries.invalidate(), utils.silo.listShipments.invalidate(), utils.silo.state.invalidate()]);
  };
  const onError = (fallback: string) => (error: { message?: string }) => toast.error(error.message || fallback);

  const createShipment = trpc.silo.createShipment.useMutation({ onSuccess: async () => { await refresh(); setShipmentDraft(emptyShipment()); toast.success("Expédition ajoutée"); }, onError: onError("Impossible d’ajouter cette expédition.") });
  const updateShipment = trpc.silo.updateShipment.useMutation({ onSuccess: async () => { await refresh(); setEditingShipmentId(null); setShipmentDraft(emptyShipment()); toast.success("Expédition mise à jour"); }, onError: onError("Impossible de modifier cette expédition.") });
  const deleteShipment = trpc.silo.deleteShipment.useMutation({ onSuccess: async () => { await refresh(); toast.success("Expédition supprimée"); }, onError: onError("Impossible de supprimer cette expédition.") });
  const prepareImport = trpc.silo.prepareExcelUpload.useMutation();
  const importFromStorage = trpc.silo.importExcelFromStorage.useMutation();
  const preparePdfImport = trpc.silo.preparePdfUpload.useMutation();
  const importPdfFromStorage = trpc.silo.importExpeditionPdf.useMutation();

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) { toast.error("Sélectionnez un classeur Excel au format .xlsx."); return; }
    setPendingImport(file);
  };

  const submitImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingImport) return;
    setIsImporting(true);
    try {
      const prepared = await prepareImport.mutateAsync({ fileName: pendingImport.name });
      const contentType = pendingImport.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (prepared.mode === "vercel-blob") {
        await uploadToVercelBlob(prepared.key, pendingImport, {
          access: "private",
          handleUploadUrl: "/api/blob-upload",
          contentType,
        });
      } else {
        const upload = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: pendingImport });
        if (!upload.ok) throw new Error("Le téléversement du classeur a échoué. Vérifiez votre connexion puis réessayez.");
      }
      const result = await importFromStorage.mutateAsync({ storageKey: prepared.key });
      await refresh();
      toast.success("Import du classeur terminé", { description: `${result.entries} entrée(s) de production et ${result.shipments} expédition(s) reprises depuis le fichier.` });
      if (result.rejected) toast.warning(`${result.rejected} ligne(s) ignorée(s)`, { description: result.rejectedLines.join(" ") });
      setPendingImport(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’import du classeur a échoué.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportPdfFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) { toast.error("Sélectionnez un rapport au format .pdf."); return; }
    setPendingPdfImport(file);
  };

  const submitPdfImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingPdfImport) return;
    setIsImportingPdf(true);
    try {
      const prepared = await preparePdfImport.mutateAsync({ fileName: pendingPdfImport.name });
      const contentType = pendingPdfImport.type || "application/pdf";
      if (prepared.mode === "vercel-blob") {
        await uploadToVercelBlob(prepared.key, pendingPdfImport, {
          access: "private",
          handleUploadUrl: "/api/blob-upload",
          contentType,
        });
      } else {
        const upload = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: pendingPdfImport });
        if (!upload.ok) throw new Error("Le téléversement du rapport a échoué. Vérifiez votre connexion puis réessayez.");
      }
      const result = await importPdfFromStorage.mutateAsync({ storageKey: prepared.key });
      await refresh();
      toast.success("Import du rapport PDF terminé", { description: `${result.imported} expédition(s) Vrac ajoutée(s).` });
      if (result.warnings.length) toast.warning(`${result.warnings.length} lot(s) non trouvé(s)`, { description: result.warnings.join(" ") });
      if (result.rejected) toast.warning(`${result.rejected} ligne(s) ignorée(s)`, { description: result.rejectedLines.join(" ") });
      setPendingPdfImport(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’import du rapport PDF a échoué.");
    } finally {
      setIsImportingPdf(false);
    }
  };

  const submitShipment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!shipmentDraft.article.trim()) { toast.error("Indiquez l’article expédié."); return; }
    if (!shipmentDraft.silo) { toast.error("Choisissez le silo d’où part l’expédition."); return; }
    const quantity = parseQuantity(shipmentDraft.quantity);
    if (quantity === undefined || quantity === null) { toast.error("Indiquez une quantité expédiée valide."); return; }
    // Vérification immédiate côté client (le serveur reste la source de vérité, en particulier
    // pour une modification : voir assertShipmentWithinStock, qui exclut l'expédition éditée).
    if (!editingShipmentId) {
      const available = stateQuery.data?.matrix?.[shipmentDraft.silo]?.[shipmentDraft.article] ?? 0;
      if (quantity > available + 0.005) {
        toast.error(`La quantité expédiée (${fmt(quantity)} T) dépasse le stock disponible de ${shipmentDraft.article} dans ${shipmentDraft.silo} (${fmt(available)} T).`);
        return;
      }
    }

    const payload = {
      shipmentDate: shipmentDraft.shipmentDate || undefined,
      article: shipmentDraft.article.trim(),
      lotNumber: shipmentDraft.lotNumber.trim() || undefined,
      quantity,
      silo: shipmentDraft.silo as typeof SILOS[number],
      shipmentType: shipmentDraft.shipmentType as typeof SHIPMENT_TYPES[number],
    };
    if (editingShipmentId) updateShipment.mutate({ id: editingShipmentId, ...payload }); else createShipment.mutate(payload);
  };

  const editShipment = (shipment: typeof shipments[number]) => {
    setEditingShipmentId(shipment.id);
    setShipmentDraft({
      shipmentDate: shipment.shipmentDate ?? "",
      article: shipment.article,
      lotNumber: shipment.lotNumber ?? "",
      quantity: String(Number(shipment.quantity)),
      silo: shipment.silo,
      shipmentType: shipment.shipmentType,
    });
  };

  const removeShipment = (id: number) => { if (window.confirm("Supprimer cette expédition ?")) deleteShipment.mutate({ id }); };
  const articleOptions = articles.map((article) => article.code);

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
            <span className="silo-kicker"><Truck size={14} />Produits finis</span>
            <h1>Ajouter une <em>expédition</em></h1>
            <p>Saisissez les expéditions sac / vrac. L’état des silos se recalcule automatiquement.</p>
          </div>
          <div className="silo-hero-actions">
            <div className="silo-file-actions">
              <input ref={importInputRef} type="file" accept=".xlsx" onChange={handleImportFile} hidden />
              <button type="button" className="silo-secondary" onClick={() => importInputRef.current?.click()}><Upload size={15} />Importer le classeur</button>
              <input ref={pdfImportInputRef} type="file" accept=".pdf" onChange={handleImportPdfFile} hidden />
              <button type="button" className="silo-secondary" onClick={() => pdfImportInputRef.current?.click()}><FileText size={15} />Importer un rapport PDF</button>
            </div>
          </div>
        </div>

        {pendingImport && (
          <div className="silo-import-overlay" role="dialog" aria-modal="true" aria-label="Confirmer l’import du classeur">
            <form className="silo-import-dialog" onSubmit={submitImport}>
              <span className="silo-section-label"><Upload size={14} />Confirmation d’import</span>
              <h2>Importer {pendingImport.name}</h2>
              <p>Les entrées de production et les expéditions du classeur <strong>remplacent</strong> les mouvements enregistrés : l’état des silos correspondra exactement au fichier.</p>
              <div className="silo-form-actions">
                <button type="button" className="silo-secondary" onClick={() => setPendingImport(null)} disabled={isImporting}>Annuler</button>
                <button type="submit" className="silo-primary" disabled={isImporting}><Upload size={15} />{isImporting ? "Import en cours…" : "Confirmer l’import"}</button>
              </div>
            </form>
          </div>
        )}

        {pendingPdfImport && (
          <div className="silo-import-overlay" role="dialog" aria-modal="true" aria-label="Confirmer l’import du rapport PDF">
            <form className="silo-import-dialog" onSubmit={submitPdfImport}>
              <span className="silo-section-label"><FileText size={14} />Confirmation d’import</span>
              <h2>Importer {pendingPdfImport.name}</h2>
              <p>Chaque expédition du rapport (date, article, quantité, silo) est <strong>ajoutée</strong> en type Vrac aux expéditions déjà enregistrées, avec un numéro de lot recalculé automatiquement (FIFO) plutôt que repris du PDF.</p>
              <div className="silo-form-actions">
                <button type="button" className="silo-secondary" onClick={() => setPendingPdfImport(null)} disabled={isImportingPdf}>Annuler</button>
                <button type="submit" className="silo-primary" disabled={isImportingPdf}><FileText size={15} />{isImportingPdf ? "Import en cours…" : "Confirmer l’import"}</button>
              </div>
            </form>
          </div>
        )}

        {shipmentsQuery.error && <div className="silo-error-card"><Database size={22} /><div><strong>Les expéditions ne peuvent pas être chargées</strong><span>{shipmentsQuery.error.message}</span></div></div>}

        <section className="silo-section">
          <div className="silo-section-head">
            <div><span className="silo-section-label"><Truck size={14} />Sorties</span><h2>{editingShipmentId ? "Modifier une expédition" : "Ajouter une expédition"}</h2></div>
            <div className="silo-filters">
              <label>Silo<select value={shipmentSiloFilter} onChange={(event) => setShipmentSiloFilter(event.target.value)}><option value="all">Tous</option>{shipmentSiloOptions.map((silo) => <option key={silo} value={silo}>{silo}</option>)}</select></label>
              <label>Article<select value={shipmentArticleFilter} onChange={(event) => setShipmentArticleFilter(event.target.value)}><option value="all">Tous</option>{shipmentArticleOptions.map((article) => <option key={article} value={article}>{article}</option>)}</select></label>
              <label>N° Lot<input value={shipmentLotQuery} onChange={(event) => setShipmentLotQuery(event.target.value)} placeholder="Rechercher…" /></label>
            </div>
          </div>
          <form className="silo-form" onSubmit={submitShipment}>
            <div className="silo-fields">
              <label>Date<input type="date" value={shipmentDraft.shipmentDate} onChange={(event) => setShipmentDraft({ ...shipmentDraft, shipmentDate: event.target.value })} /></label>
              <label>Article<input list="silo-articles" value={shipmentDraft.article} onChange={(event) => handleArticleChange(event.target.value)} placeholder="CG3" required /></label>
              <label>N° Lot<input list="silo-expedition-lots" value={shipmentDraft.lotNumber} onChange={(event) => handleLotChange(event.target.value)} placeholder="2600646-0905" /></label>
              <label>Qté (T)<input value={shipmentDraft.quantity} onChange={(event) => setShipmentDraft({ ...shipmentDraft, quantity: event.target.value })} placeholder="25" inputMode="decimal" required /></label>
              <label>Silo<select value={shipmentDraft.silo} onChange={(event) => handleSiloChange(event.target.value)} required><option value="" disabled>Choisir…</option>{siloSelectOptions.map((silo) => <option key={silo} value={silo}>{silo}</option>)}</select></label>
              <label>Expédition<select value={shipmentDraft.shipmentType} onChange={(event) => setShipmentDraft({ ...shipmentDraft, shipmentType: event.target.value })}>{SHIPMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            </div>
            <div className="silo-form-actions">
              {editingShipmentId && <button type="button" className="silo-secondary" onClick={() => { setEditingShipmentId(null); setShipmentDraft(emptyShipment()); }}>Annuler</button>}
              <button className="silo-primary" type="submit" disabled={createShipment.isPending || updateShipment.isPending}><Plus size={16} />{editingShipmentId ? "Mettre à jour l’expédition" : "Ajouter l’expédition"}</button>
            </div>
          </form>

          {filteredShipments.length ? <div className="silo-table-wrap">
            <table className="silo-list-table">
              <thead><tr><th>Date</th><th>Article</th><th>N° Lot</th><th>Qté (T)</th><th>Silo</th><th>Type</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredShipments.map((shipment) => (
                  <tr key={shipment.id}>
                    <td>{formatDate(shipment.shipmentDate)}</td>
                    <td className="silo-strong-cell">{shipment.article}</td>
                    <td>{shipment.lotNumber || "—"}</td>
                    <td>{fmt(Number(shipment.quantity))}</td>
                    <td>{shipment.silo}</td>
                    <td><span className={`silo-type-tag ${shipment.shipmentType === "Vrac" ? "silo-type-vrac" : ""}`}>{shipment.shipmentType}</span></td>
                    <td><span className="silo-row-actions"><button type="button" onClick={() => editShipment(shipment)} aria-label="Modifier l’expédition"><Pencil size={14} /></button><button type="button" onClick={() => removeShipment(shipment.id)} aria-label="Supprimer l’expédition"><Trash2 size={14} /></button></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div> : !shipmentsQuery.isLoading && <div className="silo-empty-cell">{shipments.length === 0 ? "Aucune expédition enregistrée." : "Aucune expédition ne correspond à ces filtres."}</div>}
        </section>

        <datalist id="silo-articles">{articleOptions.map((code) => <option key={code} value={code} />)}</datalist>
        <datalist id="silo-expedition-lots">{lotNumberSuggestions.map((lotNumber) => <option key={lotNumber} value={lotNumber} />)}</datalist>
      </section>
    </main>
  );
}
