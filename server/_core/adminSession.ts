// Session admin/visiteur : un simple cookie signé (JWT) qui atteste "role:
// admin". C'est désormais la seule protection des mutations (création,
// modification, suppression, import) — voir assertAdminSession dans
// routers.ts — après le retrait du mot de passe d'action séparé, devenu
// redondant avec cette session. Un visiteur sans ce cookie garde un accès en
// lecture libre ; ce contrôle porte sur les pages/actions, pas les requêtes
// de lecture elles-mêmes.
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import type { CookieOptions, Request } from "express";

export const ADMIN_SESSION_COOKIE = "app_admin_session";
export const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours.

function getSessionSecret(): Uint8Array {
  // SESSION_SECRET (ou, à défaut, JWT_SECRET) peut être configuré sur Vercel pour
  // renforcer la signature ; une valeur par défaut permet à la fonctionnalité de
  // marcher sans configuration supplémentaire (le cookie ne protège que la
  // navigation, pas les mutations, qui restent derrière le mot de passe d'action).
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || "almaraii-production-pulse-default-session-secret";
  return new TextEncoder().encode(secret);
}

export async function signAdminSession(): Promise<string> {
  const expirationSeconds = Math.floor((Date.now() + ADMIN_SESSION_DURATION_MS) / 1000);
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSessionSecret());
}

export async function verifyAdminSession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { algorithms: ["HS256"] });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

/** Lit et vérifie le cookie de session admin directement depuis une requête Express
 * brute (hors contexte tRPC) — utilisé par la route /api/blob-upload, qui n'a pas
 * accès à `ctx.isAdmin` puisqu'elle ne passe pas par `createContext`. */
export async function isAdminRequest(req: { headers: { cookie?: string | undefined } }): Promise<boolean> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return verifyAdminSession(cookies[ADMIN_SESSION_COOKIE]);
}

function isSecureRequest(req: Request): boolean {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}

export function getAdminSessionCookieOptions(req: Request): Pick<CookieOptions, "httpOnly" | "path" | "sameSite" | "secure"> {
  return { httpOnly: true, path: "/", sameSite: "lax", secure: isSecureRequest(req) };
}
