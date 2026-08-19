import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function visibleDatesFor(monthKey) {
  await page.locator('select[aria-label="Choisir un mois"]').selectOption(monthKey);
  await page.waitForFunction((key) => document.querySelector('select[aria-label="Choisir un mois"]')?.value === key, monthKey);
  const expectedFragment = monthKey === "juillet-2026" ? "juil" : "août";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const dates = await page.locator("tbody tr .date-cell").allInnerTexts();
    if (dates.length > 0 && dates.every((date) => date.toLowerCase().includes(expectedFragment))) return dates;
    await page.waitForTimeout(250);
  }
  const currentDates = await page.locator("tbody tr .date-cell").allInnerTexts();
  const currentRows = await page.locator("tbody tr").allInnerTexts();
  console.error(JSON.stringify({ monthKey, selectedKey: await page.locator('select[aria-label="Choisir un mois"]').inputValue(), currentRows }, null, 2));
  throw new Error(`Les lignes de ${monthKey} ne sont pas isolées : ${currentDates.join(", ")}`);
}

try {
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  const julyDates = await visibleDatesFor("juillet-2026");
  const augustDates = await visibleDatesFor("aout2026");

  if (!julyDates.length || !augustDates.length) throw new Error("Une période ne contient aucune ligne affichée.");
  if (!julyDates.every((date) => date.toLowerCase().includes("juil"))) throw new Error(`La vue juillet contient une date hors période : ${julyDates.join(", ")}`);
  if (!augustDates.every((date) => date.toLowerCase().includes("août"))) throw new Error(`La vue août contient une date hors période : ${augustDates.join(", ")}`);

  console.log(JSON.stringify({ monthIsolation: "ok", julyRows: julyDates.length, augustRows: augustDates.length }));
} finally {
  await browser.close();
}
