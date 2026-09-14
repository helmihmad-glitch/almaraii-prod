import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const vercelConfig = readFileSync(`${root}vercel.json`, "utf8");
const packageJson = readFileSync(`${root}package.json`, "utf8");
const vercelApiEntry = readFileSync(`${root}server/_core/vercelEntry.ts`, "utf8");
const appFactory = readFileSync(`${root}server/_core/app.ts`, "utf8");
const serverSources = [
  readFileSync(`${root}server/routers.ts`, "utf8"),
  readFileSync(`${root}server/_core/trpc.ts`, "utf8"),
].join("\n");

describe("configuration de déploiement Vercel", () => {
  it("sert le frontend Vite compilé plutôt que le bundle serveur", () => {
    expect(vercelConfig).toContain('"outputDirectory": "dist/public"');
    expect(vercelConfig).toContain('"buildCommand": "pnpm build"');
    expect(vercelConfig).not.toContain('"outputDirectory": "dist"');
  });

  it("préserve les routes tRPC et le proxy de stockage derrière une fonction Express", () => {
    expect(vercelApiEntry).toContain('import { createApp } from "./app"');
    expect(vercelApiEntry).toContain("const app = createApp()");
    expect(vercelApiEntry).toContain("__path");
    expect(vercelApiEntry).toContain("application/json; charset=utf-8");
    expect(vercelApiEntry).toContain("INTERNAL_SERVER_ERROR");
    expect(appFactory).toContain('"/api/trpc"');
    expect(appFactory).toContain("registerStorageProxy");
    expect(vercelConfig).toContain('"api/index.js"');
    expect(vercelConfig).not.toContain("includeFiles");
    expect(vercelConfig).toContain('"source": "/api/:path*"');
    expect(vercelConfig).toContain('"destination": "/api/index?__path=:path*"');
    expect(vercelConfig).toContain('"destination": "/api/index?__path=local-storage/:path*"');
    expect(vercelConfig).toContain('"source": "/:path((?!api/|local-storage/).*)"');
    expect(vercelConfig).not.toContain('"source": "/api/(.*)"');
  });

  it("bundle la fonction Vercel avec esbuild pour éviter toute résolution de module à l’exécution", () => {
    expect(packageJson).toContain("esbuild server/_core/vercelEntry.ts");
    expect(packageJson).toContain("--outfile=api/index.js");
    expect(packageJson).toContain("--packages=external");
  });

  it("utilise des imports relatifs exécutables par la fonction Node Vercel", () => {
    expect(serverSources).not.toContain('from "@shared/');
    expect(serverSources).not.toContain('from \'@shared/');
    expect(serverSources).not.toContain('from "server/');
  });
});
