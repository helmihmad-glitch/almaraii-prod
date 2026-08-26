import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("configuration de marque publiée", () => {
  it("expose le nom Almaraii Prod à l’application", () => {
    expect(process.env.VITE_APP_TITLE).toBe("Almaraii Prod");
    expect(process.env.VITE_APP_LOGO).toBe("/manus-storage/almaraii-logo-favicon_964405f8.png");
  });

  it("déclare le nom et l’icône de plateforme dans la page publiée", () => {
    const indexHtml = readFileSync(fileURLToPath(new URL("../client/index.html", import.meta.url)), "utf8");
    expect(indexHtml).toContain("<title>Almaraii Prod</title>");
    expect(indexHtml).toContain('rel="icon"');
    expect(indexHtml).toContain("almaraii-logo-favicon_964405f8.png");
    expect(indexHtml).toContain("https://dashprod-fdptenze.manus.space/manus-storage/");
  });
});
