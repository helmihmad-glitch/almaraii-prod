import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Activity, ArrowLeft, CalendarDays, Database, Factory, Menu, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadPresigned as uploadToVercelBlob } from "@vercel/blob/client";
import { trpc } from "@/lib/trpc";
import { useSidebar } from "@/components/AppShell";
import { BRAND_LOGO_URL } from "@/lib/brand";
import "./registry-import-dialog.css";

type RegistryRow = {
  id: number;
  productionDate: string;
  article: string;
  totalProductionHours: number | string;
  plannedStopsHours: number | string;
  unplannedStopsHours: number | string;
  productionTons: number | string;
  wasteTons: number | string;
  standardRate: number | string;
  availability: number | string;
  performance: number | string;
  quality: number | string;
  trs: number | string;
  realHours: number | string;
  comment: string | null;
};

const fmt = (value: number, digits = 1) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const pct = (value: number) => `${Math.round(value * 100)} %`;
const prettyDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
const asNumber = (value: number | string) => Number(value);

function buildKpis(rows: RegistryRow[]) {
  const totalHours = rows.reduce((sum, row) => sum + asNumber(row.totalProductionHours), 0);
  const plannedStops = rows.reduce((sum, row) => sum + asNumber(row.plannedStopsHours), 0);
  const unplannedStops = rows.reduce((sum, row) => sum + asNumber(row.unplannedStopsHours), 0);
  const production = rows.reduce((sum, row) => sum + asNumber(row.productionTons), 0);
  const waste = rows.reduce((sum, row) => sum + asNumber(row.wasteTons), 0);
  const realHours = Math.max(totalHours - plannedStops - unplannedStops, 0);
  const standardCapacity = rows.reduce((sum, row) => sum + asNumber(row.realHours) * asNumber(row.standardRate), 0);
  const availability = totalHours > 0 ? Math.max((totalHours - unplannedStops) / totalHours, 0) : 0;
  const performance = standardCapacity > 0 ? production / standardCapacity : 0;
  const quality = production > 0 ? Math.max((production - waste) / production, 0) : 1;
  return { totalHours, plannedStops, unplannedStops, activeHours: realHours, production, waste, availability, performance, quality, trs: availability * performance * quality };
}

type PendingImport = { file: File; fileName: string };

export default function Registry() {
  const { openSidebar } = useSidebar();
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const hasInitializedExcel = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const registryQuery = trpc.production.list.useQuery();
  const initializeExcel = trpc.production.initialize.useMutation({ onSuccess: () => registryQuery.refetch() });
  const prepareExcelUpload = trpc.production.prepareExcelUpload.useMutation();
  const importExcel = trpc.production.importExcelFromStorage.useMutation();
  useEffect(() => { if (!registryQuery.isLoading && !hasInitializedExcel.current) { hasInitializedExcel.current = true; initializeExcel.mutate(); } }, [registryQuery.isLoading, initializeExcel]);
  const removeLine = trpc.production.delete.useMutation({
    onSuccess: async () => {
      await registryQuery.refetch();
      toast.success("Ligne supprimée du registre");
    },
  });
  const requestDelete = (id: number) => {
    if (window.confirm("Supprimer cette ligne du registre ?")) removeLine.mutate({ id });
  };

  const allRows = useMemo(() => (registryQuery.data ?? []).map((row) => ({ ...row, productionDate: row.productionDate.slice(0, 10) }) as RegistryRow), [registryQuery.data]);
  const rows = useMemo(() => allRows
    .filter((row) => (!query || row.article.toLowerCase().includes(query.toLowerCase()) || row.productionDate.includes(query) || row.comment?.toLowerCase().includes(query.toLowerCase()))
      && (!dateFrom || row.productionDate >= dateFrom)
      && (!dateTo || row.productionDate <= dateTo))
    .sort((a, b) => b.productionDate.localeCompare(a.productionDate) || b.id - a.id), [allRows, query, dateFrom, dateTo]);
  const kpis = useMemo(() => buildKpis(rows), [rows]);

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) { toast.error("Sélectionnez un fichier Excel au format .xlsx."); return; }
    if (file.size > 5_700_000) { toast.error("Le fichier Excel dépasse la limite de 5,7 Mo."); return; }
    setPendingImport({ file, fileName: file.name });
  };
  const submitImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingImport) return;
    try {
      const prepared = await prepareExcelUpload.mutateAsync({ fileName: pendingImport.fileName });
      const contentType = pendingImport.file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      let storageKey: string;
      if (prepared.mode === "vercel-blob") {
        await uploadToVercelBlob(prepared.key, pendingImport.file, {
          access: "private",
          handleUploadUrl: "/api/blob-upload",
          contentType,
        });
        storageKey = prepared.key;
      } else {
        const upload = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: pendingImport.file });
        if (!upload.ok) throw new Error("Le téléversement du fichier Excel a échoué. Vérifiez votre connexion puis réessayez.");
        storageKey = prepared.key;
      }
      const result = await importExcel.mutateAsync({ storageKey });
      await registryQuery.refetch();
      toast.success("Import Excel terminé", { description: `${result.created} ligne(s) ajoutée(s), ${result.updated} ligne(s) mise(s) à jour et ${result.skipped} doublon(s) identique(s) ignoré(s).` });
      if (result.rejected) toast.warning(`${result.rejected} ligne(s) ignorée(s)`, { description: result.rejectedLines.join(" ") || "Les lignes incomplètes ou incohérentes n’ont pas été importées." });
      setPendingImport(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’import Excel a échoué.");
    }
  };
  return <div className="registry-screen">
    {pendingImport && <div className="registry-import-dialog-backdrop" role="presentation"><form className="registry-import-dialog" onSubmit={submitImport} role="dialog" aria-modal="true" aria-labelledby="import-dialog-title"><span className="registry-kicker"><Upload size={14} />Confirmation d’import</span><h2 id="import-dialog-title">Importer <em>{pendingImport.fileName}</em></h2><p>Le fichier est téléversé directement et ne traverse pas la limite de requête de Vercel. Les lignes seront ensuite ajoutées ou mises à jour dans le registre.</p><div className="registry-import-dialog-actions"><button type="button" className="registry-clear" onClick={() => setPendingImport(null)} disabled={prepareExcelUpload.isPending || importExcel.isPending}>Annuler</button><button type="submit" className="registry-import" disabled={prepareExcelUpload.isPending || importExcel.isPending}>{prepareExcelUpload.isPending || importExcel.isPending ? "Import…" : "Confirmer l’import"}</button></div></form></div>}
    <header className="registry-topbar">
      <button className="mobile-menu" onClick={openSidebar} aria-label="Ouvrir le menu"><Menu size={20} /></button>
      <Link href="/" className="registry-back"><ArrowLeft size={16} />Vue d’ensemble</Link>
      <div className="registry-brand"><span className="registry-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></span><div><strong>Almaraïi</strong><small>Production Pulse</small></div></div>
      <Link href="/?entry=1" className="registry-add"><Plus size={16} />Saisir une production</Link>
    </header>
    <main className="registry-page">
      <section className="registry-hero">
        <div><span className="registry-kicker"><Database size={14} />Registre persistant</span><h1>Registre <em>journalier</em></h1><p>Chaque ligne enregistrée depuis la saisie de production est conservée ici, avec ses indicateurs calculés.</p></div>
        <div className="registry-total"><span>Production sauvegardée</span><strong>{fmt(kpis.production)} T</strong><small>{rows.length} ligne{rows.length > 1 ? "s" : ""} affichée{rows.length > 1 ? "s" : ""}</small></div>
      </section>
      <section className="registry-workspace">
        <div className="registry-toolbar">
          <div className="registry-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Article ou date" aria-label="Rechercher une saisie" /></div>
          <label className="registry-date">Du<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label className="registry-date">Au<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          {(query || dateFrom || dateTo) && <button className="registry-clear" onClick={() => { setQuery(""); setDateFrom(""); setDateTo(""); }}>Effacer les filtres</button>}
          <button className="registry-import" onClick={() => importInputRef.current?.click()} disabled={importExcel.isPending}><Upload size={15} />{importExcel.isPending ? "Import…" : "Importer Excel"}</button>
          <input ref={importInputRef} className="registry-file-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleImportFile} aria-label="Choisir un fichier Excel à importer" />
          <Link href="/rapports" className="registry-export"><Database size={15} />Voir les rapports</Link>
        </div>
        <p className="registry-import-note"><Upload size={13} />Formats reconnus : DATE, ARTICLE, TEMPS TOTAL PROD. (h) ou TEMPS OUV. (h), ARRÊTS PLAN. (h), ARRÊTS NON PL. (h), PROD. (T), REBUTS (T), CADENCE STD et H. RÉELLES. Les feuilles mensuelles sont prises en charge.</p>
        <div className="registry-table-wrap">
          {registryQuery.isLoading ? <div className="registry-empty">Chargement des lignes sauvegardées…</div> : rows.length ? <table className="registry-table"><thead><tr><th>Date</th><th>Article</th><th>Production</th><th>Rebuts</th><th>Disponibilité</th><th>Performance</th><th>TRS</th><th>Heures réelles</th><th>Commentaire</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><span className="registry-date-cell"><CalendarDays size={14} />{prettyDate(row.productionDate)}</span></td><td><strong>{row.article}</strong></td><td>{fmt(asNumber(row.productionTons))} T</td><td>{fmt(asNumber(row.wasteTons))} T</td><td>{pct(asNumber(row.availability))}</td><td>{pct(asNumber(row.performance))}</td><td><strong>{pct(asNumber(row.trs))}</strong></td><td>{fmt(asNumber(row.realHours))} h</td><td className="registry-comment">{row.comment || <span>—</span>}</td><td><div className="registry-row-actions"><button className="registry-delete" onClick={() => requestDelete(row.id)} aria-label={`Supprimer ${row.article} du ${row.productionDate}`}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table> : <div className="registry-empty"><Factory size={22} /><strong>Aucune ligne sauvegardée pour ce filtre.</strong><span>Utilisez « Saisir une production » ou « Importer Excel » pour alimenter le registre.</span></div>}
        </div>
        <footer className="registry-foot"><span><Activity size={14} />Les lignes affichées sont sauvegardées de façon persistante.</span><span>{rows.length} résultat{rows.length > 1 ? "s" : ""}</span></footer>
      </section>
    </main>
  </div>;
}
