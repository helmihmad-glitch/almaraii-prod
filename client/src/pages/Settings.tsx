import { useState } from "react";
import { ArrowLeft, BookOpen, KeyRound, Plus, Settings2, ShieldCheck, Trash2, Users } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";

export default function Settings() {
  const utils = trpc.useUtils();
  const articlesQuery = trpc.settings.listArticles.useQuery();
  const operatorsQuery = trpc.settings.listOperators.useQuery();
  const [articleCode, setArticleCode] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [articlePassword, setArticlePassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

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
  const changePassword = trpc.settings.changeActionPassword.useMutation({
    onSuccess: () => { setCurrentPassword(""); setNewPassword(""); setPasswordConfirmation(""); setArticlePassword(""); toast.success("Mot de passe mis à jour", { description: "Les prochaines modifications et suppressions utiliseront ce nouveau mot de passe." }); },
    onError: (error) => toast.error(error.message || "Impossible de modifier le mot de passe."),
  });

  const requireManagementPassword = () => {
    if (!articlePassword) { toast.error("Saisissez le mot de passe de gestion pour modifier la liste."); return false; }
    return true;
  };
  const submitArticle = (event: React.FormEvent) => { event.preventDefault(); if (requireManagementPassword()) addArticle.mutate({ code: articleCode.trim().toUpperCase(), actionPassword: articlePassword }); };
  const submitOperator = (event: React.FormEvent) => { event.preventDefault(); if (requireManagementPassword()) addOperator.mutate({ name: operatorName.trim(), actionPassword: articlePassword }); };
  const removeArticle = (id: number, code: string) => {
    if (!requireManagementPassword()) return;
    if (window.confirm(`Retirer ${code} de la liste active ? L’historique de production restera conservé.`)) archiveArticle.mutate({ id, actionPassword: articlePassword });
  };
  const removeOperator = (id: number, name: string) => {
    if (!requireManagementPassword()) return;
    if (window.confirm(`Retirer ${name} de la liste active ? Les programmes déjà enregistrés resteront conservés.`)) archiveOperator.mutate({ id, actionPassword: articlePassword });
  };
  const submitPassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== passwordConfirmation) { toast.error("La confirmation ne correspond pas au nouveau mot de passe."); return; }
    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <main className="settings-screen">
      <header className="settings-topbar">
        <Link href="/" className="settings-back"><ArrowLeft size={16} />Retour au tableau de bord</Link>
        <div className="settings-brand"><div className="settings-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div>
      </header>
      <section className="settings-page">
        <div className="settings-hero">
          <div><span className="settings-kicker"><Settings2 size={14} />Administration</span><h1>Paramètres de <em>production</em></h1><p>Gérez les articles, les pupitreurs proposés aux programmes journaliers et le mot de passe exigé avant toute modification ou suppression.</p></div>
          <div className="settings-status"><ShieldCheck size={18} /><div><strong>Actions protégées</strong><span>Gestion locale sécurisée</span></div></div>
        </div>
        <div className="settings-grid">
          <article className="settings-card articles-card">
            <div className="settings-card-heading"><div className="settings-icon"><BookOpen size={19} /></div><div><span>Catalogue de saisie</span><h2>Liste des articles</h2></div></div>
            <p className="settings-copy">Les articles ajoutés ici sont proposés dans la saisie de production et dans le programme journalier. Retirer un article ne modifie jamais les données déjà enregistrées.</p>
            <form className="settings-password-strip" onSubmit={(event) => event.preventDefault()}><label>Mot de passe de gestion<input type="password" value={articlePassword} onChange={(event) => setArticlePassword(event.target.value)} placeholder="Mot de passe actuel" autoComplete="current-password" /></label></form>
            <form className="article-add-form" onSubmit={submitArticle}><label>Nouvel article<input value={articleCode} onChange={(event) => setArticleCode(event.target.value.toUpperCase())} placeholder="Ex. CM1" maxLength={64} required /></label><button type="submit" className="settings-primary" disabled={addArticle.isPending}><Plus size={16} />Ajouter</button></form>
            <div className="article-list" aria-live="polite">{articlesQuery.isLoading ? <span className="settings-empty">Chargement des articles…</span> : articlesQuery.data?.length ? articlesQuery.data.map((article) => <div className="article-list-row" key={article.id}><strong>{article.code}</strong><button type="button" onClick={() => removeArticle(article.id, article.code)} disabled={archiveArticle.isPending} aria-label={`Retirer ${article.code} de la liste`}><Trash2 size={15} />Retirer</button></div>) : <span className="settings-empty">Aucun article actif. Ajoutez le premier article à proposer lors de la saisie.</span>}</div>
          </article>

          <article className="settings-card operators-card">
            <div className="settings-card-heading"><div className="settings-icon security"><Users size={19} /></div><div><span>Planning journalier</span><h2>Liste des pupitreurs</h2></div></div>
            <p className="settings-copy">Les pupitreurs ajoutés ici peuvent être sélectionnés seuls ou à plusieurs pour le même programme journalier. Les programmes déjà enregistrés restent conservés.</p>
            <form className="settings-password-strip" onSubmit={(event) => event.preventDefault()}><label>Mot de passe de gestion<input type="password" value={articlePassword} onChange={(event) => setArticlePassword(event.target.value)} placeholder="Mot de passe actuel" autoComplete="current-password" /></label></form>
            <form className="article-add-form" onSubmit={submitOperator}><label>Nouveau pupitreur<input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} placeholder="Ex. Yosri" maxLength={128} required /></label><button type="submit" className="settings-primary" disabled={addOperator.isPending}><Plus size={16} />Ajouter</button></form>
            <div className="article-list" aria-live="polite">{operatorsQuery.isLoading ? <span className="settings-empty">Chargement des pupitreurs…</span> : operatorsQuery.data?.length ? operatorsQuery.data.map((operator) => <div className="article-list-row" key={operator.id}><strong>{operator.name}</strong><button type="button" onClick={() => removeOperator(operator.id, operator.name)} disabled={archiveOperator.isPending} aria-label={`Retirer ${operator.name} de la liste`}><Trash2 size={15} />Retirer</button></div>) : <span className="settings-empty">Aucun pupitreur actif. Ajoutez le premier nom à proposer dans les programmes.</span>}</div>
          </article>

          <article className="settings-card password-card">
            <div className="settings-card-heading"><div className="settings-icon security"><KeyRound size={19} /></div><div><span>Protection du registre</span><h2>Mot de passe d’action</h2></div></div>
            <p className="settings-copy">Ce mot de passe protège la modification et la suppression de lignes, ainsi que la gestion de cette page.</p>
            <form className="password-form" onSubmit={submitPassword}>
              <label>Mot de passe actuel<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
              <label>Nouveau mot de passe<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" required /></label>
              <label>Confirmer le nouveau mot de passe<input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" required /></label>
              <button type="submit" className="settings-primary" disabled={changePassword.isPending}><ShieldCheck size={16} />Mettre à jour le mot de passe</button>
            </form>
            <p className="settings-security-note"><KeyRound size={14} />Le mot de passe est vérifié côté serveur et enregistré sous forme hachée, jamais affiché.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
