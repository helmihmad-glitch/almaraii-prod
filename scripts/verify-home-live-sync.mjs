import { chromium } from "playwright";

const APP_URL = "http://localhost:3000/";
const TEST_ARTICLE = "LIVE-UI";
const TEST_DATE = "2026-07-21";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toNumber(value) {
  const match = value.match(/[\d\s\u202f.,]+/);
  if (!match) throw new Error(`Valeur numérique introuvable dans « ${value} »`);
  return Number(match[0].replace(/[\s\u202f.]/g, "").replace(",", "."));
}

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function heroProduction() {
  return toNumber(await page.locator(".hero-number-row h2").innerText());
}

async function waitForHeroProduction(expected) {
  await page.waitForFunction((target) => {
    const text = document.querySelector(".hero-number-row h2")?.textContent ?? "";
    const match = text.match(/[\d\s\u202f.,]+/);
    if (!match) return false;
    const value = Number(match[0].replace(/[\s\u202f.]/g, "").replace(",", "."));
    return Math.abs(value - target) < 0.01;
  }, expected, { timeout: 3_000 });
}

async function removeTestRowIfPresent() {
  const row = page.locator("tr", { hasText: TEST_ARTICLE });
  if (await row.count()) {
    await row.first().getByRole("button", { name: "Supprimer la ligne" }).click();
    await row.first().waitFor({ state: "detached", timeout: 15_000 });
  }
}

async function deletePersistedTestRows() {
  const listResponse = await fetch("http://localhost:3000/api/trpc/production.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D");
  const rows = (await listResponse.json())[0].result.data.json;
  for (const row of rows.filter((item) => item.article === TEST_ARTICLE)) {
    await fetch("http://localhost:3000/api/trpc/production.delete?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: { id: row.id } } }) });
  }
}

try {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await removeTestRowIfPresent();
  await deletePersistedTestRows();
  await page.reload({ waitUntil: "networkidle" });

  const initial = await heroProduction();
  const formInputs = () => page.locator(".entry-modal form input");

  await page.locator(".add-entry-button").click();
  await formInputs().nth(0).fill(TEST_DATE);
  await formInputs().nth(1).fill(TEST_ARTICLE);
  await formInputs().nth(2).fill("2");
  await formInputs().nth(3).fill("0");
  await formInputs().nth(4).fill("0");
  await formInputs().nth(5).fill("5");
  await formInputs().nth(6).fill("0");
  await formInputs().nth(7).fill("5");
  await page.getByRole("button", { name: "Enregistrer la saisie" }).click();
  await waitForHeroProduction(initial + 5);
  await page.locator("tr", { hasText: TEST_ARTICLE }).waitFor({ state: "visible", timeout: 15_000 });

  const row = page.locator("tr", { hasText: TEST_ARTICLE }).first();
  await row.getByRole("button", { name: "Modifier la date et les valeurs" }).first().click();
  await formInputs().nth(5).fill("7");
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await waitForHeroProduction(initial + 7);
  await page.locator("tr", { hasText: TEST_ARTICLE }).waitFor({ state: "visible", timeout: 15_000 });

  await page.locator("tr", { hasText: TEST_ARTICLE }).first().getByRole("button", { name: "Supprimer la ligne" }).click();
  await waitForHeroProduction(initial);
  await page.locator("tr", { hasText: TEST_ARTICLE }).waitFor({ state: "detached", timeout: 15_000 });
  assert(Math.abs((await heroProduction()) - initial) < 0.01, "Le total mensuel final ne correspond pas au total initial.");

  console.log(JSON.stringify({ homeLiveSync: "ok", initialProduction: initial, finalProduction: await heroProduction() }));
} finally {
  await deletePersistedTestRows();
  await browser.close();
}
