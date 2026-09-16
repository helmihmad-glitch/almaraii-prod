// Connexion admin : la navigation reste libre en visiteur (voir AppShell et
// AdminRoute dans App.tsx), cette page ne fait qu’ouvrir la session qui
// débloque la saisie, les imports et les paramètres.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, Menu, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";

export default function Login() {
  const { openSidebar } = useSidebar();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const meQuery = trpc.auth.me.useQuery();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Un admin déjà connecté qui revient sur /connexion repart directement au tableau de bord.
  useEffect(() => {
    if (meQuery.data?.role === "admin") setLocation("/");
  }, [meQuery.data, setLocation]);

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Connexion réussie");
      setLocation("/");
    },
    onError: (error) => toast.error(error.message || "Identifiant ou mot de passe incorrect."),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ username: username.trim(), password });
  };

  return (
    <main className="settings-screen">
      <header className="settings-topbar">
        <button className="mobile-menu" onClick={openSidebar} aria-label="Ouvrir le menu"><Menu size={20} /></button>
        <Link href="/" className="settings-back"><ArrowLeft size={16} />Retour au tableau de bord</Link>
        <div className="settings-brand"><div className="settings-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div>
      </header>
      <section className="login-page">
        <form className="settings-card login-card" onSubmit={submit}>
          <div className="settings-card-heading"><div className="settings-icon security"><ShieldCheck size={19} /></div><div><span>Espace administrateur</span><h2>Connexion</h2></div></div>
          <p className="settings-copy">Connectez-vous pour saisir la production, gérer les expéditions, importer des classeurs et modifier les paramètres.</p>
          <div className="password-form">
            <label>Identifiant<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required /></label>
            <label>Mot de passe
              <div className="password-field">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} tabIndex={-1} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <button type="submit" className="settings-primary" disabled={login.isPending}><LogIn size={16} />Se connecter</button>
          </div>
          <p className="settings-security-note"><KeyRound size={14} />La navigation reste libre sans connexion : elle ne donne accès qu’aux pages de saisie, d’import et de gestion.</p>
        </form>
      </section>
    </main>
  );
}
