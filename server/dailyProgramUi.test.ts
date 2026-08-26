import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
const dailyProgram = readFileSync(new URL("../client/src/pages/DailyProgram.tsx", import.meta.url), "utf8");
const dailyProgramData = readFileSync(new URL("../client/src/pages/DailyProgramData.tsx", import.meta.url), "utf8");

describe("Programme journalier", () => {
  it("déclare un stockage persistant pour les en-têtes et lignes planifiées", () => {
    expect(schema).toContain('mysqlTable("daily_programs"');
    expect(schema).toContain('mysqlTable("daily_program_lines"');
    expect(schema).toContain('uniqueIndex("daily_programs_date_unique")');
    expect(db).toContain("getDailyProgramByDate");
    expect(db).toContain("createDailyProgramLine");
  });

  it("expose les opérations CRUD protégées par le mot de passe d’action", () => {
    expect(routers).toContain("dailyProgram: router({");
    expect(routers).toContain("createLine:");
    expect(routers).toContain("updateLine:");
    expect(routers).toContain("deleteLine:");
    expect(routers).toContain("assertProductionActionAuthorized(input.actionPassword)");
  });

  it("propose les deux pages et les accès de navigation demandés", () => {
    expect(app).toContain('path="/programme-journalier"');
    expect(app).toContain('path="/programme-journalier-donnee"');
    expect(home).toContain("Programme journalier");
    expect(home).toContain("Programme journalier donnée");
    expect(home).not.toContain("Analyse des lignes");
    expect(dailyProgram).toContain('type="date"');
    expect(dailyProgram).toContain("Quantité (tonne)");
    expect(dailyProgramData).toContain("Créer le programme");
    expect(dailyProgramData).toContain("Ajouter la ligne");
  });
});
