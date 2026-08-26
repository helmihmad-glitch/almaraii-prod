import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/_core/app";

const app = createApp();

/**
 * Point d’entrée Vercel stable. Les réécritures de vercel.json conservent le
 * chemin API demandé dans `__path`, puis ce handler le restitue à Express.
 */
export default function vercelApiHandler(req: IncomingMessage, res: ServerResponse) {
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
  return app(req as never, res as never);
}
