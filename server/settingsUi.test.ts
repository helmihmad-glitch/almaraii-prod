import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = readFileSync(fileURLToPath(new URL("../client/src/App.tsx", import.meta.url)), "utf8");
const homePage = readFileSync(fileURLToPath(new URL("../client/src/pages/Home.tsx", import.meta.url)), "utf8");
// L’accès aux Paramètres passe par le rail de navigation commun.
const appShell = readFileSync(fileURLToPath(new URL("../client/src/components/AppShell.tsx", import.meta.url)), "utf8");
const settingsPage = readFileSync(fileURLToPath(new URL("../client/src/pages/Settings.tsx", import.meta.url)), "utf8");

describe("interface Paramètres", () => {
  it("enregistre et expose la page Paramètres depuis le routeur, réservée à la session admin", () => {
    expect(app).toContain('path="/parametres"');
    expect(app).toContain("<AdminRoute><Settings /></AdminRoute>");
    expect(appShell).toContain('navigate("/parametres")');
  });

  it("propose l’ajout et le retrait des articles, réservés à la session admin (pas de mot de passe par action)", () => {
    expect(settingsPage).toContain("trpc.settings.listArticles.useQuery");
    expect(settingsPage).toContain("trpc.settings.addArticle.useMutation");
    expect(settingsPage).toContain("trpc.settings.archiveArticle.useMutation");
    expect(settingsPage).not.toContain("Mot de passe de gestion");
    expect(settingsPage).not.toContain("actionPassword");
    expect(settingsPage).toContain("L’historique de production restera conservé");
  });

  it("propose la mise à jour protégée des identifiants admin (identifiant + mot de passe)", () => {
    expect(settingsPage).toContain("trpc.auth.changeAdminCredentials.useMutation");
    expect(settingsPage).not.toContain("trpc.settings.changeActionPassword");
    expect(settingsPage).toContain("Mot de passe actuel");
    expect(settingsPage).toContain("Confirmer le nouveau mot de passe");
    expect(settingsPage).toContain("Identifiant");
    expect(settingsPage).toContain("« admin »");
  });

  it("récupère les articles configurés à l’ouverture de la saisie", () => {
    expect(homePage).toContain("trpc.settings.listArticles.useQuery");
    expect(homePage).toContain("production-article-options");
  });
});
