import type { Express } from "express";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { assertProductionActionAuthorized, EXCEL_IMPORT_MAX_BYTES } from "../routers";

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Route serveur requise par `uploadPresigned()` de `@vercel/blob/client`
 * (utilisée côté navigateur pour l’import Excel) : elle délivre, après
 * vérification du mot de passe d’action, un jeton signé de courte durée
 * permettant au fichier d’aller directement du navigateur vers Vercel Blob
 * sans transiter par le corps de la fonction (limité à quelques Mo sur
 * Vercel).
 *
 * `handleUploadPresigned` / `issueSignedToken` sont utilisés plutôt que
 * `handleUpload` / `generateClientTokenFromReadWriteToken` : ces derniers
 * exigent obligatoirement un `BLOB_READ_WRITE_TOKEN` statique, alors que le
 * flux « presigned » fonctionne aussi bien avec ce jeton qu’avec
 * l’authentification OIDC (`BLOB_STORE_ID` + jeton OIDC injecté
 * automatiquement) — c’est ce que provisionne Vercel par défaut quand on
 * connecte un store Blob au projet.
 */
export function registerBlobUploadRoute(app: Express) {
  app.post("/api/blob-upload", async (req, res) => {
    try {
      const jsonResponse = await handleUploadPresigned({
        body: req.body as HandleUploadPresignedBody,
        request: req,
        getSignedToken: async (pathname, clientPayload) => {
          let actionPassword: string | undefined;
          if (clientPayload) {
            try {
              actionPassword = (JSON.parse(clientPayload) as { actionPassword?: string }).actionPassword;
            } catch {
              // Payload non-JSON : traité comme un mot de passe manquant.
            }
          }
          await assertProductionActionAuthorized(actionPassword);
          const token = await issueSignedToken({
            pathname,
            operations: ["put"],
            allowedContentTypes: [EXCEL_MIME],
            maximumSizeInBytes: EXCEL_IMPORT_MAX_BYTES,
            validUntil: Date.now() + 5 * 60 * 1000,
          });
          return { token };
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
