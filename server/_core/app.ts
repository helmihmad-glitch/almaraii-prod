import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerBlobUploadRoute } from "./blobUpload";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";

/**
 * Construit l’application HTTP sans l’écouter sur un port.
 * Le serveur local et la fonction Vercel réutilisent cette même instance.
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerBlobUploadRoute(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ path, error }) {
        console.error(`[tRPC] ${path ?? "<unknown>"} failed:`, error);
      },
    })
  );
  return app;
}
