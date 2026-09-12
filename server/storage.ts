// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.
//
// BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY are only available when
// hosted on the Manus platform. When deployed elsewhere (e.g. Vercel), those
// are absent, and Vercel Blob is used instead — it only requires enabling
// "Blob" storage in the Vercel project's Storage tab, no external account.
// Connecting a Blob store to a project provisions either the classic static
// BLOB_READ_WRITE_TOKEN, or (current default) BLOB_STORE_ID + an OIDC token
// (VERCEL_OIDC_TOKEN, injected automatically per-invocation and never listed
// among the project's environment variables) — @vercel/blob's put()/
// handleUpload() already support both transparently, so we just need to
// detect whichever is present. If neither is configured, storage falls back
// to the local filesystem, which only works for local development (Vercel's
// function filesystem is read-only).

import { put as blobPut } from "@vercel/blob";
import { ENV } from "./_core/env";

export function isVercelBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function hasForgeStorageConfig() {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
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
  return `${getLocalStorageBaseUrl()}/manus-storage/${normalizeKey(relKey)}`;
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
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: localStorageUrlForKey(key) };
}

/** Fournit une URL PUT temporaire pour éviter de faire transiter les fichiers par une fonction serverless. */
export async function storageCreatePresignedUpload(relKey: string): Promise<{ key: string; uploadUrl: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));

  if (!hasForgeStorageConfig()) {
    return { key, uploadUrl: localStorageUrlForKey(key) };
  }

  const { forgeUrl, forgeKey } = getForgeConfig();

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: uploadUrl } = (await presignResp.json()) as { url: string };
  if (!uploadUrl) throw new Error("Forge returned empty presign URL");
  return { key, uploadUrl };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: localStorageUrlForKey(key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);

  if (!hasForgeStorageConfig()) {
    return localStorageUrlForKey(key);
  }

  const { forgeUrl, forgeKey } = getForgeConfig();

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
