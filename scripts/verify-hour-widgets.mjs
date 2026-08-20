import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.getByText("Données disponibles", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });

  const productionCard = page.locator(".daily-production-card");
  const stopsCard = page.locator(".daily-stops-card");
  const hoursPanel = page.locator(".top-hours-panel");
  const monthlyHoursCard = page.locator(".metric-hours");
  await Promise.all([productionCard.waitFor(), stopsCard.waitFor(), hoursPanel.waitFor(), monthlyHoursCard.waitFor()]);
  if (!(await productionCard.getByText("Production J-1", { exact: true }).isVisible())) throw new Error("La carte Production J-1 est absente.");
  if (!(await productionCard.locator(".daily-article-list > div").count())) throw new Error("Les articles du dernier jour ne sont pas regroupés dans la carte J-1.");
  if (!(await stopsCard.getByText("Arrêts J-1", { exact: true }).isVisible())) throw new Error("La carte d’arrêts J-1 est absente.");
  if (!(await hoursPanel.locator(".recharts-wrapper").isVisible())) throw new Error("Le graphique quotidien des heures est absent.");
  if (!(await monthlyHoursCard.getByText("Temps total prod. (h) / Mois", { exact: true }).isVisible())) throw new Error("La carte mensuelle des heures est absente.");

  const monthPicker = page.locator('input[type="month"]');
  await monthPicker.fill("2025-01");
  await page.getByText("Aucune donnée disponible", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  if (!(await productionCard.getByText("Aucune production enregistrée pour cette période.", { exact: true }).isVisible())) throw new Error("La carte J-1 ne reflète pas la période vide.");

  console.log(JSON.stringify({ dailyCard: "ok", stopsCard: "ok", dailyHoursChart: "ok", monthlyHoursCard: "ok", emptyMonth: "ok" }));
} finally {
  await browser.close();
}
