import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/_core/app";

const app = createApp();

/**
 * Adaptateur Vercel : les requêtes /api/* sont traitées par Express/tRPC.
 * Les requêtes /manus-storage/* sont réécrites vers cette fonction et leur
 * préfixe /api est retiré pour conserver le chemin attendu par le proxy S3.
 */
export default function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  if (req.url?.startsWith("/api/manus-storage/")) {
    req.url = req.url.replace(/^\/api/, "");
  }
  return app(req as never, res as never);
}
