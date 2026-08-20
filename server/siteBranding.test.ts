import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("configuration de marque publiée", () => {
  it("expose le nom Almaraii Prod à l’application", () => {
    expect(process.env.VITE_APP_TITLE).toBe("Almaraii Prod");
  });

  it("déclare le nom et le logo dans la page publiée", () => {
    const indexHtml = readFileSync(fileURLToPath(new URL("../client/index.html", import.meta.url)), "utf8");
    expect(indexHtml).toContain("<title>Almaraii Prod</title>");
    expect(indexHtml).toContain('rel="icon"');
    expect(indexHtml).toContain("almaraai-corn-logo_37c73384.png");
  });
});
