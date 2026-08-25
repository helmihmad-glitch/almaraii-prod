import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Activity, ArrowLeft, CalendarDays, Database, Download, Factory, FileText, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getPreviousCalendarDate } from "@/lib/registryOrdering";

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

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Le fichier ne peut pas être lu."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

export default function Registry() {
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const hasInitializedExcel = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const registryQuery = trpc.production.list.useQuery();
  const synchronizedFileQuery = trpc.production.syncFile.useQuery();
  const initializeExcel = trpc.production.initialize.useMutation({ onSuccess: () => Promise.all([registryQuery.refetch(), synchronizedFileQuery.refetch()]) });
  const importExcel = trpc.production.importExcel.useMutation({
    onSuccess: async (result) => {
      await Promise.all([registryQuery.refetch(), synchronizedFileQuery.refetch()]);
      toast.success("Import Excel terminé", { description: `${result.created} ligne(s) ajoutée(s) et ${result.updated} ligne(s) mise(s) à jour.` });
      if (result.rejected) toast.warning(`${result.rejected} ligne(s) ignorée(s)`, { description: result.rejectedLines.join(" ") || "Les lignes incomplètes ou incohérentes n’ont pas été importées." });
    },
    onError: (error) => toast.error(error.message || "L’import Excel a échoué."),
  });
  useEffect(() => { if (!registryQuery.isLoading && !hasInitializedExcel.current) { hasInitializedExcel.current = true; initializeExcel.mutate(); } }, [registryQuery.isLoading, initializeExcel]);
  const removeLine = trpc.production.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([registryQuery.refetch(), synchronizedFileQuery.refetch()]);
      toast.success("Ligne supprimée du registre");
    },
  });
  const requestDelete = (id: number) => {
    const actionPassword = window.prompt("Saisissez le mot de passe pour supprimer cette ligne.");
    if (actionPassword === null) return;
    if (!actionPassword) { toast.error("Le mot de passe est requis pour supprimer une ligne."); return; }
    removeLine.mutate({ id, actionPassword });
  };

  const allRows = useMemo(() => (registryQuery.data ?? []).map((row) => ({ ...row, productionDate: row.productionDate.slice(0, 10) }) as RegistryRow), [registryQuery.data]);
  const rows = useMemo(() => allRows
    .filter((row) => (!query || row.article.toLowerCase().includes(query.toLowerCase()) || row.productionDate.includes(query) || row.comment?.toLowerCase().includes(query.toLowerCase()))
      && (!dateFrom || row.productionDate >= dateFrom)
      && (!dateTo || row.productionDate <= dateTo))
    .sort((a, b) => b.productionDate.localeCompare(a.productionDate) || b.id - a.id), [allRows, query, dateFrom, dateTo]);
  const kpis = useMemo(() => buildKpis(rows), [rows]);
  const j1Date = useMemo(() => getPreviousCalendarDate(), []);
  const j1Rows = useMemo(() => allRows.filter((row) => row.productionDate === j1Date), [allRows, j1Date]);
  const j1Production = useMemo(() => j1Rows.reduce((sum, row) => sum + asNumber(row.productionTons), 0), [j1Rows]);

  const exportRows = () => {
    const csv = ["Date;Article;Production (T);Rebuts (T);Disponibilité (%);TRS (%);Commentaire", ...rows.map((row) => `${row.productionDate};${row.article};${row.productionTons};${row.wasteTons};${Math.round(asNumber(row.availability) * 100)};${Math.round(asNumber(row.trs) * 100)};${String(row.comment ?? "").replace(/[\r\n;]+/g, " ")}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "registre-journalier.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Export du registre généré", { description: `${rows.length} lignes exportées.` });
  };
  const downloadSynchronizedExcel = () => {
    const url = synchronizedFileQuery.data?.downloadUrl;
    if (!url) { toast.error("Le fichier Excel synchronisé est en cours de préparation."); return; }
    window.location.assign(url);
  };
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) { toast.error("Sélectionnez un fichier Excel au format .xlsx."); return; }
    if (file.size > 5_700_000) { toast.error("Le fichier Excel dépasse la limite de 5,7 Mo."); return; }
    const actionPassword = window.prompt("Saisissez le mot de passe pour importer les lignes dans le registre.");
    if (actionPassword === null) return;
    if (!actionPassword) { toast.error("Le mot de passe est requis pour importer un fichier."); return; }
    try {
      importExcel.mutate({ fileName: file.name, fileBase64: await toBase64(file), actionPassword });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Le fichier ne peut pas être lu.");
    }
  };
  const downloadPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const green: [number, number, number] = [29, 72, 38];
    const gold: [number, number, number] = [232, 181, 58];
    doc.setFillColor(...green);
    doc.rect(0, 0, pageWidth, 34, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.text("Almaraïi Production Pulse", 15, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Synthèse du registre journalier", 15, 24);
    doc.text(`Généré le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`, pageWidth - 15, 24, { align: "right" });
    doc.setTextColor(29, 72, 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Production J-1", 15, 46);
    doc.setFillColor(247, 251, 244);
    doc.roundedRect(15, 51, pageWidth - 30, 32, 3, 3, "F");
    doc.setFontSize(10);
    doc.setTextColor(89, 104, 91);
    doc.text(prettyDate(j1Date), 21, 61);
    doc.setTextColor(...green);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(j1Rows.length ? `${fmt(j1Production)} T` : "Aucune production", 21, 73);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const j1Details = j1Rows.length ? j1Rows.map((row) => `${row.article} : ${fmt(asNumber(row.productionTons))} T`).join("  |  ") : "Aucune ligne enregistrée la veille.";
    doc.text(doc.splitTextToSize(j1Details, pageWidth - 72), 76, 61);
    doc.setTextColor(29, 72, 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Indicateurs de la période exportée", 15, 97);
    const cards = [
      ["TRS global", rows.length ? pct(kpis.trs) : "—", "Disponibilité × performance × qualité"],
      ["Disponibilité", rows.length ? pct(kpis.availability) : "—", "Temps utile sur temps planifié"],
      ["Performance", rows.length ? pct(kpis.performance) : "—", "Cadence réelle vs standard"],
      ["Rebuts / déchets", rows.length ? `${fmt(kpis.waste)} T` : "—", "Total des rebuts"],
      ["Temps total prod. (h) / Mois", rows.length ? `${fmt(kpis.totalHours)} h` : "—", `Perdues : ${fmt(kpis.plannedStops + kpis.unplannedStops)} h · Actives : ${fmt(kpis.activeHours)} h`],
    ];
    const cardWidth = (pageWidth - 36) / 2;
    cards.forEach(([label, value, detail], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 15 + col * (cardWidth + 6);
      const y = 102 + row * 35;
      doc.setDrawColor(226, 232, 223);
      doc.setFillColor(255, 254, 250);
      doc.roundedRect(x, y, cardWidth, 29, 3, 3, "FD");
      doc.setFillColor(...gold);
      doc.rect(x, y, cardWidth, 2, "F");
      doc.setTextColor(96, 112, 99);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(label, x + 5, y + 9);
      doc.setTextColor(...green);
      doc.setFontSize(15);
      doc.text(value, x + 5, y + 18);
      doc.setTextColor(106, 120, 109);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(doc.splitTextToSize(detail, cardWidth - 10), x + 5, y + 24);
    });
    doc.setTextColor(110, 125, 107);
    doc.setFontSize(8);
    doc.text(`${rows.length} ligne(s) de registre incluse(s) dans cette synthèse.`, 15, 212);
    doc.save(`synthese-production-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("Rapport PDF généré", { description: "La synthèse est téléchargée sur votre appareil." });
  };

  return <div className="registry-screen">
    <header className="registry-topbar">
      <Link href="/" className="registry-back"><ArrowLeft size={16} />Vue d’ensemble</Link>
      <div className="registry-brand"><span className="registry-brand-mark"><img src="/manus-storage/almaraai-corn-logo_37c73384.png" alt="Logo Almaraïi" /></span><div><strong>Almaraïi</strong><small>Production Pulse</small></div></div>
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
          <button className="registry-pdf" onClick={() => void downloadPdf()} disabled={rows.length === 0}><FileText size={15} />Télécharger PDF</button>
          <button className="registry-export" onClick={exportRows}><Download size={15} />Exporter CSV</button><button className="registry-excel" onClick={downloadSynchronizedExcel} disabled={synchronizedFileQuery.isLoading}><Download size={15} />Excel synchronisé</button>
        </div>
        <p className="registry-import-note"><Upload size={13} />Format attendu : DATE, ARTICLE, TEMPS TOTAL PROD. (h), ARRÊTS PLAN. (h), ARRÊTS NON PL. (h), PROD. (T), REBUTS (T), CADENCE STD. Une ligne existante est mise à jour si son ID ou sa combinaison date–article correspond.</p>
        <div className="registry-table-wrap">
          <table className="registry-table"><thead><tr><th>Date</th><th>Article</th><th>Production</th><th>Rebuts</th><th>Disponibilité</th><th>Performance</th><th>TRS</th><th>Heures réelles</th><th>Commentaire</th><th /></tr></thead><tbody>{registryQuery.isLoading ? <tr><td colSpan={10} className="registry-empty">Chargement des lignes sauvegardées…</td></tr> : rows.length ? rows.map((row) => <tr key={row.id}><td><span className="registry-date-cell"><CalendarDays size={14} />{prettyDate(row.productionDate)}</span></td><td><strong>{row.article}</strong></td><td>{fmt(asNumber(row.productionTons))} T</td><td>{fmt(asNumber(row.wasteTons))} T</td><td>{pct(asNumber(row.availability))}</td><td>{pct(asNumber(row.performance))}</td><td><strong>{pct(asNumber(row.trs))}</strong></td><td>{fmt(asNumber(row.realHours))} h</td><td className="registry-comment">{row.comment || <span>—</span>}</td><td><button className="registry-delete" onClick={() => requestDelete(row.id)} aria-label={`Supprimer ${row.article} du ${row.productionDate}`}><Trash2 size={15} /></button></td></tr>) : <tr><td colSpan={10} className="registry-empty"><Factory size={22} /><strong>Aucune ligne sauvegardée pour ce filtre.</strong><span>Utilisez « Saisir une production » ou « Importer Excel » pour alimenter le registre.</span></td></tr>}</tbody></table>
        </div>
        <footer className="registry-foot"><span><Activity size={14} />Les lignes affichées sont sauvegardées de façon persistante.</span><span>{rows.length} résultat{rows.length > 1 ? "s" : ""}</span></footer>
      </section>
    </main>
  </div>;
}
