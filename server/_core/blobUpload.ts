import type { Express } from "express";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { assertProductionActionAuthorized } from "../routers";

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Route serveur requise par `upload()` de `@vercel/blob/client` (utilisée
 * côté navigateur pour l’import Excel) : elle délivre un jeton de
 * téléversement de courte durée après avoir vérifié le mot de passe d’action,
 * afin que le fichier aille directement du navigateur vers Vercel Blob sans
 * transiter par le corps de la fonction (limité à quelques Mo sur Vercel).
 */
export function registerBlobUploadRoute(app: Express) {
  app.post("/api/blob-upload", async (req, res) => {
    try {
      const jsonResponse = await handleUpload({
        body: req.body as HandleUploadBody,
        request: req,
        onBeforeGenerateToken: async (_pathname, clientPayload) => {
          let actionPassword: string | undefined;
          if (clientPayload) {
            try {
              actionPassword = (JSON.parse(clientPayload) as { actionPassword?: string }).actionPassword;
            } catch {
              // Payload non-JSON : traité comme un mot de passe manquant.
            }
          }
          await assertProductionActionAuthorized(actionPassword);
          return {
            allowedContentTypes: [EXCEL_MIME],
            addRandomSuffix: true,
          };
        },
        onUploadCompleted: async () => {},
      });
      res.json(jsonResponse);
    } catch (error) {
      console.error("[BlobUpload] Échec de la génération du jeton de téléversement:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Échec de la préparation du téléversement." });
    }
  });
}
