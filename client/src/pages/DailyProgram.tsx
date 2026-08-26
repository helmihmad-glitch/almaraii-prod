import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ClipboardList, Database } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));

export default function DailyProgram() {
  const [selectedDate, setSelectedDate] = useState(today);
  const dateInput = useMemo(() => ({ programDate: selectedDate }), [selectedDate]);
  const programQuery = trpc.dailyProgram.byDate.useQuery(dateInput);
  const program = programQuery.data;

  return (
    <main className="daily-program-screen">
      <header className="daily-program-topbar">
        <Link href="/" className="daily-program-back"><ArrowLeft size={16} />Retour au tableau de bord</Link>
        <div className="daily-program-brand"><div className="daily-program-brand-mark"><img src="/manus-storage/almaraai-corn-logo_37c73384.png" alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div>
      </header>

      <section className="daily-program-page">
        <div className="daily-program-hero">
          <div><span className="daily-program-kicker"><ClipboardList size={14} />Planification de production</span><h1>Programme <em>journalier</em></h1><p>Consultez le programme de fabrication prévu pour une journée et naviguez simplement vers les jours précédents.</p></div>
          <label className="daily-program-date"><span>Date du programme</span><div><CalendarDays size={16} /><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label="Choisir la date du programme" /></div></label>
        </div>

        <section className="daily-program-sheet" aria-live="polite">
          <div className="daily-program-sheet-head">
            <div><span className="daily-program-sheet-label">Date</span><strong>{formatDate(selectedDate)}</strong></div>
            <div><span className="daily-program-sheet-label">Pupitreur</span><strong>{programQuery.isLoading ? "Chargement…" : program?.operatorName || "Aucun pupitreur renseigné"}</strong></div>
            <Link href="/programme-journalier-donnee" className="daily-program-manage-link"><Database size={15} />Gérer les données</Link>
          </div>

          {programQuery.isLoading ? <div className="daily-program-empty">Chargement du programme…</div> : !program ? <div className="daily-program-empty"><ClipboardList size={24} /><strong>Aucun programme enregistré</strong><span>Le programme du {formatDate(selectedDate)} n’a pas encore été saisi.</span><Link href="/programme-journalier-donnee">Créer ce programme</Link></div> : <div className="daily-program-table-wrap"><table className="daily-program-table"><thead><tr><th rowSpan={2}>N°</th><th rowSpan={2}>Article</th><th rowSpan={2}>Version</th><th colSpan={2}>Quantité (tonne)</th><th rowSpan={2}>H début prévue</th><th rowSpan={2}>H fin prévue</th><th rowSpan={2}>Observation</th></tr><tr><th>Sac</th><th>Vrac</th></tr></thead><tbody>{program.lines.length ? program.lines.map((line) => <tr key={line.id}><td>{line.sequence}</td><td className="daily-program-article">{line.article || "—"}</td><td>{line.version || "—"}</td><td>{line.bagQuantity || "—"}</td><td>{line.bulkQuantity || "—"}</td><td>{line.plannedStart}</td><td>{line.plannedEnd}</td><td className="daily-program-observation">{line.observation || "—"}</td></tr>) : <tr><td colSpan={8} className="daily-program-empty-cell">Aucune ligne programmée pour cette journée.</td></tr>}</tbody></table></div>}
        </section>
      </section>
    </main>
  );
}
