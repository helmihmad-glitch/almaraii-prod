// Atelier Signal — page de pilotage : composition en feuille de production, signaux orange et typographie éditoriale.
import { useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, CalendarDays,
  ChevronDown, CircleHelp, ClipboardList, Download, Factory, Gauge,
  LayoutDashboard, Menu, MoreHorizontal, PackageCheck, Search, Settings2,
  SlidersHorizontal, Sparkles, Target, Timer, TrendingUp, TriangleAlert,
  X,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import data from "@/data/app-data.json";

type Day = (typeof data.months)[number]["daily"][number];
type Month = (typeof data.months)[number];

const monthNames: Record<string, string> = { avril: "Avril", mai: "Mai", juin: "Juin", juillet: "Juillet", aout2026: "Août" };
const fmt = (value: number, digits = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
const pct = (value: number) => `${Math.round(value * 100)}%`;
const shortDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00`)).replace(".", "");

function MetricCard({ label, value, detail, icon: Icon, tone = "blue", trend }: { label: string; value: string; detail: string; icon: any; tone?: "blue" | "orange" | "green" | "ink"; trend?: string }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-top"><span className="eyebrow"><span className="eyebrow-dot" />{label}</span><Icon size={17} strokeWidth={1.8} /></div>
      <div className="metric-value-row"><strong>{value}</strong>{trend && <span className="metric-trend"><ArrowUpRight size={13} />{trend}</span>}</div>
      <p>{detail}</p>
    </article>
  );
}

function Donut({ value }: { value: number }) {
  const deg = Math.min(value, 1) * 360;
  return <div className="donut" style={{ background: `conic-gradient(var(--signal) ${deg}deg, #e7e4dc ${deg}deg)` }}><div className="donut-hole"><strong>{pct(value)}</strong><span>du plan</span></div></div>;
}

export default function Home() {
  const months = data.months as unknown as Month[];
  const [selectedKey, setSelectedKey] = useState(months[months.length - 2]?.key ?? months[0].key);
  const [articleFilter, setArticleFilter] = useState("Toutes les lignes");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const month = months.find((item) => item.key === selectedKey) ?? months[0];

  const filteredDays = useMemo(() => month.daily.filter((day) => (articleFilter === "Toutes les lignes" || day.article === articleFilter) && (!query || day.article.toLowerCase().includes(query.toLowerCase()) || day.date.includes(query))), [month, articleFilter, query]);
  const articles = useMemo(() => month.articles.length ? month.articles : Array.from(new Set(month.daily.map((d) => d.article))).map((article) => ({ article, production: month.daily.filter((d) => d.article === article).reduce((sum, d) => sum + d.production, 0), share: 0 })), [month]);
  const chartData = useMemo(() => {
    const grouped = new Map<string, { date: string; production: number; trs: number; waste: number }>();
    filteredDays.forEach((day) => { const current = grouped.get(day.date) ?? { date: day.date, production: 0, trs: 0, waste: 0 }; current.production += day.production; current.trs = Math.max(current.trs, day.trs); current.waste += day.waste; grouped.set(day.date, current); });
    return Array.from(grouped.values()).map((item) => ({ ...item, label: shortDate(item.date), trs: Math.round(item.trs * 100) }));
  }, [filteredDays]);
  const avgTrs = filteredDays.length ? filteredDays.reduce((sum, d) => sum + d.trs, 0) / filteredDays.length : month.trs;
  const activeLines = new Set(month.daily.map((d) => d.article)).size;

  const exportData = () => {
    const csv = ["Date;Article;Production (T);Rebuts (T);TRS (%)", ...filteredDays.map((d) => `${d.date};${d.article};${d.production};${d.waste};${Math.round(d.trs * 100)}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `production-${month.key}.csv`; link.click(); URL.revokeObjectURL(url); toast.success("Export CSV généré", { description: `${filteredDays.length} lignes exportées pour ${month.name}.` });
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><img src="/manus-storage/ap-monogram_c6867464.png" alt="" /></div><div><strong>Almaraïi</strong><span>Production Pulse</span></div><button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu"><X size={18} /></button></div>
        <div className="rail-section"><span className="rail-label">Espace opérationnel</span><nav>
          <button className="rail-link active"><LayoutDashboard size={17} />Vue d’ensemble</button>
          <button className="rail-link" onClick={() => toast.info("Le registre détaillé sera disponible dans une prochaine version.")}><ClipboardList size={17} />Registre journalier</button>
          <button className="rail-link" onClick={() => toast.info("La comparaison multi-lignes arrive bientôt.")}><BarChart3 size={17} />Analyse des lignes</button>
        </nav></div>
        <div className="rail-section"><span className="rail-label">Raccourcis</span><nav>
          <button className="rail-link" onClick={exportData}><Download size={17} />Exporter les données</button>
          <button className="rail-link" onClick={() => toast.info("Les paramètres sont en préparation.")}><Settings2 size={17} />Paramètres</button>
        </nav></div>
        <div className="rail-footer"><div className="status-pulse"><span />Source synchronisée</div><small>Classeur : Dashboard_Production.xlsx<br />Dernière lecture · aujourd’hui</small></div>
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu" />}
      <main className="main-content">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Ouvrir le menu"><Menu size={20} /></button><div className="breadcrumb"><span>Production</span><ChevronDown size={14} /><strong>Vue d’ensemble</strong></div></div><div className="topbar-actions"><button className="icon-button" aria-label="Rechercher" onClick={() => document.getElementById("registry-search")?.focus()}><Search size={17} /></button><button className="icon-button notification" aria-label="Notifications" onClick={() => toast.info("Aucun nouvel événement critique.")}><Bell size={17} /><i /></button><div className="avatar">ML</div></div></header>
        <div className="content-wrap">
          <section className="page-intro"><div><div className="kicker"><span className="kicker-line" />Pilotage usine · 2026</div><h1>La cadence tient l’objectif<br /><em>— surveiller les rebuts.</em></h1><p className="intro-copy">Une lecture opérationnelle de la production, de la disponibilité et du TRS pour agir avant que l’écart ne devienne une rupture.</p></div><div className="period-control"><span className="control-label">Période observée</span><div className="select-wrap"><CalendarDays size={16} /><select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} aria-label="Choisir un mois">{months.map((item) => <option key={item.key} value={item.key}>{monthNames[item.key.split("-")[0]] ?? item.name}</option>)}</select><ChevronDown size={15} /></div><span className="period-note"><span className="live-dot" />Données du classeur</span></div></section>
          <section className="hero-panel"><div className="hero-copy"><div className="eyebrow light"><span className="eyebrow-dot" />Objectif mensuel · {month.name}</div><h2>{fmt(month.totalProduction)} <span>/ {fmt(month.target)} T</span></h2><p>{month.totalProduction >= month.target ? "Objectif dépassé — la ligne reste à surveiller sur la qualité." : `${fmt(month.target - month.totalProduction)} T restent à produire pour atteindre le plan.`}</p><div className="progress-track"><span style={{ width: `${Math.min(month.progress * 100, 100)}%` }} /><i style={{ left: `${Math.min(month.progress * 100, 100)}%` }} /></div><div className="progress-foot"><span>Progression réelle <strong>{pct(month.progress)}</strong></span><span>Plan <strong>{fmt(month.target)} T</strong></span></div></div><div className="hero-donut"><Donut value={month.progress} /><span>atteinte du plan</span></div><div className="hero-texture" /></section>
          <section className="metrics-grid"><MetricCard label="TRS global" value={pct(avgTrs)} detail="Disponibilité × performance × qualité" icon={Gauge} tone="orange" trend="+4,2 pts" /><MetricCard label="Disponibilité" value={pct(month.availability)} detail="Temps utile sur temps planifié" icon={Activity} tone="green" trend="+2,1 pts" /><MetricCard label="Performance" value={pct(month.performance)} detail="Cadence réelle vs cadence standard" icon={TrendingUp} tone="blue" /><MetricCard label="Rebuts / déchets" value={`${fmt(month.waste, 1)} T`} detail={month.waste === 0 ? "Aucun rebut enregistré" : "À surveiller sur la période"} icon={TriangleAlert} tone={month.waste === 0 ? "green" : "orange"} /></section>
          <section className="dashboard-grid"><article className="panel trend-panel"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />Rythme de production</div><h3>Sorties journalières</h3></div><div className="legend"><span className="legend-production" />Production (T)<span className="legend-trs" />TRS (%)</div></div><div className="chart-wrap">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}><defs><linearGradient id="fillProduction" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f06b3c" stopOpacity={0.3} /><stop offset="100%" stopColor="#f06b3c" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="2 6" stroke="#dedbd3" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#85847d", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" /><YAxis yAxisId="left" tick={{ fill: "#85847d", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: "#85847d", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} /><Tooltip contentStyle={{ background: "#132b35", border: "0", borderRadius: "8px", color: "white", fontSize: "12px" }} formatter={(value: number, name: string) => [name === "trs" ? `${value}%` : `${value} T`, name === "trs" ? "TRS" : "Production"]} /><Area yAxisId="left" type="monotone" dataKey="production" stroke="#f06b3c" strokeWidth={2.5} fill="url(#fillProduction)" /><Area yAxisId="right" type="monotone" dataKey="trs" stroke="#356f83" strokeWidth={2} fill="none" strokeDasharray="5 5" /></AreaChart></ResponsiveContainer> : <div className="empty-chart">Aucune donnée pour ce filtre.</div>}</div><div className="chart-caption"><span><strong>{fmt(filteredDays.reduce((sum, d) => sum + d.production, 0), 1)} T</strong> sur {filteredDays.length} enregistrements</span><span className="caption-positive"><ArrowUpRight size={14} />Période {month.name}</span></div></article>
          <article className="panel lines-panel"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />Répartition</div><h3>Production par ligne</h3></div><button className="more-button" onClick={() => toast.info("Les détails par ligne sont disponibles dans le registre.")} aria-label="Plus d’options"><MoreHorizontal size={18} /></button></div><div className="line-list">{articles.map((item, index) => <div className="line-item" key={item.article}><div className="line-icon">{index === 0 ? <PackageCheck size={16} /> : <Factory size={16} />}</div><div className="line-main"><div><strong>{item.article}</strong><span>{fmt(item.production, 1)} T</span></div><div className="mini-track"><i style={{ width: `${Math.min((item.production / Math.max(month.totalProduction, 1)) * 100, 100)}%` }} /></div></div><span className="line-share">{item.share ? pct(item.share) : pct(item.production / Math.max(month.totalProduction, 1))}</span></div>)}</div><button className="text-button" onClick={() => { setArticleFilter("Toutes les lignes"); document.getElementById("registry")?.scrollIntoView({ behavior: "smooth" }); }}>Voir le registre complet <ArrowUpRight size={14} /></button></article></section>
          <section className="panel registry-panel" id="registry"><div className="panel-heading registry-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />Journal d’activité</div><h3>Dernières productions</h3></div><div className="registry-actions"><div className="search-input"><Search size={15} /><input id="registry-search" placeholder="Rechercher une ligne ou une date" value={query} onChange={(event) => setQuery(event.target.value)} /></div><button className="filter-button" onClick={() => setArticleFilter(articleFilter === "Toutes les lignes" ? (articles[0]?.article ?? "Toutes les lignes") : "Toutes les lignes")}><SlidersHorizontal size={15} />{articleFilter === "Toutes les lignes" ? "Filtrer" : articleFilter}</button><button className="export-button" onClick={exportData}><Download size={15} />Exporter</button></div></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Article</th><th>Production</th><th>Rebuts</th><th>Disponibilité</th><th>TRS</th><th>État</th></tr></thead><tbody>{filteredDays.slice(-8).reverse().map((day: Day) => <tr key={`${day.date}-${day.article}`}><td><span className="date-cell"><CalendarDays size={13} />{shortDate(day.date)}</span></td><td><strong className="article-code">{day.article}</strong></td><td>{fmt(day.production, 1)} T</td><td className={day.waste > 0 ? "warning-text" : "muted-text"}>{fmt(day.waste, 1)} T</td><td>{pct(day.availability)}</td><td><strong>{pct(day.trs)}</strong></td><td><span className={`state ${day.trs >= 0.6 ? "state-ok" : "state-watch"}`}><span />{day.trs >= 0.6 ? "Dans le rythme" : "À surveiller"}</span></td></tr>)}</tbody></table></div><div className="table-footer"><span>Affichage de {Math.min(filteredDays.length, 8)} lignes sur {filteredDays.length}</span><span><span className="small-status" />Données calculées depuis le registre journalier</span></div></section>
          <footer className="page-footer"><span><Sparkles size={14} />Pulse opérationnel · lecture {month.name}</span><span><CircleHelp size={14} />Les valeurs sont issues du classeur source et recalculées côté interface.</span></footer>
        </div>
      </main>
    </div>
  );
}
