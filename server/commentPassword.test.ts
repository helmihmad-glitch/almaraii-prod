import { describe, expect, it } from "vitest";
import { appRouter, assertProductionActionAuthorized } from "./routers";

describe("production.verifyActionPassword", () => {
  it("refuse un mot de passe vide via la procédure API", async () => {
    const caller = appRouter.createCaller({} as any);
    const refused = await caller.production.verifyActionPassword({ password: "" });

    expect(refused).toEqual({ authorized: false });
  });

  it("autorise l’initialisation côté serveur lorsqu’aucun mot de passe d’action n’est encore configuré", async () => {
    await expect(assertProductionActionAuthorized(undefined)).resolves.toBeUndefined();
  });
});
