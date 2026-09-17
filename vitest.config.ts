import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // Plusieurs fichiers de test partagent le même magasin de secours JSON sur
    // disque (.local-*-store.test.json, utilisé en l'absence de DATABASE_URL) :
    // exécutés en parallèle, leurs lectures-écritures concurrentes sur ce même
    // fichier se corrompent l'une l'autre (doublons, lignes perdues). On
    // désactive donc le parallélisme entre fichiers, qui n'apporte de toute
    // façon rien vu la rapidité de cette suite.
    fileParallelism: false,
    // Repart d'un magasin vide à chaque exécution de `vitest run` (voir ce
    // fichier) : sans cela, les lignes laissées par une exécution précédente
    // persistent sur disque et faussent les tests suivants.
    globalSetup: [path.resolve(templateRoot, "server/vitestGlobalSetup.ts")],
  },
});
