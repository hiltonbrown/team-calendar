import { describe, expect, it } from "vitest";
import { hashOAuthSessionToken } from "./session-token-hash";

describe("hashOAuthSessionToken", () => {
  it("hashes with SHA-256 hex so existing session rows still match", () => {
    expect(hashOAuthSessionToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});
