import { describe, expect, it } from "vitest";
import { appRouter, assertProductionActionAuthorized } from "./routers";

describe("production.verifyActionPassword", () => {
  it("refuse un mot de passe vide via la procédure API", async () => {
    const caller = appRouter.createCaller({} as any);
    const refused = await caller.production.verifyActionPassword({ password: "" });

    expect(refused).toEqual({ authorized: false });
  });

  it("refuse côté serveur toute modification ou suppression sans mot de passe", async () => {
    await expect(assertProductionActionAuthorized(undefined)).rejects.toThrow("Le mot de passe est requis");
  });
});
