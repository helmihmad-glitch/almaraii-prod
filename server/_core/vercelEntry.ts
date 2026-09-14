import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./app";

const app = createApp();

function sendStartupError(res: ServerResponse, error: unknown) {
  const message = error instanceof Error ? error.message : "Initialisation de l’API impossible.";
  console.error("[Vercel API] Initialisation échouée", error);
  if (res.headersSent) return;
  res.statusCode = 500;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify([{
    error: {
      json: {
        message: `Erreur interne de l’API : ${message}`,
        code: -32603,
        data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
      },
    },
  }]));
}

/**
 * Point d’entrée Vercel stable. Ce fichier est bundlé par esbuild (voir le
 * script `build`) en `api/index.js`, un unique fichier autonome sans import
 * relatif restant à résoudre à l’exécution : Vercel n’a donc plus besoin de
 * retrouver `server/_core/app.ts` sur le disque de la fonction, ce qui
 * provoquait une erreur `ERR_MODULE_NOT_FOUND` au démarrage.
 *
 * Les réécritures de vercel.json conservent le chemin API demandé dans
 * `__path`, puis ce handler le restitue à Express.
 */
export default function vercelApiHandler(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  const routedPath = requestUrl.searchParams.get("__path");
  if (routedPath) {
    requestUrl.searchParams.delete("__path");
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${routedPath}${query ? `?${query}` : ""}`;
  }
  if (req.url?.startsWith("/api/local-storage/")) {
    req.url = req.url.replace(/^\/api/, "");
  }
  try {
    return app(req as never, res as never);
  } catch (error) {
    return sendStartupError(res, error);
  }
}
