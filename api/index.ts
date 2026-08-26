import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";

let appPromise: Promise<Express> | undefined;

async function getApp() {
  appPromise ??= import("../server/_core/app").then(({ createApp }) => createApp());
  return appPromise;
}

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
 * Point d’entrée Vercel stable. Les réécritures de vercel.json conservent le
 * chemin API demandé dans `__path`, puis ce handler le restitue à Express.
 */
export default async function vercelApiHandler(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  const routedPath = requestUrl.searchParams.get("__path");
  if (routedPath) {
    requestUrl.searchParams.delete("__path");
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${routedPath}${query ? `?${query}` : ""}`;
  }
  if (req.url?.startsWith("/api/manus-storage/")) {
    req.url = req.url.replace(/^\/api/, "");
  }
  try {
    const app = await getApp();
    return app(req as never, res as never);
  } catch (error) {
    return sendStartupError(res, error);
  }
}
