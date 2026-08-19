import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Activity, ArrowLeft, CalendarDays, Database, Download, Factory, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type RegistryRow = {
  id: number;
  productionDate: string;
  article: string;
  totalProductionHours: number | string;
  plannedStopsHours: number | string;
  unplannedStopsHours: number | string;
  productionTons: number | string;
  wasteTons: number | string;
  availability: number | string;
  performance: number | string;
  quality: number | string;
  trs: number | string;
  realHours: number | string;
};

const fmt = (value: number, digits = 1) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const pct = (value: number) => `${Math.round(value * 100)} %`;
const prettyDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));

export default function Registry() {
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const registryQuery = trpc.production.list.useQuery();
  const removeLine = trpc.production.delete.useMutation({
    onSuccess: async () => {
      await registryQuery.refetch();
      toast.success("Ligne supprimée du registre");
    },
  });

  const rows = useMemo(() => (registryQuery.data ?? [])
    .map((row) => ({ ...row, productionDate: row.productionDate.slice(0, 10) }) as RegistryRow)
    .filter((row) => (!query || row.article.toLowerCase().includes(query.toLowerCase()) || row.productionDate.includes(query))
      && (!dateFrom || row.productionDate >= dateFrom)
      && (!dateTo || row.productionDate <= dateTo))
    .sort((a, b) => b.productionDate.localeCompare(a.productionDate) || b.id - a.id), [registryQuery.data, query, dateFrom, dateTo]);

  const totalProduction = rows.reduce((sum, row) => sum + Number(row.productionTons), 0);
  const exportRows = () => {
    const csv = ["Date;Article;Production (T);Rebuts (T);Disponibilité (%);TRS (%)", ...rows.map((row) => `${row.productionDate};${row.article};${row.productionTons};${row.wasteTons};${Math.round(Number(row.availability) * 100)};${Math.round(Number(row.trs) * 100)}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "registre-journalier.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Export du registre généré", { description: `${rows.length} lignes exportées.` });
  };

  return <div className="registry-screen">
    <header className="registry-topbar">
      <Link href="/" className="registry-back"><ArrowLeft size={16} />Vue d’ensemble</Link>
      <div className="registry-brand"><span className="registry-brand-mark">AP</span><div><strong>Almaraïi</strong><small>Production Pulse</small></div></div>
      <Link href="/?entry=1" className="registry-add"><Plus size={16} />Saisir une production</Link>
    </header>
    <main className="registry-page">
      <section className="registry-hero">
        <div><span className="registry-kicker"><Database size={14} />Registre persistant</span><h1>Registre <em>journalier</em></h1><p>Chaque ligne enregistrée depuis la saisie de production est conservée ici, avec ses indicateurs calculés.</p></div>
        <div className="registry-total"><span>Production sauvegardée</span><strong>{fmt(totalProduction)} T</strong><small>{rows.length} ligne{rows.length > 1 ? "s" : ""} affichée{rows.length > 1 ? "s" : ""}</small></div>
      </section>
      <section className="registry-workspace">
        <div className="registry-toolbar">
          <div className="registry-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Article ou date" aria-label="Rechercher une saisie" /></div>
          <label className="registry-date">Du<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label className="registry-date">Au<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          {(query || dateFrom || dateTo) && <button className="registry-clear" onClick={() => { setQuery(""); setDateFrom(""); setDateTo(""); }}>Effacer les filtres</button>}
          <button className="registry-export" onClick={exportRows}><Download size={15} />Exporter</button>
        </div>
        <div className="registry-table-wrap">
          <table className="registry-table"><thead><tr><th>Date</th><th>Article</th><th>Production</th><th>Rebuts</th><th>Disponibilité</th><th>Performance</th><th>TRS</th><th>Heures réelles</th><th /></tr></thead><tbody>{registryQuery.isLoading ? <tr><td colSpan={9} className="registry-empty">Chargement des lignes sauvegardées…</td></tr> : rows.length ? rows.map((row) => <tr key={row.id}><td><span className="registry-date-cell"><CalendarDays size={14} />{prettyDate(row.productionDate)}</span></td><td><strong>{row.article}</strong></td><td>{fmt(Number(row.productionTons))} T</td><td>{fmt(Number(row.wasteTons))} T</td><td>{pct(Number(row.availability))}</td><td>{pct(Number(row.performance))}</td><td><strong>{pct(Number(row.trs))}</strong></td><td>{fmt(Number(row.realHours))} h</td><td><button className="registry-delete" onClick={() => { if (window.confirm("Supprimer cette ligne sauvegardée ?")) removeLine.mutate({ id: row.id }); }} aria-label={`Supprimer ${row.article} du ${row.productionDate}`}><Trash2 size={15} /></button></td></tr>) : <tr><td colSpan={9} className="registry-empty"><Factory size={22} /><strong>Aucune ligne sauvegardée pour ce filtre.</strong><span>Utilisez « Saisir une production » pour ajouter une première ligne au registre.</span></td></tr>}</tbody></table>
        </div>
        <footer className="registry-foot"><span><Activity size={14} />Les lignes affichées sont sauvegardées de façon persistante.</span><span>{rows.length} résultat{rows.length > 1 ? "s" : ""}</span></footer>
      </section>
    </main>
  </div>;
}
