// Centre de rapports : regroupe les exports auparavant dispersés sur Silo PF,
// Ajouter production/expédition, Traçabilité des lots, Registre journalier et
// Programme journalier (un seul bouton par export, plus aucun doublon),
// classés par domaine plutôt qu'en une grille indifférenciée.
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Boxes, CalendarDays, Database, Download, FileSpreadsheet, FileText, Menu, PackageSearch, SlidersHorizontal } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";
import { generateDayPdf } from "@/lib/dayPdfReport";
import { generateDailyProgramPdf } from "@/lib/dailyProgramPdf";

const today = () => new Date().toISOString().slice(0, 10);

async function downloadWorkbook(fileName: string, fileBase64: string) {
  const bytes = Uint8Array.from(atob(fileBase64), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { openSidebar } = useSidebar();

  // --- Silo PF (classeur Excel) ---
  const [isExportingSilo, setIsExportingSilo] = useState(false);
  const exportSiloWorkbook = trpc.useUtils().silo.exportExcel;
  const downloadSiloWorkbook = async () => {
    setIsExportingSilo(true);
    try {
      const { fileName, fileBase64 } = await exportSiloWorkbook.fetch();
      await downloadWorkbook(fileName, fileBase64);
      toast.success("Classeur Silo PF exporté", { description: fileName });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’export du classeur a échoué.");
    } finally {
      setIsExportingSilo(false);
    }
  };

  // --- Traçabilité des lots (classeur Excel) ---
  const [isExportingLots, setIsExportingLots] = useState(false);
  const exportLedger = trpc.useUtils().silo.exportLotLedger;
  const downloadLedger = async () => {
    setIsExportingLots(true);
    try {
      const { fileName, fileBase64 } = await exportLedger.fetch();
      await downloadWorkbook(fileName, fileBase64);
      toast.success("Traçabilité des lots exportée", { description: fileName });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’export de la traçabilité a échoué.");
    } finally {
      setIsExportingLots(false);
    }
  };

  // --- Registre de production synchronisé (classeur Excel) ---
  const synchronizedFileQuery = trpc.production.syncFile.useQuery();
  const downloadSynchronizedExcel = () => {
    const url = synchronizedFileQuery.data?.downloadUrl;
    if (!url) { toast.error("Le fichier Excel synchronisé est en cours de préparation."); return; }
    window.location.assign(url);
  };

  // --- Registre journalier filtré (classeur Excel) et rapport PDF par jour : mêmes lignes source. ---
  const registryQuery = trpc.production.list.useQuery();
  const registryRows = useMemo(() => (registryQuery.data ?? []).map((row) => ({ ...row, productionDate: row.productionDate.slice(0, 10) })), [registryQuery.data]);

  const [filterQuery, setFilterQuery] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const filteredRowsPreview = useMemo(() => registryRows
    .filter((row) => (!filterQuery || row.article.toLowerCase().includes(filterQuery.toLowerCase()) || row.productionDate.includes(filterQuery) || row.comment?.toLowerCase().includes(filterQuery.toLowerCase()))
      && (!filterFrom || row.productionDate >= filterFrom)
      && (!filterTo || row.productionDate <= filterTo)), [registryRows, filterQuery, filterFrom, filterTo]);
  const [isExportingRegistry, setIsExportingRegistry] = useState(false);
  const exportFilteredExcel = trpc.useUtils().production.exportFilteredExcel;
  const downloadFilteredExcel = async () => {
    setIsExportingRegistry(true);
    try {
      const { fileName, fileBase64 } = await exportFilteredExcel.fetch({ query: filterQuery || undefined, dateFrom: filterFrom || undefined, dateTo: filterTo || undefined });
      await downloadWorkbook(fileName, fileBase64);
      toast.success("Registre filtré exporté", { description: fileName });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "L’export du registre a échoué.");
    } finally {
      setIsExportingRegistry(false);
    }
  };

  const [pdfDate, setPdfDate] = useState(today);
  const [pdfComment, setPdfComment] = useState("");
  const [isExportingDayPdf, setIsExportingDayPdf] = useState(false);
  const exportDayPdf = async () => {
    setIsExportingDayPdf(true);
    try {
      await generateDayPdf({ productionDate: pdfDate, allRows: registryRows, exportComment: pdfComment });
      toast.success("Rapport PDF journalier généré");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Le rapport PDF ne peut pas être généré.");
    } finally {
      setIsExportingDayPdf(false);
    }
  };

  // --- Programme journalier (PDF, par date) ---
  const [programDate, setProgramDate] = useState(today);
  const programInput = useMemo(() => ({ programDate }), [programDate]);
  const programQuery = trpc.dailyProgram.byDate.useQuery(programInput);
  const [isExportingProgram, setIsExportingProgram] = useState(false);
  const exportProgramPdf = async () => {
    const program = programQuery.data;
    if (!program) return;
    setIsExportingProgram(true);
    try {
      await generateDailyProgramPdf({ programDate: program.programDate, operatorName: program.operatorName, lines: program.lines });
      toast.success("Programme PDF téléchargé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de générer le programme PDF.");
    } finally {
      setIsExportingProgram(false);
    }
  };
  const programButtonLabel = isExportingProgram ? "Génération…" : programQuery.isLoading ? "Chargement…" : !programQuery.data ? "Aucun programme à cette date" : "Exporter le PDF";

  return (
    <main className="settings-screen">
      <header className="settings-topbar">
        <button className="mobile-menu" onClick={openSidebar} aria-label="Ouvrir le menu"><Menu size={20} /></button>
        <Link href="/" className="settings-back"><ArrowLeft size={16} />Retour au tableau de bord</Link>
        <div className="settings-brand"><div className="settings-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div>
      </header>
      <section className="settings-page">
        <div className="settings-hero">
          <div><span className="settings-kicker"><FileSpreadsheet size={14} />Export centralisé</span><h1>Centre de <em>rapports</em></h1><p>Choisissez un rapport et exportez-le directement, sans passer par chaque page de gestion.</p></div>
          <div className="settings-status"><Download size={18} /><div><strong>6 rapports</strong><span>Excel et PDF</span></div></div>
        </div>

        <div className="reports-group">
          <h2 className="reports-group-title"><Boxes size={14} />État des silos</h2>
          <div className="settings-grid">
            <article className="settings-card">
              <div className="settings-card-heading"><div className="settings-icon"><Boxes size={19} /></div><div><span>Classeur complet</span><h2>Silo PF</h2></div></div>
              <p className="settings-copy">Classeur Excel complet des entrées, expéditions et du stock par silo.</p>
              <button type="button" className="settings-primary" onClick={downloadSiloWorkbook} disabled={isExportingSilo}><Download size={16} />{isExportingSilo ? "Export…" : "Exporter le classeur"}</button>
            </article>

            <article className="settings-card">
              <div className="settings-card-heading"><div className="settings-icon"><PackageSearch size={19} /></div><div><span>Suivi FIFO</span><h2>Traçabilité des lots</h2></div></div>
              <p className="settings-copy">Classeur Excel du suivi FIFO des lots, silo par silo, avec la quantité restante par article.</p>
              <button type="button" className="settings-primary" onClick={downloadLedger} disabled={isExportingLots}><Download size={16} />{isExportingLots ? "Export…" : "Exporter en Excel"}</button>
            </article>
          </div>
        </div>

        <div className="reports-group">
          <h2 className="reports-group-title"><Database size={14} />Registre journalier</h2>
          <div className="settings-grid">
            <article className="settings-card">
              <div className="settings-card-heading"><div className="settings-icon security"><Database size={19} /></div><div><span>Classeur automatique</span><h2>Registre synchronisé</h2></div></div>
              <p className="settings-copy">Le classeur Excel maintenu automatiquement à partir de toutes les lignes du registre.</p>
              <button type="button" className="settings-primary" onClick={downloadSynchronizedExcel} disabled={synchronizedFileQuery.isLoading}><Download size={16} />Télécharger le classeur</button>
            </article>

            <article className="settings-card">
              <div className="settings-card-heading"><div className="settings-icon security"><SlidersHorizontal size={19} /></div><div><span>Recherche & période</span><h2>Registre filtré</h2></div></div>
              <p className="settings-copy">Classeur Excel filtré par recherche et par période, comme depuis le Registre.</p>
              <div className="password-form">
                <label>Recherche (article, date, commentaire)<input value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} placeholder="Ex. CM1" /></label>
                <label>Du<input type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} /></label>
                <label>Au<input type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} /></label>
                <button type="button" className="settings-primary" onClick={downloadFilteredExcel} disabled={isExportingRegistry || registryQuery.isLoading}><Download size={16} />{isExportingRegistry ? "Export…" : `Exporter en Excel (${filteredRowsPreview.length})`}</button>
              </div>
            </article>

            <article className="settings-card">
              <div className="settings-card-heading"><div className="settings-icon security"><FileText size={19} /></div><div><span>Rapport détaillé</span><h2>Rapport PDF (par jour)</h2></div></div>
              <p className="settings-copy">Rapport PDF détaillé d’une journée de production, avec un commentaire facultatif.</p>
              <div className="password-form">
                <label>Date<input type="date" value={pdfDate} onChange={(event) => setPdfDate(event.target.value)} /></label>
                <label>Commentaire d’export (facultatif)<textarea value={pdfComment} onChange={(event) => setPdfComment(event.target.value)} maxLength={1200} placeholder="Ex. Situation particulière, consigne de suivi…" /></label>
                <button type="button" className="settings-primary" onClick={exportDayPdf} disabled={isExportingDayPdf || registryQuery.isLoading}><Download size={16} />{isExportingDayPdf ? "Génération…" : "Exporter le PDF"}</button>
              </div>
            </article>
          </div>
        </div>

        <div className="reports-group">
          <h2 className="reports-group-title"><CalendarDays size={14} />Programme journalier</h2>
          <div className="settings-grid reports-grid-single">
            <article className="settings-card">
              <div className="settings-card-heading"><div className="settings-icon"><CalendarDays size={19} /></div><div><span>Réf: For-Prod-09</span><h2>Programme journalier</h2></div></div>
              <p className="settings-copy">Le PDF « Programme de Production » d’une date choisie.</p>
              <div className="password-form">
                <label>Date<input type="date" value={programDate} onChange={(event) => setProgramDate(event.target.value)} /></label>
                <button type="button" className="settings-primary" onClick={exportProgramPdf} disabled={!programQuery.data || isExportingProgram}><Download size={16} />{programButtonLabel}</button>
              </div>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
