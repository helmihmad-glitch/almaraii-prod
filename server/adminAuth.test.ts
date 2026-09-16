import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { ADMIN_SESSION_COOKIE } from "./_core/adminSession";

function createContext(isAdmin: boolean) {
  return {
    req: { protocol: "https", headers: {} },
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
    user: null,
    isAdmin,
  } as any;
}

describe("auth (admin/visiteur)", () => {
  it("me renvoie le rôle (et l’identifiant courant pour un admin) correspondant à la session en cours", async () => {
    await expect(appRouter.createCaller(createContext(false)).auth.me()).resolves.toEqual({ role: "visiteur", username: null });
    await expect(appRouter.createCaller(createContext(true)).auth.me()).resolves.toEqual({ role: "admin", username: "admin" });
  });

  it("login accepte admin/123456 par défaut et pose un cookie de session signé", async () => {
    const ctx = createContext(false);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.login({ username: "admin", password: "123456" })).resolves.toEqual({ success: true });

    expect(ctx.res.cookie).toHaveBeenCalledTimes(1);
    const [cookieName, token, options] = ctx.res.cookie.mock.calls[0];
    expect(cookieName).toBe(ADMIN_SESSION_COOKIE);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
    expect(options).toMatchObject({ httpOnly: true, path: "/" });
  });

  it("login refuse un identifiant ou un mot de passe incorrect", async () => {
    const caller = appRouter.createCaller(createContext(false));
    await expect(caller.auth.login({ username: "admin", password: "mauvais-mdp" })).rejects.toThrow(/incorrect/i);
    await expect(caller.auth.login({ username: "autre", password: "123456" })).rejects.toThrow(/incorrect/i);
  });

  it("logout efface le cookie de session", async () => {
    const ctx = createContext(true);
    await expect(appRouter.createCaller(ctx).auth.logout()).resolves.toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalledWith(ADMIN_SESSION_COOKIE, expect.objectContaining({ httpOnly: true }));
  });

  it("changeAdminCredentials est refusé sans session admin en cours", async () => {
    const caller = appRouter.createCaller(createContext(false));
    await expect(caller.auth.changeAdminCredentials({ currentPassword: "123456", newUsername: "admin", newPassword: "abcdef" })).rejects.toThrow(/administrateur/i);
  });

  it("changeAdminCredentials refuse un mauvais mot de passe actuel", async () => {
    const caller = appRouter.createCaller(createContext(true));
    await expect(caller.auth.changeAdminCredentials({ currentPassword: "faux-mdp", newUsername: "admin", newPassword: "abcdef" })).rejects.toThrow(/incorrect/i);
  });

  it("changeAdminCredentials met à jour les identifiants, qui remplacent alors les valeurs par défaut", async () => {
    const adminCaller = appRouter.createCaller(createContext(true));
    await expect(adminCaller.auth.changeAdminCredentials({ currentPassword: "123456", newUsername: "chef-prod", newPassword: "motDePasse2026" })).resolves.toEqual({ success: true });

    const anotherCaller = appRouter.createCaller(createContext(false));
    await expect(anotherCaller.auth.login({ username: "admin", password: "123456" })).rejects.toThrow(/incorrect/i);
    await expect(anotherCaller.auth.login({ username: "chef-prod", password: "motDePasse2026" })).resolves.toEqual({ success: true });
  });
});
