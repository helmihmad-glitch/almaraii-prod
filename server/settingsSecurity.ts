import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type ActionPasswordDigest = {
  hash: string;
  salt: string;
};

export function createActionPasswordDigest(password: string): ActionPasswordDigest {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyActionPasswordDigest(password: string, digest: ActionPasswordDigest): boolean {
  const candidate = scryptSync(password, digest.salt, 64).toString("hex");
  const expected = Buffer.from(digest.hash, "hex");
  const actual = Buffer.from(candidate, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
