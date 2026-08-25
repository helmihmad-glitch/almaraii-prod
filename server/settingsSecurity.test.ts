import { describe, expect, it } from "vitest";
import { createActionPasswordDigest, verifyActionPasswordDigest } from "./settingsSecurity";

describe("settingsSecurity", () => {
  it("enregistre un mot de passe avec un sel et un hachage distincts du secret saisi", () => {
    const digest = createActionPasswordDigest("nouveau-secret-123");

    expect(digest.salt).toHaveLength(32);
    expect(digest.hash).not.toBe("nouveau-secret-123");
    expect(digest.hash).toHaveLength(128);
  });

  it("valide uniquement le mot de passe correspondant au hachage enregistré", () => {
    const digest = createActionPasswordDigest("nouveau-secret-123");

    expect(verifyActionPasswordDigest("nouveau-secret-123", digest)).toBe(true);
    expect(verifyActionPasswordDigest("secret-invalide", digest)).toBe(false);
  });
});
