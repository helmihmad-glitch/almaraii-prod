import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, Boxes, Database, Menu, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadPresigned as uploadToVercelBlob } from "@vercel/blob/client";
import { LIVE_QUERY_OPTIONS, trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";
import { SILOS } from "@shared/silo";
import "./silo.css";

type EntryDraft = { entryDate: string; article: string; lotNumber: string; totalQuantity: string; allocations: Record<string, string> };

const today = () => new Date().toISOString().slice(0, 10);
const emptyAllocations = () => Object.fromEntries(SILOS.map((silo) => [silo, ""])) as Record<string, string>;
const emptyEntry = (): EntryDraft => ({ entryDate: today(), article: "", lotNumber: "", totalQuantity: "", allocations: emptyAllocations() });
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

export default function SiloProduction() {
  const { openSidebar } = useSidebar();
  const utils = trpc.useUtils();
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(emptyEntry);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const appliedDeepLinkEdit = useRef(false);
  const search = useSearch();

  const entriesQuery = trpc.silo.listEntries.useQuery(undefined, LIVE_QUERY_OPTIONS);
  const articlesQuery = trpc.settings.listArticles.useQuery();
  const entries = entriesQuery.data ?? [];
  const articles = articlesQuery.data ?? [];

  const refresh = async () => {
    await Promise.all([utils.silo.listEntries.invalidate(), utils.silo.listShipments.invalidate(), utils.silo.state.invalidate()]);
  };
  const onError = (fallback: string) => (error: { message?: string }) => toast.error(error.message || fallback);

  const createEntry = trpc.silo.createEntry.useMutation({ onSuccess: async () => { await refresh(); setEntryDraft(emptyEntry()); toast.success("Entrée de production ajoutée"); }, onError: onError("Impossible d’ajouter cette entrée.") });
  const updateEntry = trpc.silo.updateEntry.useMutation({ onSuccess: async () => { await refresh(); setEditingEntryId(null); setEntryDraft(emptyEntry()); toast.success("Entrée de production mise à jour"); }, onError: onError("Impossible de modifier cette entrée.") });
  const deleteEntry = trpc.silo.deleteEntry.useMutation({ onSuccess: async () => { await refresh(); toast.success("Entrée de production supprimée"); }, onError: onError("Impossible de supprimer cette entrée.") });
  const prepareImport = trpc.silo.prepareExcelUpload.useMutation();
  const importFromStorage = trpc.silo.importExcelFromStorage.useMutation();

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

  const allocatedTotal = SILOS.reduce((total, silo) => total + (parseQuantity(entryDraft.allocations[silo] ?? "") || 0), 0);
  const declaredTotal = parseQuantity(entryDraft.totalQuantity);
  const totalMismatch = declaredTotal !== undefined && declaredTotal !== null && Math.abs(declaredTotal - allocatedTotal) > 0.005;

  const submitEntry = (event: React.FormEvent) => {
    event.preventDefault();
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

  // Arrivée depuis le bouton Modifier de la traçabilité des lots
  // (/silo-pf-production?edit=<entryId>) : ouvre directement cette entrée en
  // édition et amène le formulaire à l'écran, une seule fois par navigation.
  useEffect(() => {
    if (appliedDeepLinkEdit.current || entries.length === 0) return;
    const targetId = Number(new URLSearchParams(search).get("edit"));
    if (!targetId) return;
    appliedDeepLinkEdit.current = true;
    const target = entries.find((entry) => entry.id === targetId);
    if (!target) { toast.error("Cette entrée de production est introuvable (peut-être déjà supprimée)."); return; }
    editEntry(target);
    document.getElementById("silo-production-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [search, entries]);

  const removeEntry = (id: number) => { if (window.confirm("Supprimer cette entrée de production et sa répartition ?")) deleteEntry.mutate({ id }); };
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
            <span className="silo-kicker"><Boxes size={14} />Produits finis</span>
            <h1>Ajouter une <em>production</em></h1>
            <p>Saisissez les entrées de production réparties par silo. L’état des silos se recalcule automatiquement.</p>
          </div>
          <div className="silo-hero-actions">
            <div className="silo-file-actions">
              <input ref={importInputRef} type="file" accept=".xlsx" onChange={handleImportFile} hidden />
              <button type="button" className="silo-secondary" onClick={() => importInputRef.current?.click()}><Upload size={15} />Importer le classeur</button>
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

        {entriesQuery.error && <div className="silo-error-card"><Database size={22} /><div><strong>Les entrées ne peuvent pas être chargées</strong><span>{entriesQuery.error.message}</span></div></div>}

        <section className="silo-section" id="silo-production-form">
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

          {entries.length ? <div className="silo-table-wrap">
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
              </tbody>
            </table>
          </div> : !entriesQuery.isLoading && <div className="silo-empty-cell">Aucune entrée de production enregistrée.</div>}
        </section>

        <datalist id="silo-articles">{articleOptions.map((code) => <option key={code} value={code} />)}</datalist>
      </section>
    </main>
  );
}
