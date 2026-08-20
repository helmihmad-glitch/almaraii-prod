import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  const monthPicker = page.locator('input[type="month"]');
  await monthPicker.waitFor({ state: "visible", timeout: 15_000 });

  await monthPicker.fill("2025-01");
  await page.getByText("Aucune donnée disponible", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  const emptyCopy = await page.getByText("Le registre ne contient aucune production pour Janvier 2025.").isVisible();
  if (!emptyCopy) throw new Error("Le message de période sans données n’est pas affiché.");

  await monthPicker.fill("2026-08");
  await page.getByText("Aucune donnée disponible", { exact: true }).waitFor({ state: "hidden", timeout: 10_000 });
  const recordCount = await page.locator("tbody tr").count();
  if (recordCount === 0) throw new Error("La période avec données ne restaure pas le registre.");

  console.log(JSON.stringify({ monthPicker: "ok", noDataPeriod: "2025-01", restoredPeriod: "2026-08", recordCount }));
} finally {
  await browser.close();
}
