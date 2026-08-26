import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Clock, Database, Pencil, Plus, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";

type LineDraft = { sequence: string; article: string; version: string; bagQuantity: string; bulkQuantity: string; plannedStart: string; plannedEnd: string; observation: string };
const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = (sequence = "1"): LineDraft => ({ sequence, article: "", version: "", bagQuantity: "", bulkQuantity: "", plannedStart: "", plannedEnd: "", observation: "" });
const formatDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));

export default function DailyProgramData() {
  const utils = trpc.useUtils();
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<number[]>([]);
  const [actionPassword, setActionPassword] = useState("");
  const [lineDraft, setLineDraft] = useState<LineDraft>(emptyLine());
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const programInput = useMemo(() => ({ programDate: selectedDate }), [selectedDate]);
  const programsQuery = trpc.dailyProgram.list.useQuery();
  const programQuery = trpc.dailyProgram.byDate.useQuery(programInput);
  const articlesQuery = trpc.settings.listArticles.useQuery();
  const operatorsQuery = trpc.settings.listOperators.useQuery();
  const program = programQuery.data;
  const lines = program?.lines ?? [];
  const operators = operatorsQuery.data ?? [];
  const articles = articlesQuery.data ?? [];
  const storedOperatorNames = (program?.operatorName ?? "").split(/[·,&]/).map((value) => value.trim()).filter(Boolean);
  const legacyOperatorNames = storedOperatorNames.filter((name) => !operators.some((operator) => operator.name.toLocaleLowerCase() === name.toLocaleLowerCase()));
  const selectedOperatorNames = [...legacyOperatorNames, ...operators.filter((operator) => selectedOperatorIds.includes(operator.id)).map((operator) => operator.name)];
  const configuredArticleCodes = articles.map((article) => article.code);

  const refreshPrograms = async () => { await Promise.all([utils.dailyProgram.list.invalidate(), utils.dailyProgram.byDate.invalidate()]); };
  const createProgram = trpc.dailyProgram.create.useMutation({ onSuccess: async () => { await refreshPrograms(); toast.success("Programme journalier créé"); }, onError: (error) => toast.error(error.message || "Impossible de créer le programme.") });
  const updateProgram = trpc.dailyProgram.update.useMutation({ onSuccess: async () => { await refreshPrograms(); toast.success("Programme journalier mis à jour"); }, onError: (error) => toast.error(error.message || "Impossible de modifier le programme.") });
  const deleteProgram = trpc.dailyProgram.delete.useMutation({ onSuccess: async () => { await refreshPrograms(); setSelectedOperatorIds([]); setLineDraft(emptyLine()); toast.success("Programme journalier supprimé"); }, onError: (error) => toast.error(error.message || "Impossible de supprimer le programme.") });
  const createLine = trpc.dailyProgram.createLine.useMutation({ onSuccess: async () => { await refreshPrograms(); setLineDraft(emptyLine(String(lines.length + 2))); toast.success("Ligne de programme ajoutée"); }, onError: (error) => toast.error(error.message || "Impossible d’ajouter cette ligne.") });
  const updateLine = trpc.dailyProgram.updateLine.useMutation({ onSuccess: async () => { await refreshPrograms(); setEditingLineId(null); setLineDraft(emptyLine(String(lines.length + 1))); toast.success("Ligne de programme mise à jour"); }, onError: (error) => toast.error(error.message || "Impossible de modifier cette ligne.") });
  const deleteLine = trpc.dailyProgram.deleteLine.useMutation({ onSuccess: async () => { await refreshPrograms(); toast.success("Ligne de programme supprimée"); }, onError: (error) => toast.error(error.message || "Impossible de supprimer cette ligne.") });

  useEffect(() => {
    setSelectedOperatorIds(operators.filter((operator) => storedOperatorNames.some((name) => name.toLocaleLowerCase() === operator.name.toLocaleLowerCase())).map((operator) => operator.id));
    setEditingLineId(null);
    setLineDraft(emptyLine(String((program?.lines?.length ?? 0) + 1)));
  }, [program?.id, program?.operatorName, selectedDate, operators.length]);

  const requirePassword = () => {
    if (!actionPassword) { toast.error("Saisissez le mot de passe de gestion pour enregistrer les modifications."); return false; }
    return true;
  };
  const toggleOperator = (operatorId: number) => setSelectedOperatorIds((current) => current.includes(operatorId) ? current.filter((id) => id !== operatorId) : [...current, operatorId]);
  const submitProgram = (event: React.FormEvent) => {
    event.preventDefault();
    if (!requirePassword()) return;
    if (selectedOperatorNames.length === 0) { toast.error("Sélectionnez au moins un pupitreur pour ce programme."); return; }
    const payload = { programDate: selectedDate, operatorName: selectedOperatorNames.join(" · "), actionPassword };
    if (program) updateProgram.mutate({ id: program.id, ...payload }); else createProgram.mutate(payload);
  };
  const submitLine = (event: React.FormEvent) => {
    event.preventDefault();
    if (!program) { toast.error("Créez d’abord l’en-tête du programme."); return; }
    if (!requirePassword()) return;
    if (!lineDraft.plannedStart || !lineDraft.plannedEnd) { toast.error("Renseignez les heures de début et de fin prévues."); return; }
    const payload = { programId: program.id, sequence: Number(lineDraft.sequence), article: lineDraft.article, version: lineDraft.version, bagQuantity: lineDraft.bagQuantity, bulkQuantity: lineDraft.bulkQuantity, plannedStart: lineDraft.plannedStart, plannedEnd: lineDraft.plannedEnd, observation: lineDraft.observation, actionPassword };
    if (editingLineId) updateLine.mutate({ id: editingLineId, ...payload }); else createLine.mutate(payload);
  };
  const editLine = (line: typeof lines[number]) => {
    setEditingLineId(line.id);
    setLineDraft({ sequence: String(line.sequence), article: line.article ?? "", version: line.version ?? "", bagQuantity: line.bagQuantity ?? "", bulkQuantity: line.bulkQuantity ?? "", plannedStart: line.plannedStart, plannedEnd: line.plannedEnd, observation: line.observation ?? "" });
  };
  const removeLine = (id: number) => { if (requirePassword() && window.confirm("Supprimer cette ligne du programme ?")) deleteLine.mutate({ id, actionPassword }); };
  const removeProgram = () => { if (program && requirePassword() && window.confirm(`Supprimer le programme du ${formatDate(selectedDate)} et toutes ses lignes ?`)) deleteProgram.mutate({ id: program.id, actionPassword }); };

  return (
    <main className="daily-program-screen">
      <header className="daily-program-topbar"><Link href="/programme-journalier" className="daily-program-back"><ArrowLeft size={16} />Voir le programme</Link><div className="daily-program-brand"><div className="daily-program-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div></header>
      <section className="daily-program-page">
        <div className="daily-program-hero daily-program-data-hero"><div><span className="daily-program-kicker"><Database size={14} />Administration</span><h1>Programme journalier <em>donnée</em></h1></div><label className="daily-program-date"><span>Date à gérer</span><div><CalendarDays size={16} /><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label="Choisir la date à gérer" /></div></label></div>
        <div className="daily-program-data-layout">
          <aside className="daily-program-list-card"><div className="daily-program-list-heading"><div><span>Programmes enregistrés</span><strong>{programsQuery.data?.length ?? 0}</strong></div><CalendarDays size={17} /></div>{programsQuery.isLoading ? <p>Chargement…</p> : programsQuery.data?.length ? <div className="daily-program-date-list">{programsQuery.data.map((item) => <button key={item.id} type="button" className={item.programDate === selectedDate ? "active" : ""} onClick={() => setSelectedDate(item.programDate)}><strong>{formatDate(item.programDate)}</strong><span>{item.operatorName}</span></button>)}</div> : <p>Aucun programme n’est encore enregistré.</p>}</aside>
          <div className="daily-program-management">
            <section className="daily-program-manage-card"><div className="daily-program-card-heading"><div><ShieldCheck size={18} /><div><span>En-tête du programme</span><h2>{program ? "Modifier le programme" : "Créer le programme"}</h2></div></div>{program && <button type="button" className="daily-program-danger" onClick={removeProgram} disabled={deleteProgram.isPending}><Trash2 size={15} />Supprimer</button>}</div><form className="daily-program-header-form" onSubmit={submitProgram}><fieldset className="daily-program-operator-picker"><legend><Users size={15} />Pupitreurs du jour</legend>{operatorsQuery.isLoading ? <span>Chargement des pupitreurs…</span> : operators.length ? <div>{operators.map((operator) => <label key={operator.id}><input type="checkbox" checked={selectedOperatorIds.includes(operator.id)} onChange={() => toggleOperator(operator.id)} />{operator.name}</label>)}</div> : <p>Ajoutez d’abord des pupitreurs dans Paramètres.</p>}{legacyOperatorNames.length > 0 && <p className="daily-program-legacy-operator">Pupitreur historique conservé : {legacyOperatorNames.join(" · ")}. Ajoutez-le à Paramètres pour le sélectionner ici.</p>}</fieldset><label>Mot de passe de gestion<input type="password" value={actionPassword} onChange={(event) => setActionPassword(event.target.value)} placeholder="Mot de passe actuel" autoComplete="current-password" required /></label><button className="daily-program-primary" type="submit" disabled={createProgram.isPending || updateProgram.isPending}><Save size={16} />{program ? "Enregistrer les modifications" : "Créer le programme"}</button></form></section>
            <section className="daily-program-manage-card"><div className="daily-program-card-heading"><div><Clock size={18} /><div><span>Planning détaillé</span><h2>{editingLineId ? "Modifier une ligne" : "Ajouter une ligne"}</h2></div></div></div><form className="daily-program-line-form" onSubmit={submitLine}><div className="daily-program-fields"><label>N°<input type="number" min="1" max="999" value={lineDraft.sequence} onChange={(event) => setLineDraft({ ...lineDraft, sequence: event.target.value })} required /></label><label>Article<select value={lineDraft.article} onChange={(event) => setLineDraft({ ...lineDraft, article: event.target.value })}><option value="">Changement / aucun article</option>{lineDraft.article && !configuredArticleCodes.includes(lineDraft.article) && <option value={lineDraft.article}>{lineDraft.article} (historique)</option>}{articles.map((article) => <option key={article.id} value={article.code}>{article.code}</option>)}</select></label><label>Version<input value={lineDraft.version} onChange={(event) => setLineDraft({ ...lineDraft, version: event.target.value })} placeholder="91" /></label><label>Quantité sac<input value={lineDraft.bagQuantity} onChange={(event) => setLineDraft({ ...lineDraft, bagQuantity: event.target.value })} placeholder="50" /></label><label>Quantité vrac<input value={lineDraft.bulkQuantity} onChange={(event) => setLineDraft({ ...lineDraft, bulkQuantity: event.target.value })} placeholder="50 + (30 tonnes)" /></label><label>H début prévue<input type="time" value={lineDraft.plannedStart} onChange={(event) => setLineDraft({ ...lineDraft, plannedStart: event.target.value })} required /></label><label>H fin prévue<input type="time" value={lineDraft.plannedEnd} onChange={(event) => setLineDraft({ ...lineDraft, plannedEnd: event.target.value })} required /></label><label className="daily-program-observation-field">Observation<input value={lineDraft.observation} onChange={(event) => setLineDraft({ ...lineDraft, observation: event.target.value })} placeholder="Changement article, note de production…" /></label></div><div className="daily-program-line-actions">{editingLineId && <button type="button" className="daily-program-secondary" onClick={() => { setEditingLineId(null); setLineDraft(emptyLine(String(lines.length + 1))); }}>Annuler</button>}<button className="daily-program-primary" type="submit" disabled={!program || createLine.isPending || updateLine.isPending}><Plus size={16} />{editingLineId ? "Mettre à jour la ligne" : "Ajouter la ligne"}</button></div></form><div className="daily-program-admin-table-wrap"><table className="daily-program-admin-table"><thead><tr><th>N°</th><th>Article</th><th>Version</th><th>Sac</th><th>Vrac</th><th>Début</th><th>Fin</th><th>Observation</th><th>Actions</th></tr></thead><tbody>{lines.length ? lines.map((line) => <tr key={line.id}><td>{line.sequence}</td><td>{line.article || "—"}</td><td>{line.version || "—"}</td><td>{line.bagQuantity || "—"}</td><td>{line.bulkQuantity || "—"}</td><td>{line.plannedStart}</td><td>{line.plannedEnd}</td><td>{line.observation || "—"}</td><td><span className="daily-program-row-actions"><button type="button" onClick={() => editLine(line)} aria-label="Modifier la ligne"><Pencil size={14} /></button><button type="button" onClick={() => removeLine(line.id)} aria-label="Supprimer la ligne"><Trash2 size={14} /></button></span></td></tr>) : <tr><td colSpan={9} className="daily-program-empty-cell">Créez le programme, puis ajoutez sa première ligne de planning.</td></tr>}</tbody></table></div></section>
          </div>
        </div>
      </section>
    </main>
  );
}
