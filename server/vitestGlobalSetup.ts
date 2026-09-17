import { existsSync, rmSync } from "node:fs";

// Exécuté une seule fois avant toute la suite (voir globalSetup dans
// vitest.config.ts). Les magasins de secours JSON utilisés par les tests en
// l'absence de DATABASE_URL (voir le branchement process.env.VITEST dans
// server/db.ts et server/siloDb.ts) sont écrits sur disque et persistent donc
// d'une exécution de `vitest run` à l'autre. Sans ce nettoyage, les lignes
// laissées par une exécution précédente faussent les tests qui supposent un
// magasin vide au démarrage (ex. décompte exact de lots ou d'expéditions
// créés) — d'où les échecs intermittents observés selon l'historique local.
const STALE_TEST_STORES = [".local-silo-store.test.json", ".local-production-store.test.json"];

export default function setup() {
  for (const file of STALE_TEST_STORES) {
    if (existsSync(file)) rmSync(file);
  }
}
