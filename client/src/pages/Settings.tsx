import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Check, KeyRound, Menu, Pencil, Plus, Settings2, ShieldCheck, Trash2, UserCog, Users, Warehouse, X } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";

export default function Settings() {
  const { openSidebar } = useSidebar();
  const utils = trpc.useUtils();
  const articlesQuery = trpc.settings.listArticles.useQuery();
  const operatorsQuery = trpc.settings.listOperators.useQuery();
  const silosQuery = trpc.settings.listSilos.useQuery();
  const [articleCode, setArticleCode] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [siloCode, setSiloCode] = useState("");
  const [editingSiloId, setEditingSiloId] = useState<number | null>(null);
  const [editingSiloCode, setEditingSiloCode] = useState("");
  const meQuery = trpc.auth.me.useQuery();
  const [adminCurrentPassword, setAdminCurrentPassword] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [adminPasswordConfirmation, setAdminPasswordConfirmation] = useState("");

  // Pré-remplit l’identifiant courant une fois connu, sans écraser une saisie déjà commencée.
  useEffect(() => {
    if (meQuery.data?.username) setAdminUsername((current) => current || meQuery.data!.username!);
  }, [meQuery.data]);

  const addArticle = trpc.settings.addArticle.useMutation({
    onSuccess: async () => { await utils.settings.listArticles.invalidate(); setArticleCode(""); toast.success("Article ajouté à la liste"); },
    onError: (error) => toast.error(error.message || "Impossible d’ajouter cet article."),
  });
  const archiveArticle = trpc.settings.archiveArticle.useMutation({
    onSuccess: async () => { await utils.settings.listArticles.invalidate(); toast.success("Article retiré de la liste active"); },
    onError: (error) => toast.error(error.message || "Impossible de retirer cet article."),
  });
  const addOperator = trpc.settings.addOperator.useMutation({
    onSuccess: async () => { await utils.settings.listOperators.invalidate(); setOperatorName(""); toast.success("Pupitreur ajouté à la liste"); },
    onError: (error) => toast.error(error.message || "Impossible d’ajouter ce pupitreur."),
  });
  const archiveOperator = trpc.settings.archiveOperator.useMutation({
    onSuccess: async () => { await utils.settings.listOperators.invalidate(); toast.success("Pupitreur retiré de la liste active"); },
    onError: (error) => toast.error(error.message || "Impossible de retirer ce pupitreur."),
  });
  const addSilo = trpc.settings.addSilo.useMutation({
    onSuccess: async () => { await utils.settings.listSilos.invalidate(); setSiloCode(""); toast.success("Silo ajouté à la liste"); },
    onError: (error) => toast.error(error.message || "Impossible d’ajouter ce silo."),
  });
  const renameSilo = trpc.settings.renameSilo.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.settings.listSilos.invalidate(), utils.silo.state.invalidate(), utils.silo.listEntries.invalidate(), utils.silo.listShipments.invalidate(), utils.silo.lotLedger.invalidate()]);
      setEditingSiloId(null);
      toast.success("Silo renommé");
    },
    onError: (error) => toast.error(error.message || "Impossible de renommer ce silo."),
  });
  const archiveSilo = trpc.settings.archiveSilo.useMutation({
    onSuccess: async () => { await utils.settings.listSilos.invalidate(); toast.success("Silo retiré de la liste active"); },
    onError: (error) => toast.error(error.message || "Impossible de retirer ce silo."),
  });
  const changeAdminCredentials = trpc.auth.changeAdminCredentials.useMutation({
    onSuccess: () => { setAdminCurrentPassword(""); setAdminNewPassword(""); setAdminPasswordConfirmation(""); toast.success("Identifiants administrateur mis à jour"); },
    onError: (error) => toast.error(error.message || "Impossible de modifier les identifiants administrateur."),
  });

  const submitArticle = (event: React.FormEvent) => { event.preventDefault(); addArticle.mutate({ code: articleCode.trim().toUpperCase() }); };
  const submitOperator = (event: React.FormEvent) => { event.preventDefault(); addOperator.mutate({ name: operatorName.trim() }); };
  const removeArticle = (id: number, code: string) => {
    if (window.confirm(`Retirer ${code} de la liste active ? L’historique de production restera conservé.`)) archiveArticle.mutate({ id });
  };
  const removeOperator = (id: number, name: string) => {
    if (window.confirm(`Retirer ${name} de la liste active ? Les programmes déjà enregistrés resteront conservés.`)) archiveOperator.mutate({ id });
  };
  const submitSilo = (event: React.FormEvent) => { event.preventDefault(); addSilo.mutate({ code: siloCode.trim().toUpperCase() }); };
  const removeSilo = (id: number, code: string) => {
    if (window.confirm(`Retirer ${code} de la liste active ? L’historique de production et d’expédition restera conservé.`)) archiveSilo.mutate({ id });
  };
  const startRenameSilo = (id: number, code: string) => { setEditingSiloId(id); setEditingSiloCode(code); };
  const submitRenameSilo = (event: React.FormEvent, id: number) => {
    event.preventDefault();
    const trimmed = editingSiloCode.trim().toUpperCase();
    if (!trimmed) return;
    renameSilo.mutate({ id, code: trimmed });
  };
  const submitAdminCredentials = (event: React.FormEvent) => {
    event.preventDefault();
    if (adminNewPassword !== adminPasswordConfirmation) { toast.error("La confirmation ne correspond pas au nouveau mot de passe."); return; }
    changeAdminCredentials.mutate({ currentPassword: adminCurrentPassword, newUsername: adminUsername.trim(), newPassword: adminNewPassword });
  };

  return (
    <main className="settings-screen">
      <header className="settings-topbar">
        <button className="mobile-menu" onClick={openSidebar} aria-label="Ouvrir le menu"><Menu size={20} /></button>
        <Link href="/" className="settings-back"><ArrowLeft size={16} />Retour au tableau de bord</Link>
        <div className="settings-brand"><div className="settings-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div>
      </header>
      <section className="settings-page">
        <div className="settings-hero">
          <div><span className="settings-kicker"><Settings2 size={14} />Administration</span><h1>Paramètres de <em>production</em></h1><p>Gérez les articles et les pupitreurs proposés aux programmes journaliers. Ces réglages, comme toute saisie ou suppression, exigent la session administrateur.</p></div>
          <div className="settings-status"><ShieldCheck size={18} /><div><strong>Actions protégées</strong><span>Réservées à la session admin</span></div></div>
        </div>
        <div className="settings-grid">
          <article className="settings-card articles-card">
            <div className="settings-card-heading"><div className="settings-icon"><BookOpen size={19} /></div><div><span>Catalogue de saisie</span><h2>Liste des articles</h2></div></div>
            <p className="settings-copy">Les articles ajoutés ici sont proposés dans la saisie de production et dans le programme journalier. Retirer un article ne modifie jamais les données déjà enregistrées.</p>
            <form className="article-add-form" onSubmit={submitArticle}><label>Nouvel article<input value={articleCode} onChange={(event) => setArticleCode(event.target.value.toUpperCase())} placeholder="Ex. CM1" maxLength={64} required /></label><button type="submit" className="settings-primary" disabled={addArticle.isPending}><Plus size={16} />Ajouter</button></form>
            <div className="article-list" aria-live="polite">{articlesQuery.isLoading ? <span className="settings-empty">Chargement des articles…</span> : articlesQuery.data?.length ? articlesQuery.data.map((article) => <div className="article-list-row" key={article.id}><strong>{article.code}</strong><button type="button" onClick={() => removeArticle(article.id, article.code)} disabled={archiveArticle.isPending} aria-label={`Retirer ${article.code} de la liste`}><Trash2 size={15} />Retirer</button></div>) : <span className="settings-empty">Aucun article actif. Ajoutez le premier article à proposer lors de la saisie.</span>}</div>
          </article>

          <article className="settings-card operators-card">
            <div className="settings-card-heading"><div className="settings-icon security"><Users size={19} /></div><div><span>Planning journalier</span><h2>Liste des pupitreurs</h2></div></div>
            <p className="settings-copy">Les pupitreurs ajoutés ici peuvent être sélectionnés seuls ou à plusieurs pour le même programme journalier. Les programmes déjà enregistrés restent conservés.</p>
            <form className="article-add-form" onSubmit={submitOperator}><label>Nouveau pupitreur<input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} placeholder="Ex. Yosri" maxLength={128} required /></label><button type="submit" className="settings-primary" disabled={addOperator.isPending}><Plus size={16} />Ajouter</button></form>
            <div className="article-list" aria-live="polite">{operatorsQuery.isLoading ? <span className="settings-empty">Chargement des pupitreurs…</span> : operatorsQuery.data?.length ? operatorsQuery.data.map((operator) => <div className="article-list-row" key={operator.id}><strong>{operator.name}</strong><button type="button" onClick={() => removeOperator(operator.id, operator.name)} disabled={archiveOperator.isPending} aria-label={`Retirer ${operator.name} de la liste`}><Trash2 size={15} />Retirer</button></div>) : <span className="settings-empty">Aucun pupitreur actif. Ajoutez le premier nom à proposer dans les programmes.</span>}</div>
          </article>

          <article className="settings-card silos-card">
            <div className="settings-card-heading"><div className="settings-icon security"><Warehouse size={19} /></div><div><span>Produits finis</span><h2>Liste des silos</h2></div></div>
            <p className="settings-copy">Les silos ajoutés ici sont proposés dans la saisie de production, les expéditions et l’état des silos. Retirer un silo ne modifie jamais les mouvements déjà enregistrés ; le renommer met à jour son historique.</p>
            <form className="article-add-form" onSubmit={submitSilo}><label>Nouveau silo<input value={siloCode} onChange={(event) => setSiloCode(event.target.value.toUpperCase())} placeholder="Ex. SPF13" maxLength={16} required /></label><button type="submit" className="settings-primary" disabled={addSilo.isPending}><Plus size={16} />Ajouter</button></form>
            <div className="article-list" aria-live="polite">
              {silosQuery.isLoading ? <span className="settings-empty">Chargement des silos…</span> : silosQuery.data?.length ? silosQuery.data.map((silo) => (
                <div className="article-list-row" key={silo.id}>
                  {editingSiloId === silo.id ? (
                    <form className="silo-rename-form" onSubmit={(event) => submitRenameSilo(event, silo.id)}>
                      <input value={editingSiloCode} onChange={(event) => setEditingSiloCode(event.target.value.toUpperCase())} maxLength={16} autoFocus required />
                      <button type="submit" className="silo-rename-confirm" disabled={renameSilo.isPending} aria-label="Valider le renommage"><Check size={15} /></button>
                      <button type="button" className="silo-rename-cancel" onClick={() => setEditingSiloId(null)} aria-label="Annuler le renommage"><X size={15} /></button>
                    </form>
                  ) : (
                    <>
                      <strong>{silo.code}</strong>
                      <span className="article-list-actions">
                        <button type="button" onClick={() => startRenameSilo(silo.id, silo.code)} aria-label={`Renommer ${silo.code}`}><Pencil size={15} />Renommer</button>
                        <button type="button" onClick={() => removeSilo(silo.id, silo.code)} disabled={archiveSilo.isPending} aria-label={`Retirer ${silo.code} de la liste`}><Trash2 size={15} />Retirer</button>
                      </span>
                    </>
                  )}
                </div>
              )) : <span className="settings-empty">Aucun silo actif. Ajoutez le premier silo à proposer.</span>}
            </div>
          </article>

          <article className="settings-card admin-card">
            <div className="settings-card-heading"><div className="settings-icon security"><UserCog size={19} /></div><div><span>Accès administrateur</span><h2>Identifiants de connexion</h2></div></div>
            <p className="settings-copy">Ces identifiants ouvrent la session admin (page de connexion) qui donne accès à la saisie, aux imports et à cette page. Les visiteurs non connectés gardent un accès en lecture aux autres pages.</p>
            <form className="password-form" onSubmit={submitAdminCredentials}>
              <label>Mot de passe actuel<input type="password" value={adminCurrentPassword} onChange={(event) => setAdminCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
              <label>Identifiant<input value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" maxLength={64} required /></label>
              <label>Nouveau mot de passe<input type="password" value={adminNewPassword} onChange={(event) => setAdminNewPassword(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" required /></label>
              <label>Confirmer le nouveau mot de passe<input type="password" value={adminPasswordConfirmation} onChange={(event) => setAdminPasswordConfirmation(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" required /></label>
              <button type="submit" className="settings-primary" disabled={changeAdminCredentials.isPending}><UserCog size={16} />Mettre à jour les identifiants</button>
            </form>
            <p className="settings-security-note"><KeyRound size={14} />Par défaut : identifiant « admin », mot de passe « 123456 ». Changez-les dès que possible.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
