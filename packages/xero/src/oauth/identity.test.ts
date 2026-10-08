import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
} from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  verifyXeroAccessTokenIdentity,
  XERO_IDENTITY_AUDIENCE,
  XERO_IDENTITY_ISSUER,
} from "./identity";

vi.mock("../../keys", () => ({
  keys: () => ({ XERO_CLIENT_ID: "identity-test-app" }),
}));
const now = new Date("2026-09-26T00:00:00Z");
const seconds = now.getTime() / 1000;
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  pair = await generateKeyPair("RS256");
  jwks = createLocalJWKSet({ keys: [await exportJWK(pair.publicKey)] });
});
function token(overrides: JWTPayload = {}, key?: CryptoKey) {
  return new SignJWT({
    aud: XERO_IDENTITY_AUDIENCE,
    authentication_event_id: "auth-event",
    client_id: "identity-test-app",
    exp: seconds + 1800,
    iss: XERO_IDENTITY_ISSUER,
    nbf: seconds - 1,
    xero_userid: "xero-user-one",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign(key ?? pair.privateKey);
}
const deps = () => ({ jwks, now: () => now });
describe("Xero access token identity", () => {
  it("verifies signed identity and authentication event", async () => {
    expect(await verifyXeroAccessTokenIdentity(await token(), deps())).toEqual({
      ok: true,
      value: {
        authEventId: "auth-event",
        expiresAt: new Date(now.getTime() + 1_800_000),
        grantedScopes: [],
        xeroUserId: "xero-user-one",
      },
    });
  });
  it.each([
    { iss: "https://other.example" },
    { aud: "wrong" },
    { client_id: "wrong" },
    { xero_userid: undefined },
    { xero_userid: " " },
    { nbf: seconds + 1 },
    { exp: undefined },
  ])("rejects invalid claims %j", async (overrides) => {
    expect(
      (await verifyXeroAccessTokenIdentity(await token(overrides), deps())).ok
    ).toBe(false);
  });
  it("distinguishes an explicitly supplied empty scope claim from an omitted claim", async () => {
    expect(
      await verifyXeroAccessTokenIdentity(await token({ scope: [] }), deps())
    ).toMatchObject({
      ok: true,
      value: { grantedScopes: [], scopeProvided: true },
    });
    expect(
      await verifyXeroAccessTokenIdentity(await token(), deps())
    ).toMatchObject({ ok: true, value: { grantedScopes: [] } });
  });
  it("rejects a bad signature", async () => {
    const other = await generateKeyPair("RS256");
    const signed = await token({}, other.privateKey);
    expect((await verifyXeroAccessTokenIdentity(signed, deps())).ok).toBe(
      false
    );
  });
  it("rejects HS256", async () => {
    const signed = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .sign(new Uint8Array(32));
    expect((await verifyXeroAccessTokenIdentity(signed, deps())).ok).toBe(
      false
    );
  });
  it("fails closed when JWKS fails", async () => {
    const failing = {
      ...deps(),
      jwks: () => {
        throw new Error("JWKS unavailable");
      },
    };
    expect(
      (await verifyXeroAccessTokenIdentity(await token(), failing)).ok
    ).toBe(false);
  });
  it("rejects expired access tokens", async () => {
    expect(
      (
        await verifyXeroAccessTokenIdentity(
          await token({ exp: seconds - 1 }),
          deps()
        )
      ).ok
    ).toBe(false);
  });
  it("keeps different user IDs distinct despite equal email", async () => {
    const first = await verifyXeroAccessTokenIdentity(
      await token({ email: "same@example.test" }),
      deps()
    );
    const second = await verifyXeroAccessTokenIdentity(
      await token({ email: "same@example.test", xero_userid: "xero-user-two" }),
      deps()
    );
    expect(
      first.ok &&
        second.ok &&
        first.value.xeroUserId !== second.value.xeroUserId
    ).toBe(true);
  });
});
