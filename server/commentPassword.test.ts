import { describe, expect, it } from "vitest";
import { appRouter, assertCommentWriteAuthorized } from "./routers";

describe("production.verifyCommentPassword", () => {
  it("valide le mot de passe de commentaire fourni dans l’environnement via la procédure API", async () => {
    const caller = appRouter.createCaller({} as any);
    const accepted = await caller.production.verifyCommentPassword({ password: "123456" });
    const refused = await caller.production.verifyCommentPassword({ password: "incorrect" });

    expect(accepted).toEqual({ authorized: true });
    expect(refused).toEqual({ authorized: false });
  });

  it("refuse côté serveur tout changement de commentaire sans le mot de passe valide", () => {
    expect(() => assertCommentWriteAuthorized("incorrect")).toThrow("Le mot de passe est requis");
    expect(() => assertCommentWriteAuthorized("123456")).not.toThrow();
  });
});
