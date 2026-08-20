import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.getByText("Données disponibles", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });

  const productionCard = page.locator(".daily-production-card");
  const hoursPanel = page.locator(".top-hours-panel");
  const monthlyHoursCard = page.locator(".metric-hours");
  await Promise.all([productionCard.waitFor(), hoursPanel.waitFor(), monthlyHoursCard.waitFor()]);
  if (!(await productionCard.getByText("Production J-1", { exact: true }).isVisible())) throw new Error("La carte Production J-1 est absente.");
  const j1Text = await productionCard.textContent();
  if (!j1Text?.includes("Production du") && !j1Text?.includes("Aucune production enregistrée le")) throw new Error("La carte J-1 ne cible pas explicitement la date d’hier.");
  if (await page.locator(".daily-stops-card").count()) throw new Error("La seconde carte Arrêts J-1 doit être retirée.");
  if (!(await hoursPanel.locator(".recharts-wrapper").isVisible())) throw new Error("Le graphique quotidien des heures est absent.");
  if (!(await monthlyHoursCard.getByText("Temps total prod. (h) / Mois", { exact: true }).isVisible())) throw new Error("La carte mensuelle des heures est absente.");

  const monthPicker = page.locator('input[type="month"]');
  await monthPicker.fill("2025-01");
  await page.getByText("Aucune donnée disponible", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  if ((await productionCard.textContent()) !== j1Text) throw new Error("La carte J-1 ne doit pas dépendre du mois sélectionné, mais de la date d’hier.");

  console.log(JSON.stringify({ j1Yesterday: "ok", secondCardRemoved: "ok", dailyHoursChart: "ok", monthlyHoursCard: "ok", emptyMonth: "ok" }));
} finally {
  await browser.close();
}
