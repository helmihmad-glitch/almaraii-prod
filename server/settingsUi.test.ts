import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = readFileSync(fileURLToPath(new URL("../client/src/App.tsx", import.meta.url)), "utf8");
const homePage = readFileSync(fileURLToPath(new URL("../client/src/pages/Home.tsx", import.meta.url)), "utf8");
const settingsPage = readFileSync(fileURLToPath(new URL("../client/src/pages/Settings.tsx", import.meta.url)), "utf8");

describe("interface Paramètres", () => {
  it("enregistre et expose la page Paramètres depuis le routeur", () => {
    expect(app).toContain('path="/parametres"');
    expect(app).toContain("component={Settings}");
    expect(homePage).toContain('setLocation("/parametres")');
  });

  it("propose l’ajout et le retrait sécurisé des articles", () => {
    expect(settingsPage).toContain("trpc.settings.listArticles.useQuery");
    expect(settingsPage).toContain("trpc.settings.addArticle.useMutation");
    expect(settingsPage).toContain("trpc.settings.archiveArticle.useMutation");
    expect(settingsPage).toContain("Mot de passe de gestion");
    expect(settingsPage).toContain("L’historique de production restera conservé");
  });

  it("propose la mise à jour protégée du mot de passe d’action", () => {
    expect(settingsPage).toContain("trpc.settings.changeActionPassword.useMutation");
    expect(settingsPage).toContain("Mot de passe actuel");
    expect(settingsPage).toContain("Confirmer le nouveau mot de passe");
    expect(settingsPage).toContain("enregistré sous forme hachée");
  });

  it("récupère les articles configurés à l’ouverture de la saisie", () => {
    expect(homePage).toContain("trpc.settings.listArticles.useQuery");
    expect(homePage).toContain("production-article-options");
  });
});
