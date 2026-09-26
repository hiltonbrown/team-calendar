// biome-ignore-all lint/style/useFilenamingConvention: Co-located integration test convention.

import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { lockXeroOwner } from "./locks";

const fixture = allocateLiveTestFixture(
  "packages/xero/src/oauth/credential-owner.integration.test.ts"
);
vi.mock("server-only", () => ({}));
vi.mock("./identity", () => ({
  verifyXeroAccessTokenIdentity: (token: string) => {
    try {
      const payload = JSON.parse(token);
      return {
        ok: true,
        value: {
          authEventId: null,
          expiresAt: new Date(payload.exp),
          xeroUserId: payload.user,
        },
      };
    } catch {
      return { error: { code: "identity_verification_failed" }, ok: false };
    }
  },
}));
let database: typeof import("@repo/database")["database"];
let api: typeof import("./credential-owner");
let crypto: typeof import("../crypto/tokens");
let maintenance: typeof import("./reencrypt-tokens");
const ownerId = fixture.globalKey("credential_owner");
const attemptId = fixture.globalKey("oauth_attempt");
const appId = fixture.globalKey("provider_app");
const slots = fixture.tenants.map((tenant, index) => ({
  ...tenant,
  connectionId: fixture.id("connection", index),
  providerTenantId: fixture.id("provider-tenant", index),
  tenantId: fixture.id("tenant", index),
}));
const deadline = () => ({ expiresAtMs: Date.now() + 30_000 });
const access = (exp: number) => JSON.stringify({ exp, user: ownerId });
const later = () => Date.now() + 3_600_000;
async function cleanup() {
  await database.xeroOAuthSession.deleteMany({
    where: { clerk_org_id: { in: slots.map((s) => s.clerkOrgId) } },
  });
  await database.xeroTenant.deleteMany({
    where: { organisation_id: { in: slots.map((s) => s.organisationId) } },
  });
  await database.xeroConnection.deleteMany({
    where: { organisation_id: { in: slots.map((s) => s.organisationId) } },
  });
  await database.organisation.deleteMany({
    where: { id: { in: slots.map((s) => s.organisationId) } },
  });
  await database.xeroRefreshAttempt.deleteMany({
    where: { xero_credential_owner_id: ownerId },
  });
  await database.xeroProviderConnection.deleteMany({
    where: { provider_app_id: appId },
  });
  await database.xeroCredentialOwner.deleteMany({
    where: { provider_app_id: appId },
  });
}
async function seed(sameClerk = false) {
  const a = crypto.encryptXeroToken(access(later()));
  const r = crypto.encryptXeroToken("synthetic-refresh");
  const envelope = {
    access_token_auth_tag: a.authTag,
    access_token_encrypted: a.encrypted,
    access_token_iv: a.iv,
    refresh_token_auth_tag: r.authTag,
    refresh_token_encrypted: r.encrypted,
    refresh_token_iv: r.iv,
    token_key_version: a.keyVersion,
  };
  await database.xeroCredentialOwner.create({
    data: {
      ...envelope,
      granted_scopes: ["payroll.employees"],
      granted_scopes_known: true,
      id: ownerId,
      identity_evidence: "access_token_jwt",
      provider_app_id: appId,
      token_expires_at: new Date(later()),
      xero_user_id: ownerId,
    },
  });
  for (const [index, slot] of slots.entries()) {
    const clerkOrgId = sameClerk ? slots[0].clerkOrgId : slot.clerkOrgId;
    await database.organisation.create({
      data: {
        clerk_org_id: clerkOrgId,
        country_code: "AU",
        id: slot.organisationId,
        name: `Owner fixture ${index}`,
      },
    });
    await database.xeroConnection.create({
      data: {
        ...envelope,
        clerk_org_id: clerkOrgId,
        expires_at: new Date(later()),
        id: slot.connectionId,
        organisation_id: slot.organisationId,
        status: "active",
      },
    });
    await database.xeroTenant.create({
      data: {
        active_slot: 1,
        clerk_org_id: clerkOrgId,
        id: slot.tenantId,
        organisation_id: slot.organisationId,
        payroll_region: "AU",
        provider_app_id: appId,
        xero_connection_id: slot.connectionId,
        xero_credential_owner_id: ownerId,
        xero_tenant_id: slot.providerTenantId,
      },
    });
  }
}
function stubToken() {
  const fetch = vi.fn((url: string | URL | Request) => {
    expect(String(url)).toBe("https://identity.xero.com/connect/token");
    return Promise.resolve(
      new Response(
        JSON.stringify({
          access_token: access(later() + 60_000),
          expires_in: 3600,
          refresh_token: "rotated-synthetic-refresh",
          token_type: "Bearer",
        }),
        { status: 200 }
      )
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function refresh(expectedTokenVersion = 1, recoveryAttemptId?: string) {
  return api.refreshXeroCredentialOwner({
    deadline: deadline(),
    expectedTokenVersion,
    ownerId,
    recoveryAttemptId,
  });
}
async function createAttempt(expired = false) {
  const owner = await database.xeroCredentialOwner.findUniqueOrThrow({
    where: { id: ownerId },
  });
  return database.xeroRefreshAttempt.create({
    data: {
      dispatched_at: new Date(),
      expected_token_version: 1,
      id: attemptId,
      outcome: "lost_response",
      recovery_deadline: new Date(Date.now() + (expired ? -1000 : 1_800_000)),
      recovery_key_version: owner.token_key_version,
      recovery_token_auth_tag: owner.refresh_token_auth_tag,
      recovery_token_encrypted: owner.refresh_token_encrypted,
      recovery_token_iv: owner.refresh_token_iv,
      uncertain_since: new Date(),
      xero_credential_owner_id: ownerId,
    },
  });
}
async function recoverOwnedAttempt() {
  const attempt = await database.xeroRefreshAttempt.findUniqueOrThrow({
    where: { id: attemptId },
  });
  // Limit maintenance discovery to this owned fixture; transactions still execute against PostgreSQL.
  const discovery = vi
    .spyOn(database.xeroRefreshAttempt, "findMany")
    .mockResolvedValueOnce([attempt]);
  try {
    await api.recoverXeroRefreshAttempts({ now: new Date() });
  } finally {
    discovery.mockRestore();
  }
}
describe("canonical credential owner integration", () => {
  beforeAll(async () => {
    process.env.XERO_CLIENT_ID = appId;
    process.env.XERO_CLIENT_SECRET = "synthetic-owner-secret";
    process.env.XERO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64"
    );
    ({ database } = await import("@repo/database"));
    api = await import("./credential-owner");
    crypto = await import("../crypto/tokens");
    maintenance = await import("./reencrypt-tokens");
  });
  beforeEach(async () => {
    vi.unstubAllGlobals();
    vi.stubEnv(
      "XERO_REDIRECT_URI",
      "https://api.example.com/api/xero/oauth/callback"
    );
    vi.stubEnv("VERCEL_ENV", "test");
    await cleanup();
    await seed();
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await cleanup();
    await database.$disconnect();
  });
  it("shares one owner between two payroll files within one Clerk account", async () => {
    await cleanup();
    await seed(true);
    stubToken();
    expect((await refresh()).ok).toBe(true);
    const owner = await database.xeroCredentialOwner.findUniqueOrThrow({
      where: { id: ownerId },
    });
    for (const slot of slots) {
      const connection = await database.xeroConnection.findUniqueOrThrow({
        where: { id: slot.connectionId },
      });
      expect(connection.access_token_encrypted).toBe(
        owner.access_token_encrypted
      );
      const result = await api.resolveXeroAccess({
        clerkOrgId: slots[0].clerkOrgId,
        deadline: deadline(),
        organisationId: slot.organisationId,
      });
      expect(result.ok && result.value.xeroTenantId).toBe(
        slot.providerTenantId
      );
    }
  });
  it("never exposes another Clerk account's binding", async () => {
    for (const [index, slot] of slots.entries()) {
      const wrong = await api.resolveXeroAccess({
        clerkOrgId: slots[1 - index].clerkOrgId,
        deadline: deadline(),
        organisationId: slot.organisationId,
      });
      expect(wrong).toMatchObject({
        error: { code: "not_connected" },
        ok: false,
      });
    }
  });
  it("serialises competing refreshes behind a real owner advisory lock", async () => {
    const fetch = stubToken();
    let entered: () => void = () => {
      throw new Error("Barrier not initialised");
    };
    let release: () => void = () => {
      throw new Error("Barrier not initialised");
    };
    const held = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = database.$transaction(
      async (tx) => {
        await lockXeroOwner(tx, ownerId);
        entered();
        await released;
      },
      { timeout: 30_000 }
    );
    await held;
    const first = refresh();
    const second = refresh();
    try {
      const until = Date.now() + 10_000;
      let queued = 0;
      do {
        const rows = await database.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted
          AND classid::bigint = ((hashtextextended(${`xero-owner:${ownerId}`}, 0) >> 32) & 4294967295)
          AND objid::bigint = (hashtextextended(${`xero-owner:${ownerId}`}, 0) & 4294967295)`;
        queued = rows[0]?.waiting ?? 0;
      } while (queued < 2 && Date.now() < until);
      expect(queued).toBe(2);
    } finally {
      release();
    }
    await blocker;
    const results = await Promise.all([first, second]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      results.map((result) => result.ok && result.value.token_version)
    ).toEqual([2, 2]);
    const currentOwner = await database.xeroCredentialOwner.findUniqueOrThrow({
      where: { id: ownerId },
    });
    for (const slot of slots) {
      expect(
        await database.xeroConnection.findUniqueOrThrow({
          where: { id: slot.connectionId },
        })
      ).toMatchObject({
        access_token_encrypted: currentOwner.access_token_encrypted,
        refresh_token_encrypted: currentOwner.refresh_token_encrypted,
      });
    }
    expect(
      (
        await database.xeroCredentialOwner.findUniqueOrThrow({
          where: { id: ownerId },
        })
      ).token_version
    ).toBe(2);
  });
  it("does not adopt an older candidate or change payroll binding generations", async () => {
    const original = await database.xeroCredentialOwner.findUniqueOrThrow({
      where: { id: ownerId },
    });
    const candidate = await api.adoptXeroCredential({
      accessToken: access(Date.now() + 900_000),
      deadline: deadline(),
      refreshToken: "older",
    });
    expect(candidate.ok && candidate.value.token_version).toBe(1);
    expect(candidate.ok && candidate.value.access_token_encrypted).toBe(
      original.access_token_encrypted
    );
    const adopted = await api.adoptXeroCredential({
      accessToken: access(later() + 60_000),
      deadline: deadline(),
      refreshToken: "newer",
    });
    expect(adopted.ok && adopted.value.token_version).toBe(2);
    expect(
      (
        await database.xeroTenant.findMany({
          where: { xero_credential_owner_id: ownerId },
        })
      ).map((t) => t.binding_generation)
    ).toEqual([1, 1]);
  });
  it("marks exact committed proof and scrubs retry material without redispatch", async () => {
    await createAttempt();
    await database.xeroCredentialOwner.update({
      data: { last_refresh_attempt_id: attemptId, token_version: 2 },
      where: { id: ownerId },
    });
    const fetch = stubToken();
    expect((await refresh(1, attemptId)).ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      await database.xeroRefreshAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      })
    ).toMatchObject({ outcome: "committed", recovery_token_encrypted: null });
  });
  it("supersedes uncertain attempts when a newer adoption fences recovery", async () => {
    await createAttempt();
    await database.xeroCredentialOwner.update({
      data: { last_refresh_attempt_id: null, token_version: 2 },
      where: { id: ownerId },
    });
    const fetch = stubToken();
    await recoverOwnedAttempt();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      await database.xeroRefreshAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      })
    ).toMatchObject({ outcome: "superseded", recovery_token_encrypted: null });
  });
  it("expires retry grace, scrubs secrets and requires reauthorisation", async () => {
    await createAttempt(true);
    const fetch = stubToken();
    await recoverOwnedAttempt();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      await database.xeroRefreshAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      })
    ).toMatchObject({ outcome: "failed", recovery_token_encrypted: null });
    expect(
      await database.xeroCredentialOwner.findUniqueOrThrow({
        where: { id: ownerId },
      })
    ).toMatchObject({ usability: "reauthorisation_required" });
  });
  it("never mirrors rotated credentials to disconnected connections", async () => {
    await database.xeroConnection.update({
      data: { disconnected_at: new Date(), status: "disconnected" },
      where: { id: slots[1].connectionId },
    });
    const before = await database.xeroConnection.findUniqueOrThrow({
      where: { id: slots[1].connectionId },
    });
    stubToken();
    await refresh();
    expect(
      await database.xeroConnection.findUniqueOrThrow({
        where: { id: slots[1].connectionId },
      })
    ).toMatchObject({
      access_token_encrypted: before.access_token_encrypted,
      status: "disconnected",
    });
    expect(
      await api.resolveXeroAccess({
        clerkOrgId: slots[1].clerkOrgId,
        deadline: deadline(),
        organisationId: slots[1].organisationId,
      })
    ).toMatchObject({ error: { code: "disconnected" }, ok: false });
  });
  it("refreshes unowned bindings through the existing legacy path", async () => {
    await database.xeroTenant.update({
      data: { xero_credential_owner_id: null },
      where: { id: slots[0].tenantId },
    });
    await database.xeroConnection.update({
      data: { expires_at: new Date(Date.now() - 60_000) },
      where: { id: slots[0].connectionId },
    });
    const fetch = stubToken();
    const result = await api.resolveXeroAccess({
      clerkOrgId: slots[0].clerkOrgId,
      deadline: deadline(),
      organisationId: slots[0].organisationId,
    });
    expect(result.ok && result.value.tokenVersion).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("skips owner key rewrite when adoption races the ciphertext CAS", async () => {
    vi.stubEnv(
      "XERO_TOKEN_ENCRYPTION_KEYS_JSON",
      JSON.stringify({ "2": Buffer.alloc(32, 8).toString("base64") })
    );
    vi.stubEnv("XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION", "2");
    try {
      const result = await maintenance.reencryptXeroTokens(
        { batchSize: 2, only: { ownerIds: [ownerId] } },
        {
          beforeWrite: async (table) => {
            if (table === "owner") {
              await database.xeroCredentialOwner.update({
                data: { token_version: { increment: 1 } },
                where: { id: ownerId },
              });
            }
          },
        }
      );
      expect(result).toEqual({
        ok: true,
        value: { failed: 0, rewritten: 0, skipped: 1 },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("adopts credentials for another file even when selection is abandoned without creating its binding", async () => {
    await database.xeroTenant.delete({ where: { id: slots[1].tenantId } });
    await database.xeroConnection.delete({
      where: { id: slots[1].connectionId },
    });
    const service = await import("./service");
    const start = await service.buildXeroOAuthStartUrl({
      clerkOrgId: slots[1].clerkOrgId,
      organisationId: slots[1].organisationId,
      userId: "abandoned-fixture-user",
    });
    if (!start.ok) {
      throw new Error(`OAuth start failed: ${start.error.code}`);
    }
    const state = new URL(start.value.redirectUrl).searchParams.get("state");
    if (!state) {
      throw new Error("OAuth state missing");
    }
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        if (String(url) === "https://identity.xero.com/connect/token") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: access(later() + 120_000),
                expires_in: 3600,
                refresh_token: "abandoned-selection-candidate",
              }),
              { status: 200 }
            )
          );
        }
        expect(String(url)).toBe("https://api.xero.com/connections");
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: fixture.id("provider-connection"),
                tenantId: slots[1].providerTenantId,
                tenantName: "Abandoned file fixture",
              },
            ]),
            { status: 200 }
          )
        );
      })
    );
    const callback = await service.completeXeroOAuth({
      code: "synthetic-code",
      nonce: start.value.nonce,
      state,
    });
    expect(callback.ok).toBe(true);
    expect(
      await database.xeroOAuthSession.findFirstOrThrow({
        where: {
          clerk_org_id: slots[1].clerkOrgId,
          created_by_user_id: "abandoned-fixture-user",
        },
      })
    ).toMatchObject({
      selected_tenant_id: null,
      status: "pending",
      token_exchange_status: "exchanged",
    });
    expect(
      await database.xeroTenant.count({
        where: { organisation_id: slots[1].organisationId },
      })
    ).toBe(0);
    const resolved = await api.resolveXeroAccess({
      clerkOrgId: slots[0].clerkOrgId,
      deadline: deadline(),
      organisationId: slots[0].organisationId,
    });
    expect(resolved.ok && resolved.value.tokenVersion).toBe(2);
  });
  it("retains exchanged candidate when inventory persistence fails and rejects callback replay without HTTP", async () => {
    const service = await import("./service");
    const start = await service.buildXeroOAuthStartUrl({
      clerkOrgId: slots[0].clerkOrgId,
      organisationId: slots[0].organisationId,
      userId: "fixture-user",
    });
    expect(start.ok).toBe(true);
    if (!start.ok) {
      throw new Error(`OAuth start failed: ${start.error.code}`);
    }
    const state = new URL(start.value.redirectUrl).searchParams.get("state");
    if (!state) {
      throw new Error("OAuth state missing");
    }
    const candidate = access(later() + 120_000);
    const fetch = vi.fn((url: string | URL | Request) => {
      if (String(url) === "https://identity.xero.com/connect/token") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: candidate,
              expires_in: 3600,
              refresh_token: "candidate-refresh",
            }),
            { status: 200 }
          )
        );
      }
      expect(String(url)).toBe("https://api.xero.com/connections");
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: fixture.id("provider-connection"),
              tenantId: slots[0].providerTenantId,
              tenantName: "Persistence failure fixture",
            },
          ]),
          { status: 200 }
        )
      );
    });
    vi.stubGlobal("fetch", fetch);
    const input = { code: "synthetic-code", nonce: start.value.nonce, state };
    const persistence = vi
      .spyOn(database.xeroProviderConnection, "upsert")
      .mockRejectedValueOnce(
        new Error("Synthetic inventory persistence failure")
      );
    try {
      expect((await service.completeXeroOAuth(input)).ok).toBe(false);
    } finally {
      persistence.mockRestore();
    }
    const session = await database.xeroOAuthSession.findFirstOrThrow({
      where: {
        clerk_org_id: slots[0].clerkOrgId,
        created_by_user_id: "fixture-user",
      },
    });
    expect(session.token_exchange_status).toBe("exchanged");
    expect(
      crypto.decryptXeroToken({
        authTag: session.access_token_auth_tag,
        encrypted: session.access_token_encrypted,
        iv: session.access_token_iv,
        keyVersion: session.token_key_version,
      })
    ).toBe(candidate);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await service.completeXeroOAuth(input)).ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("retries an uncertain response within grace using retained token and commits once", async () => {
    await createAttempt();
    const fetch = stubToken();
    await recoverOwnedAttempt();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      await database.xeroRefreshAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      })
    ).toMatchObject({ outcome: "committed", recovery_token_encrypted: null });
    expect(
      await database.xeroCredentialOwner.findUniqueOrThrow({
        where: { id: ownerId },
      })
    ).toMatchObject({ last_refresh_attempt_id: attemptId, token_version: 2 });
  });
});
