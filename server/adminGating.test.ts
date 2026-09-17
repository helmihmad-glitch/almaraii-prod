import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

// Vérifie que la session admin (et non plus un mot de passe par action) protège
// désormais les mutations : un échantillon représentatif de chaque routeur
// suffit, la logique de garde (assertAdminSession) étant partagée par toutes.
function createContext(isAdmin: boolean) {
  return {
    req: { protocol: "https", headers: {} },
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
    user: null,
    isAdmin,
  } as any;
}

describe("mutations réservées à la session admin (sans mot de passe par action)", () => {
  it("settings.addArticle refuse un visiteur et accepte un admin", async () => {
    await expect(appRouter.createCaller(createContext(false)).settings.addArticle({ code: "GATE-TEST-A" })).rejects.toThrow(/administrateur/i);
    await expect(appRouter.createCaller(createContext(true)).settings.addArticle({ code: "GATE-TEST-A" })).resolves.toMatchObject({ code: "GATE-TEST-A" });
  });

  it("dailyProgram.create refuse un visiteur et accepte un admin", async () => {
    await expect(appRouter.createCaller(createContext(false)).dailyProgram.create({ programDate: "2026-01-15", operatorName: "Test" })).rejects.toThrow(/administrateur/i);
    await expect(appRouter.createCaller(createContext(true)).dailyProgram.create({ programDate: "2026-01-15", operatorName: "Test" })).resolves.toMatchObject({ programDate: "2026-01-15" });
  });

  it("silo.createEntry refuse un visiteur et accepte un admin", async () => {
    const payload = { article: "GATE-TEST-B", allocations: [{ silo: "SPF1" as const, quantity: 5 }] };
    await expect(appRouter.createCaller(createContext(false)).silo.createEntry(payload)).rejects.toThrow(/administrateur/i);
    await expect(appRouter.createCaller(createContext(true)).silo.createEntry(payload)).resolves.toMatchObject({ article: "GATE-TEST-B" });
  });

  it("silo.setLotDepletion refuse un visiteur et accepte un admin", async () => {
    const created = await appRouter.createCaller(createContext(true)).silo.createEntry({ article: "GATE-TEST-D", allocations: [{ silo: "SPF2" as const, quantity: 5 }] });
    const payload = { entryId: created.id, silo: "SPF2" as const, manuallyDepleted: true };
    await expect(appRouter.createCaller(createContext(false)).silo.setLotDepletion(payload)).rejects.toThrow(/administrateur/i);
    await expect(appRouter.createCaller(createContext(true)).silo.setLotDepletion(payload)).resolves.toMatchObject({ manuallyDepleted: true });
  });

  it("production.create refuse désormais un visiteur (avant : accessible sans protection) et accepte un admin", async () => {
    const payload = { productionDate: "2026-01-15", article: "GATE-TEST-C", totalProductionHours: 8, plannedStopsHours: 0, unplannedStopsHours: 0, productionTons: 10, wasteTons: 0, standardRate: 1 };
    await expect(appRouter.createCaller(createContext(false)).production.create(payload)).rejects.toThrow(/administrateur/i);
    await expect(appRouter.createCaller(createContext(true)).production.create(payload)).resolves.toMatchObject({ article: "GATE-TEST-C" });
  });

  it("les requêtes de lecture restent publiques (visiteur inclus)", async () => {
    const caller = appRouter.createCaller(createContext(false));
    await expect(caller.production.list()).resolves.toBeDefined();
    await expect(caller.dailyProgram.list()).resolves.toBeDefined();
    await expect(caller.silo.state()).resolves.toBeDefined();
    await expect(caller.settings.listArticles()).resolves.toBeDefined();
  });
});
