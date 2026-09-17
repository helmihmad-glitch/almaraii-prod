import { afterEach, describe, expect, it, vi } from "vitest";
import { getProductionSettings } from "./db";

// Reproduit le crash observé en production (FUNCTION_INVOCATION_FAILED sur
// auth.login) : une requête vers production_settings qui échoue (colonne
// manquante faute de migration appliquée, incident Postgres transitoire...)
// ne doit jamais remonter une exception non gérée jusqu'à la mutation
// appelante — elle doit dégrader vers "aucun réglage enregistré" (undefined),
// pour que login/changeAdminCredentials retombent sur admin/123456 plutôt que
// de faire planter toute la fonction serverless.
describe("getProductionSettings (résilience face à une base indisponible/désynchronisée)", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    errorSpy.mockClear();
  });

  it("renvoie undefined (au lieu de faire planter l’appelant) quand la requête échoue", async () => {
    // URL syntaxiquement valide mais qui ne peut aboutir à aucune requête
    // réelle : la connexion échoue à l'exécution de la requête, exactement
    // comme le ferait une erreur "column does not exist" sur la vraie base.
    process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/nonexistent";
    await expect(getProductionSettings()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  }, 15000);
});
