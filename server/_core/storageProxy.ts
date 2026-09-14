import express, { type Express } from "express";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const localStorageRoot = path.resolve(process.cwd(), ".local-storage");

function localStorageFilePath(key: string) {
  return path.resolve(localStorageRoot, key.replace(/^\/+/, ""));
}

/**
 * Stockage local de secours pour le développement : sert de disque de
 * substitution quand Vercel Blob n’est pas configuré (voir server/storage.ts).
 * Ne fonctionne qu’en local — le système de fichiers d’une fonction Vercel
 * est en lecture seule.
 */
export function registerStorageProxy(app: Express) {
  app.put("/local-storage/*", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    try {
      const filePath = localStorageFilePath(key);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, Buffer.from(req.body ?? []));
      res.status(200).send("OK");
    } catch (error) {
      console.error("[StorageProxy] local upload failed:", error);
      res.status(500).send("Storage upload failed");
    }
  });

  app.get("/local-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    const filePath = localStorageFilePath(key);
    if (!existsSync(filePath)) {
      res.status(404).send("Storage file not found");
      return;
    }

    try {
      res.set("Cache-Control", "no-store");
      res.sendFile(filePath);
    } catch (error) {
      console.error("[StorageProxy] local serve failed:", error);
      res.status(500).send("Storage serve failed");
    }
  });
}
