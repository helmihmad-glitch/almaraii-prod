import express, { type Express } from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENV } from "./env";

const localStorageRoot = path.resolve(process.cwd(), ".local-storage");

function localStorageFilePath(key: string) {
  return path.resolve(localStorageRoot, key.replace(/^\/+/, ""));
}

export function registerStorageProxy(app: Express) {
  app.put("/manus-storage/*", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      try {
        const filePath = localStorageFilePath(key);
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, Buffer.from(req.body ?? []));
        res.status(200).send("OK");
      } catch (error) {
        console.error("[StorageProxy] local upload failed:", error);
        res.status(500).send("Storage upload failed");
      }
      return;
    }

    res.status(500).send("Storage proxy not configured for upload");
  });

  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
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
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
