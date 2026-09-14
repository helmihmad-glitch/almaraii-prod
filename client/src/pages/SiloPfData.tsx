import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Boxes, Database, Download, Menu, Pencil, Plus, Trash2, Truck, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadPresigned as uploadToVercelBlob } from "@vercel/blob/client";
import { trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";
import { SHIPMENT_TYPES, SILOS } from "@shared/silo";
import "./silo.css";

type EntryDraft = { entryDate: string; article: string; lotNumber: string; totalQuantity: string; allocations: Record<string, string> };
type ShipmentDraft = { shipmentDate: string; article: string; lotNumber: string; quantity: string; silo: string; shipmentType: string };

const today = () => new Date().toISOString().slice(0, 10);
const emptyAllocations = () => Object.fromEntries(SILOS.map((silo) => [silo, ""])) as Record<string, string>;
const emptyEntry = (): EntryDraft => ({ entryDate: today(), article: "", lotNumber: "", totalQuantity: "", allocations: emptyAllocations() });
const emptyShipment = (): ShipmentDraft => ({ shipmentDate: today(), article: "", lotNumber: "", quantity: "", silo: SILOS[0], shipmentType: SHIPMENT_TYPES[0] });
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

export default function SiloPfData() {
  const { openSidebar } = useSidebar();
  const utils = trpc.useUtils();
  const [actionPassword, setActionPassword] = useState("");
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(emptyEntry);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [shipmentDraft, setShipmentDraft] = useState<ShipmentDraft>(emptyShipment);
  const [editingShipmentId, setEditingShipmentId] = useState<number | null>(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const entriesQuery = trpc.silo.listEntries.useQuery();
  const shipmentsQuery = trpc.silo.listShipments.useQuery();
  const articlesQuery = trpc.settings.listArticles.useQuery();
  const entries = entriesQuery.data ?? [];
  const shipments = shipmentsQuery.data ?? [];
  const articles = articlesQuery.data ?? [];

  const refresh = async () => {
    await Promise.all([utils.silo.listEntries.invalidate(), utils.silo.listShipments.invalidate(), utils.silo.state.invalidate()]);
  };
  const onError = (fallback: string) => (error: { message?: string }) => toast.error(error.message || fallback);

  const createEntry = trpc.silo.createEntry.useMutation({ onSuccess: async () => { await refresh(); setEntryDraft(emptyEntry()); toast.success("Entrée de production ajoutée"); }, onError: onError("Impossible d’ajouter cette entrée.") });
  const updateEntry = trpc.silo.updateEntry.useMutation({ onSuccess: async () => { await refresh(); setEditingEntryId(null); setEntryDraft(emptyEntry()); toast.success("Entrée de production mise à jour"); }, onError: onError("Impossible de modifier cette entrée.") });
  const deleteEntry = trpc.silo.deleteEntry.useMutation({ onSuccess: async () => { await refresh(); toast.success("Entrée de production supprimée"); }, onError: onError("Impossible de supprimer cette entrée.") });
  const createShipment = trpc.silo.createShipment.useMutation({ onSuccess: async () => { await refresh(); setShipmentDraft(emptyShipment()); toast.success("Expédition ajoutée"); }, onError: onError("Impossible d’ajouter cette expédition.") });
  const updateShipment = trpc.silo.updateShipment.useMutation({ onSuccess: async () => { await refresh(); setEditingShipmentId(null); setShipmentDraft(emptyShipment()); toast.success("Expédition mise à jour"); }, onError: onError("Impossible de modifier cette expédition.") });
  const deleteShipment = trpc.silo.deleteShipment.useMutation({ onSuccess: async () => { await refresh(); toast.success("Expédition supprimée"); }, onError: onError("Impossible de supprimer cette expédition.") });
  const prepareImport = trpc.silo.prepareExcelUpload.useMutation();
  const importFromStorage = trpc.silo.importExcelFromStorage.useMutation();
  const exportWorkbook = trpc.useUtils().silo.exportExcel;

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
    if (!importPassword) { toast.error("Saisissez le mot de passe de gestion pour importer ce classeur."); return; }
    setIsImporting(true);
    try {
      const prepared = await prepareImport.mutateAsync({ fileName: pendingImport.name, actionPassword: importPassword });
      const contentType = pendingImport.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (prepared.mode === "vercel-blob") {
        await uploadToVercelBlob(prepared.key, pendingImport, {
          access: "private",
          handleUploadUrl: "/api/blob-upload",
          contentType,
          clientPayload: JSON.stringify({ actionPassword: importPassword }),
        });
      } else {
        const upload = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: pendingImport });
        if (!upload.ok) throw new Error("Le téléversement du classeur a échoué. Vérifiez votre connexion puis réessayez.");
      }
      const result = await importFromStorage.mutateAsync({ storageKey: prepared.key, actionPassword: importPassword });
      await refresh();
      toast.success("Import du classeur terminé", { description: `${result.entries} entrée(s) de production et ${result.shipments} expédition(s) reprises depuis le fichier.` });
      if (result.rejected) toast.warning(`${result.rejected} ligne(s) ignorée(s)`, { description: result.rejectedLines.join(" ") });
      setPendingImport(null);
      setImportPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’import du classeur a échoué.");
    } finally {
      setIsImporting(false);
    }
  };

  const [isExporting, setIsExporting] = useState(false);
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

  const allocatedTotal = useMemo(
    () => SILOS.reduce((total, silo) => total + (parseQuantity(entryDraft.allocations[silo] ?? "") || 0), 0),
    [entryDraft.allocations],
  );
  const declaredTotal = parseQuantity(entryDraft.totalQuantity);
  const totalMismatch = declaredTotal !== undefined && declaredTotal !== null && Math.abs(declaredTotal - allocatedTotal) > 0.005;

  const requirePassword = () => {
    if (!actionPassword) { toast.error("Saisissez le mot de passe de gestion pour enregistrer."); return false; }
    return true;
  };

  const submitEntry = (event: React.FormEvent) => {
    event.preventDefault();
    if (!requirePassword()) return;
    if (!entryDraft.article.trim()) { toast.error("Indiquez l’article produit."); return; }

    const allocations: { silo: typeof SILOS[number]; quantity: number }[] = [];
    for (const silo of SILOS) {
      const quantity = parseQuantity(entryDraft.allocations[silo] ?? "");
      if (quantity === null) { toast.error(`Quantité invalide pour ${silo}.`); return; }
      if (quantity !== undefined && quantity !== 0) allocations.push({ silo, quantity });
    }
    if (allocations.length === 0) { toast.error("Répartissez la production sur au moins un silo."); return; }
    if (declaredTotal === null) { toast.error("Quantité totale invalide."); return; }

    const payload = {
      entryDate: entryDraft.entryDate || undefined,
      article: entryDraft.article.trim(),
      lotNumber: entryDraft.lotNumber.trim() || undefined,
      totalQuantity: declaredTotal,
      allocations,
      actionPassword,
    };
    if (editingEntryId) updateEntry.mutate({ id: editingEntryId, ...payload }); else createEntry.mutate(payload);
  };

  const editEntry = (entry: typeof entries[number]) => {
    setEditingEntryId(entry.id);
    const allocations = emptyAllocations();
    entry.allocations.forEach((allocation) => { allocations[allocation.silo] = String(Number(allocation.quantity)); });
    setEntryDraft({
      entryDate: entry.entryDate ?? "",
      article: entry.article,
      lotNumber: entry.lotNumber ?? "",
      totalQuantity: entry.totalQuantity === null ? "" : String(Number(entry.totalQuantity)),
      allocations,
    });
  };

  const submitShipment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!requirePassword()) return;
    if (!shipmentDraft.article.trim()) { toast.error("Indiquez l’article expédié."); return; }
    const quantity = parseQuantity(shipmentDraft.quantity);
    if (quantity === undefined || quantity === null) { toast.error("Indiquez une quantité expédiée valide."); return; }

    const payload = {
      shipmentDate: shipmentDraft.shipmentDate || undefined,
      article: shipmentDraft.article.trim(),
      lotNumber: shipmentDraft.lotNumber.trim() || undefined,
      quantity,
      silo: shipmentDraft.silo as typeof SILOS[number],
      shipmentType: shipmentDraft.shipmentType as typeof SHIPMENT_TYPES[number],
      actionPassword,
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

  const removeEntry = (id: number) => { if (requirePassword() && window.confirm("Supprimer cette entrée de production et sa répartition ?")) deleteEntry.mutate({ id, actionPassword }); };
  const removeShipment = (id: number) => { if (requirePassword() && window.confirm("Supprimer cette expédition ?")) deleteShipment.mutate({ id, actionPassword }); };
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
            <span className="silo-kicker"><Database size={14} />Administration</span>
            <h1>Silo PF <em>donnée</em></h1>
            <p>Saisissez les entrées de production réparties par silo et les expéditions sac / vrac. L’état des silos se recalcule automatiquement.</p>
          </div>
          <div className="silo-hero-actions">
            <div className="silo-file-actions">
              <input ref={importInputRef} type="file" accept=".xlsx" onChange={handleImportFile} hidden />
              <button type="button" className="silo-secondary" onClick={() => importInputRef.current?.click()}><Upload size={15} />Importer le classeur</button>
              <button type="button" className="silo-secondary" onClick={downloadWorkbook} disabled={isExporting}><Download size={15} />{isExporting ? "Export…" : "Exporter le classeur"}</button>
            </div>
            <label className="silo-password-card">
              <span>Mot de passe de gestion</span>
              <input type="password" value={actionPassword} onChange={(event) => setActionPassword(event.target.value)} placeholder="Mot de passe actuel" autoComplete="current-password" />
            </label>
          </div>
        </div>

        {pendingImport && (
          <div className="silo-import-overlay" role="dialog" aria-modal="true" aria-label="Confirmer l’import du classeur">
            <form className="silo-import-dialog" onSubmit={submitImport}>
              <span className="silo-section-label"><Upload size={14} />Confirmation d’import</span>
              <h2>Importer {pendingImport.name}</h2>
              <p>Les entrées de production et les expéditions du classeur <strong>remplacent</strong> les mouvements enregistrés : l’état des silos correspondra exactement au fichier.</p>
              <label>Mot de passe de gestion<input type="password" value={importPassword} onChange={(event) => setImportPassword(event.target.value)} autoFocus autoComplete="current-password" /></label>
              <div className="silo-form-actions">
                <button type="button" className="silo-secondary" onClick={() => { setPendingImport(null); setImportPassword(""); }} disabled={isImporting}>Annuler</button>
                <button type="submit" className="silo-primary" disabled={isImporting}><Upload size={15} />{isImporting ? "Import en cours…" : "Confirmer l’import"}</button>
              </div>
            </form>
          </div>
        )}

        {entriesQuery.error && <div className="silo-error-card"><Database size={22} /><div><strong>Les mouvements ne peuvent pas être chargés</strong><span>{entriesQuery.error.message}</span></div></div>}

        <section className="silo-section">
          <div className="silo-section-head"><div><span className="silo-section-label"><Boxes size={14} />Entrées</span><h2>{editingEntryId ? "Modifier une entrée de production" : "Ajouter une entrée de production"}</h2></div></div>
          <form className="silo-form" onSubmit={submitEntry}>
            <div className="silo-fields">
              <label>Date<input type="date" value={entryDraft.entryDate} onChange={(event) => setEntryDraft({ ...entryDraft, entryDate: event.target.value })} /></label>
              <label>Article<input list="silo-articles" value={entryDraft.article} onChange={(event) => setEntryDraft({ ...entryDraft, article: event.target.value })} placeholder="CG3" required /></label>
              <label>N° Lot<input value={entryDraft.lotNumber} onChange={(event) => setEntryDraft({ ...entryDraft, lotNumber: event.target.value })} placeholder="2600645-0409" /></label>
              <label>Qté totale (T)<input value={entryDraft.totalQuantity} onChange={(event) => setEntryDraft({ ...entryDraft, totalQuantity: event.target.value })} placeholder="35" inputMode="decimal" /></label>
            </div>
            <fieldset className="silo-allocation-fields">
              <legend>Répartition par silo (T) — une quantité négative corrige un silo</legend>
              <div>
                {SILOS.map((silo) => (
                  <label key={silo}>{silo}<input value={entryDraft.allocations[silo] ?? ""} onChange={(event) => setEntryDraft({ ...entryDraft, allocations: { ...entryDraft.allocations, [silo]: event.target.value } })} placeholder="—" inputMode="decimal" /></label>
                ))}
              </div>
              <p className={totalMismatch ? "silo-allocation-warning" : "silo-allocation-total"}>
                Réparti : <strong>{fmt(allocatedTotal)} T</strong>
                {totalMismatch && declaredTotal !== undefined && declaredTotal !== null ? ` — écart de ${fmt(declaredTotal - allocatedTotal)} T avec la quantité totale saisie` : ""}
              </p>
            </fieldset>
            <div className="silo-form-actions">
              {editingEntryId && <button type="button" className="silo-secondary" onClick={() => { setEditingEntryId(null); setEntryDraft(emptyEntry()); }}>Annuler</button>}
              <button className="silo-primary" type="submit" disabled={createEntry.isPending || updateEntry.isPending}><Plus size={16} />{editingEntryId ? "Mettre à jour l’entrée" : "Ajouter l’entrée"}</button>
            </div>
          </form>

          <div className="silo-table-wrap">
            <table className="silo-list-table">
              <thead><tr><th>Date</th><th>Article</th><th>N° Lot</th><th>Qté (T)</th><th>Répartition</th><th>Actions</th></tr></thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.entryDate)}</td>
                    <td className="silo-strong-cell">{entry.article}</td>
                    <td>{entry.lotNumber || "—"}</td>
                    <td>{entry.totalQuantity === null ? "—" : fmt(Number(entry.totalQuantity))}</td>
                    <td className="silo-allocation-cell">{entry.allocations.length ? entry.allocations.map((allocation) => `${allocation.silo}: ${fmt(Number(allocation.quantity))}`).join(" · ") : "—"}</td>
                    <td><span className="silo-row-actions"><button type="button" onClick={() => editEntry(entry)} aria-label="Modifier l’entrée"><Pencil size={14} /></button><button type="button" onClick={() => removeEntry(entry.id)} aria-label="Supprimer l’entrée"><Trash2 size={14} /></button></span></td>
                  </tr>
                ))}
                {!entriesQuery.isLoading && entries.length === 0 && <tr><td className="silo-empty-cell" colSpan={6}>Aucune entrée de production enregistrée.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="silo-section">
          <div className="silo-section-head"><div><span className="silo-section-label"><Truck size={14} />Sorties</span><h2>{editingShipmentId ? "Modifier une expédition" : "Ajouter une expédition"}</h2></div></div>
          <form className="silo-form" onSubmit={submitShipment}>
            <div className="silo-fields">
              <label>Date<input type="date" value={shipmentDraft.shipmentDate} onChange={(event) => setShipmentDraft({ ...shipmentDraft, shipmentDate: event.target.value })} /></label>
              <label>Article<input list="silo-articles" value={shipmentDraft.article} onChange={(event) => setShipmentDraft({ ...shipmentDraft, article: event.target.value })} placeholder="CG3" required /></label>
              <label>N° Lot<input value={shipmentDraft.lotNumber} onChange={(event) => setShipmentDraft({ ...shipmentDraft, lotNumber: event.target.value })} placeholder="2600646-0905" /></label>
              <label>Qté (T)<input value={shipmentDraft.quantity} onChange={(event) => setShipmentDraft({ ...shipmentDraft, quantity: event.target.value })} placeholder="25" inputMode="decimal" required /></label>
              <label>Silo<select value={shipmentDraft.silo} onChange={(event) => setShipmentDraft({ ...shipmentDraft, silo: event.target.value })}>{SILOS.map((silo) => <option key={silo} value={silo}>{silo}</option>)}</select></label>
              <label>Expédition<select value={shipmentDraft.shipmentType} onChange={(event) => setShipmentDraft({ ...shipmentDraft, shipmentType: event.target.value })}>{SHIPMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            </div>
            <div className="silo-form-actions">
              {editingShipmentId && <button type="button" className="silo-secondary" onClick={() => { setEditingShipmentId(null); setShipmentDraft(emptyShipment()); }}>Annuler</button>}
              <button className="silo-primary" type="submit" disabled={createShipment.isPending || updateShipment.isPending}><Plus size={16} />{editingShipmentId ? "Mettre à jour l’expédition" : "Ajouter l’expédition"}</button>
            </div>
          </form>

          <div className="silo-table-wrap">
            <table className="silo-list-table">
              <thead><tr><th>Date</th><th>Article</th><th>N° Lot</th><th>Qté (T)</th><th>Silo</th><th>Type</th><th>Actions</th></tr></thead>
              <tbody>
                {shipments.map((shipment) => (
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
                {!shipmentsQuery.isLoading && shipments.length === 0 && <tr><td className="silo-empty-cell" colSpan={7}>Aucune expédition enregistrée.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <datalist id="silo-articles">{articleOptions.map((code) => <option key={code} value={code} />)}</datalist>
      </section>
    </main>
  );
}
