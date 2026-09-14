// Storage helpers.
//
// Vercel Blob is used in production — it only requires enabling "Blob"
// storage in the Vercel project's Storage tab, no external account.
// Connecting a Blob store to a project provisions either the classic static
// BLOB_READ_WRITE_TOKEN, or (current default) BLOB_STORE_ID + an OIDC token
// (VERCEL_OIDC_TOKEN, injected automatically per-invocation and never listed
// among the project's environment variables) — @vercel/blob's put()/
// handleUpload() already support both transparently, so we just need to
// detect whichever is present. If neither is configured, storage falls back
// to the local filesystem (served by server/_core/storageProxy.ts), which
// only works for local development (Vercel's function filesystem is
// read-only).

import { issueSignedToken, presignUrl as blobPresignUrl, put as blobPut } from "@vercel/blob";

export function isVercelBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function getLocalStorageBaseUrl() {
  const configuredBaseUrl = process.env.PUBLIC_BASE_URL || process.env.VITE_PUBLIC_BASE_URL;
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, "");

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  }

  return `http://localhost:${process.env.PORT || 3000}`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function localStorageUrlForKey(relKey: string): string {
  return `${getLocalStorageBaseUrl()}/local-storage/${normalizeKey(relKey)}`;
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  if (isVercelBlobConfigured()) {
    const key = appendHashSuffix(normalizeKey(relKey));
    const body = typeof data === "string" ? data : Buffer.from(data);
    const blob = await blobPut(key, body, { access: "public", contentType, addRandomSuffix: false });
    return { key: blob.pathname, url: blob.url };
  }

  const { key, uploadUrl } = await storageCreatePresignedUpload(relKey);
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload failed (${uploadResp.status})`);
  }

  return { key, url: localStorageUrlForKey(key) };
}

/** Fournit une URL PUT temporaire pour éviter de faire transiter les fichiers par une fonction serverless. */
export async function storageCreatePresignedUpload(relKey: string): Promise<{ key: string; uploadUrl: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  return { key, uploadUrl: localStorageUrlForKey(key) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: localStorageUrlForKey(key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);

  if (isVercelBlobConfigured()) {
    // Le fichier importé via le flux « presigned » (voir server/_core/blobUpload.ts)
    // n’est pas lisible via une simple URL publique : on redemande ici un jeton
    // signé, cette fois pour une lecture (`get`), puis on en dérive une URL de
    // lecture temporaire.
    const token = await issueSignedToken({ pathname: key, operations: ["get"], validUntil: Date.now() + 5 * 60 * 1000 });
    const { presignedUrl } = await blobPresignUrl(token, { operation: "get", pathname: key, access: "private" });
    return presignedUrl;
  }

  return localStorageUrlForKey(key);
}
