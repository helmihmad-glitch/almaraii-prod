import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  const editButton = page.getByRole("button", { name: "Modifier la date et les valeurs" }).first();
  await editButton.waitFor({ state: "visible", timeout: 15_000 });
  await editButton.click();
  await page.getByRole("heading", { name: "Autoriser la modification" }).waitFor({ state: "visible" });
  const password = page.locator(".action-password-dialog input[type='password']");
  await password.fill("incorrect");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByText("Mot de passe incorrect.", { exact: true }).waitFor({ state: "visible" });
  await password.fill("123456");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("heading", { name: "Modifier la ligne" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Fermer" }).click();

  const deleteButton = page.getByRole("button", { name: "Supprimer la ligne" }).first();
  await deleteButton.click();
  await page.getByRole("heading", { name: "Confirmer la suppression" }).waitFor({ state: "visible" });
  if (!(await page.getByText("Saisissez le mot de passe pour supprimer cette ligne du registre.", { exact: true }).isVisible())) throw new Error("La confirmation de suppression ne demande pas le mot de passe.");
  await page.getByRole("button", { name: "Annuler" }).click();

  console.log(JSON.stringify({ editDialog: "ok", incorrectPasswordRejected: "ok", editAuthorized: "ok", deleteDialog: "ok" }));
} finally {
  await browser.close();
}
