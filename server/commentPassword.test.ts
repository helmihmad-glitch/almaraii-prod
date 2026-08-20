import { describe, expect, it } from "vitest";
import { appRouter, assertProductionActionAuthorized } from "./routers";

describe("production.verifyActionPassword", () => {
  it("valide le mot de passe d’action fourni dans l’environnement via la procédure API", async () => {
    const caller = appRouter.createCaller({} as any);
    const accepted = await caller.production.verifyActionPassword({ password: "123456" });
    const refused = await caller.production.verifyActionPassword({ password: "incorrect" });

    expect(accepted).toEqual({ authorized: true });
    expect(refused).toEqual({ authorized: false });
  });

  it("refuse côté serveur toute modification ou suppression sans le mot de passe valide", () => {
    expect(() => assertProductionActionAuthorized("incorrect")).toThrow("Le mot de passe est requis");
    expect(() => assertProductionActionAuthorized("123456")).not.toThrow();
  });
});
