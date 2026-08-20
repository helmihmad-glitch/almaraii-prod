import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.addInitScript(() => {
  const fixedNow = new Date("2026-08-20T12:00:00").valueOf();
  const NativeDate = Date;
  class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
  }
  window.Date = FixedDate;
});

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  const editCommentButton = page.getByRole("button", { name: /Modifier le commentaire de/ }).first();
  await editCommentButton.waitFor({ state: "visible", timeout: 15_000 });
  const firstCommentText = (await page.locator(".daily-comment-row").first().locator("p").textContent())?.trim() ?? "";
  const originalComment = firstCommentText === "Aucun commentaire renseigné." || firstCommentText === "Validation temporaire du commentaire J-1" ? "" : firstCommentText;
  await editCommentButton.click();
  await page.getByRole("heading", { name: "Autoriser la modification du commentaire" }).waitFor({ state: "visible" });
  const commentPassword = page.locator(".action-password-dialog input[type='password']");
  await commentPassword.fill("incorrect");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByText("Mot de passe incorrect.", { exact: true }).waitFor({ state: "visible" });
  await commentPassword.fill("123456");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("heading", { name: "Modifier le commentaire" }).waitFor({ state: "visible" });
  const commentEditor = page.locator(".comment-edit-dialog textarea");
  await commentEditor.waitFor({ state: "visible" });
  await commentEditor.fill("Validation temporaire du commentaire J-1");
  await page.getByRole("button", { name: "Enregistrer le commentaire" }).click();
  await page.waitForFunction((expected) => document.querySelector(".daily-comment-row p")?.textContent?.trim() === expected, "Validation temporaire du commentaire J-1");

  await page.getByRole("button", { name: /Modifier le commentaire de/ }).first().click();
  await page.getByRole("heading", { name: "Autoriser la modification du commentaire" }).waitFor({ state: "visible" });
  await page.locator(".action-password-dialog input[type='password']").fill("123456");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("heading", { name: "Modifier le commentaire" }).waitFor({ state: "visible" });
  await page.locator(".comment-edit-dialog textarea").fill(originalComment);
  await page.getByRole("button", { name: "Enregistrer le commentaire" }).click();
  const expectedRestoredComment = originalComment || "Aucun commentaire renseigné.";
  await page.waitForFunction((expected) => document.querySelector(".daily-comment-row p")?.textContent?.trim() === expected, expectedRestoredComment);

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

  console.log(JSON.stringify({ j1CommentDialog: "ok", j1CommentIncorrectPasswordRejected: "ok", j1CommentAuthorized: "ok", j1CommentSavedAndRestored: "ok", editDialog: "ok", incorrectPasswordRejected: "ok", editAuthorized: "ok", deleteDialog: "ok" }));
} finally {
  await browser.close();
}
