import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const database = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    xeroConnection: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    xeroCredentialOwner: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    xeroRefreshAttempt: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    xeroTenant: { findFirst: vi.fn(), findMany: vi.fn() },
  };
  return {
    database,
    decrypt: vi.fn(),
    encrypt: vi.fn(),
    exchange: vi.fn(),
    identity: vi.fn(),
    legacy: vi.fn(),
    metricLog: vi.fn(),
  };
});
vi.mock("@repo/observability/log", () => ({ log: { info: mocks.metricLog } }));

vi.mock("@repo/database", () => ({ database: mocks.database }));
vi.mock("../../keys", () => ({ keys: () => ({ XERO_CLIENT_ID: "app" }) }));
vi.mock("./identity", () => ({
  verifyXeroAccessTokenIdentity: mocks.identity,
}));
vi.mock("./service", () => ({
  ensureFreshXeroConnection: mocks.legacy,
  exchangeToken: mocks.exchange,
  isRecordedXeroRefreshGrantInvalid: (code: string | null | undefined) =>
    [
      "invalid_grant",
      "refresh_invalid_grant",
      "refresh_token_invalid",
      "reauthorisation_required",
    ].includes(code ?? ""),
}));
vi.mock("../crypto/tokens", () => ({
  decryptXeroToken: mocks.decrypt,
  encryptXeroToken: mocks.encrypt,
}));

import { createXeroDeadline } from "../rate-limit/deadline";
import {
  adoptXeroCredential,
  recoverXeroRefreshAttempts,
  refreshXeroCredentialOwner,
  resolveXeroAccess,
} from "./credential-owner";

const db = mocks.database;
function owner() {
  return {
    access_token_auth_tag: "tag",
    access_token_encrypted: "cipher-access",
    access_token_iv: "iv",
    created_at: new Date(),
    granted_scopes: ["payroll.employees"],
    granted_scopes_known: true,
    id: "owner",
    identity_evidence: "access_token_jwt",
    last_adopted_at: null,
    last_refresh_attempt_id: null,
    last_rotated_at: null,
    last_verified_at: null,
    provider_app_id: "app",
    refresh_token_auth_tag: "tag",
    refresh_token_encrypted: "cipher-refresh",
    refresh_token_iv: "iv",
    token_expires_at: new Date(Date.now() + 3_600_000),
    token_key_version: 1,
    token_version: 1,
    updated_at: new Date(),
    usability: "usable",
    xero_user_id: "authoriser",
  };
}
function attempt() {
  return {
    created_at: new Date(),
    dispatched_at: new Date(),
    expected_token_version: 1,
    id: "attempt",
    outcome: "pending",
    recovery_deadline: null,
    recovery_key_version: 1,
    recovery_token_auth_tag: "tag",
    recovery_token_encrypted: "cipher-refresh",
    recovery_token_iv: "iv",
    uncertain_since: null,
    updated_at: new Date(),
    xero_credential_owner_id: "owner",
  };
}
function binding() {
  return {
    active_slot: 1,
    binding_generation: 2,
    clerk_org_id: "clerk",
    credential_owner: owner(),
    id: "binding",
    organisation_id: "organisation",
    payroll_region: "AU",
    retired_at: null,
    xero_connection: {
      disconnected_at: null,
      id: "connection",
      revoked_at: null,
      status: "active",
    },
    xero_tenant_id: "payroll-file",
  };
}
const deadline = () => createXeroDeadline(15_000);
const accessInput = () => ({
  clerkOrgId: "clerk",
  deadline: deadline(),
  expectedBindingGeneration: 2,
  organisationId: "organisation",
});

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(
    async (callback: (tx: typeof db) => Promise<unknown>) => callback(db)
  );
  db.xeroCredentialOwner.findUniqueOrThrow.mockResolvedValue(owner());
  db.xeroRefreshAttempt.findUniqueOrThrow.mockResolvedValue(attempt());
  db.xeroTenant.findMany.mockResolvedValue([]);
  mocks.decrypt.mockReturnValue("synthetic-token");
  mocks.encrypt.mockReturnValue({
    authTag: "new-tag",
    encrypted: "new-cipher",
    iv: "new-iv",
    keyVersion: 1,
  });
  mocks.identity.mockResolvedValue({
    ok: true,
    value: {
      authEventId: null,
      expiresAt: new Date(Date.now() + 7_200_000),
      xeroUserId: "authoriser",
    },
  });
  mocks.exchange.mockResolvedValue({
    ok: true,
    value: {
      access_token: "synthetic-access",
      expires_in: 1800,
      refresh_token: "synthetic-refresh",
    },
  });
  db.xeroCredentialOwner.update.mockResolvedValue({
    ...owner(),
    token_version: 2,
  });
});

describe("credential owner refresh", () => {
  it("retains grace recovery after a dispatched server failure", async () => {
    mocks.exchange.mockResolvedValue({
      error: {
        code: "network_error",
        dispatched: true,
        message: "Provider unavailable",
      },
      ok: false,
    });
    await refreshXeroCredentialOwner({
      deadline: deadline(),
      expectedTokenVersion: 1,
      ownerId: "owner",
    });
    expect(db.xeroRefreshAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: "lost_response" }),
      })
    );
    expect(db.xeroCredentialOwner.update).not.toHaveBeenCalled();
  });

  it("commits durable intent before the token call and locks owners before sorted mirrors", async () => {
    db.xeroTenant.findMany.mockResolvedValue([
      { id: "binding-a", xero_connection_id: "connection-z" },
      { id: "binding-b", xero_connection_id: "connection-a" },
    ]);
    const result = await refreshXeroCredentialOwner({
      deadline: deadline(),
      expectedTokenVersion: 1,
      ownerId: "owner",
    });
    expect(result.ok).toBe(true);
    expect(
      db.xeroRefreshAttempt.create.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.exchange.mock.invocationCallOrder[0] ?? 0);
    const locks = db.$queryRaw.mock.calls.map((call) => call[1]);
    expect(locks).toEqual([
      "xero-owner:owner",
      "xero-owner:owner",
      "xero-binding:binding-a",
      "xero-binding:binding-b",
      "connection-a",
      "connection-z",
    ]);
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.$queryRaw.mock.invocationCallOrder[0] ?? 0
    );
    expect(db.xeroConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          disconnected_at: null,
          revoked_at: null,
          status: { in: ["active", "stale"] },
          xero_tenant: { active_slot: 1, xero_credential_owner_id: "owner" },
        }),
      })
    );
  });
  it("invalid client configuration changes neither owners nor bindings", async () => {
    mocks.exchange.mockResolvedValue({
      error: { code: "client_credentials_invalid", message: "configuration" },
      ok: false,
    });
    expect(
      (
        await refreshXeroCredentialOwner({
          deadline: deadline(),
          expectedTokenVersion: 1,
          ownerId: "owner",
        })
      ).ok
    ).toBe(false);
    expect(db.xeroCredentialOwner.update).not.toHaveBeenCalled();
    expect(db.xeroCredentialOwner.updateMany).not.toHaveBeenCalled();
    expect(db.xeroConnection.updateMany).not.toHaveBeenCalled();
  });
  it("invalid grant requires reauthorisation without claiming remote absence", async () => {
    mocks.exchange.mockResolvedValue({
      error: { code: "refresh_token_invalid", message: "grant" },
      ok: false,
    });
    await refreshXeroCredentialOwner({
      deadline: deadline(),
      expectedTokenVersion: 1,
      ownerId: "owner",
    });
    expect(db.xeroCredentialOwner.update).toHaveBeenCalledWith({
      data: { usability: "reauthorisation_required" },
      where: { id: "owner" },
    });
    expect(db.xeroConnection.updateMany).not.toHaveBeenCalled();
  });
  it("reuses a newer winner without dispatching another token request", async () => {
    db.xeroCredentialOwner.findUniqueOrThrow.mockResolvedValue({
      ...owner(),
      token_version: 2,
    });
    const result = await refreshXeroCredentialOwner({
      deadline: deadline(),
      expectedTokenVersion: 1,
      ownerId: "owner",
    });
    expect(result.ok).toBe(true);
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(db.xeroRefreshAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: "superseded",
          recovery_token_encrypted: null,
        }),
      })
    );
  });
  it("retains a lost response token and does not reset its grace deadline", async () => {
    const since = new Date(Date.now() - 60_000);
    const until = new Date(since.getTime() + 1_800_000);
    db.xeroRefreshAttempt.findUniqueOrThrow.mockResolvedValue({
      ...attempt(),
      recovery_deadline: until,
      uncertain_since: since,
    });
    mocks.exchange.mockResolvedValue({
      error: { code: "unknown_error", dispatched: true, message: "network" },
      ok: false,
    });
    await refreshXeroCredentialOwner({
      deadline: deadline(),
      expectedTokenVersion: 1,
      ownerId: "owner",
    });
    expect(db.xeroRefreshAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          outcome: "lost_response",
          recovery_deadline: until,
          uncertain_since: since,
        },
      })
    );
    expect(db.xeroCredentialOwner.update).not.toHaveBeenCalled();
  });
});

describe("scoped access resolution", () => {
  it.each([
    ["stale generation", { binding_generation: 3 }, "generation_changed"],
    ["retired binding", { active_slot: null }, "disconnected"],
    [
      "disconnected connection",
      {
        xero_connection: {
          disconnected_at: new Date(),
          id: "connection",
          revoked_at: null,
          status: "disconnected",
        },
      },
      "disconnected",
    ],
    [
      "unusable owner",
      {
        credential_owner: { ...owner(), usability: "reauthorisation_required" },
      },
      "reauthorisation_required",
    ],
  ])(
    "rejects %s before decrypting credentials",
    async (_label, overrides, code) => {
      db.xeroTenant.findFirst.mockResolvedValue({ ...binding(), ...overrides });
      const result = await resolveXeroAccess(accessInput());
      expect(result).toEqual({
        error: expect.objectContaining({ code }),
        ok: false,
      });
      expect(mocks.decrypt).not.toHaveBeenCalled();
    }
  );
  it("filters initial and final binding reads by both tenancy IDs", async () => {
    db.xeroTenant.findFirst.mockResolvedValue(binding());
    expect((await resolveXeroAccess(accessInput())).ok).toBe(true);
    for (const [query] of db.xeroTenant.findFirst.mock.calls) {
      expect(query.where).toMatchObject({
        clerk_org_id: "clerk",
        organisation_id: "organisation",
      });
    }
  });
  it("allows unknown scope data without asserting that a capability is granted", async () => {
    const tenant = {
      ...binding(),
      credential_owner: {
        ...owner(),
        granted_scopes: [],
        granted_scopes_known: false,
      },
    };
    db.xeroTenant.findFirst.mockResolvedValue(tenant);
    expect(
      (
        await resolveXeroAccess({
          ...accessInput(),
          capability: "payroll.employees",
        })
      ).ok
    ).toBe(true);
    expect(db.xeroCredentialOwner.update).not.toHaveBeenCalled();
  });
  it("rejects a known missing capability", async () => {
    db.xeroTenant.findFirst.mockResolvedValue(binding());
    expect(
      await resolveXeroAccess({
        ...accessInput(),
        capability: "payroll.timesheets",
      })
    ).toEqual({
      error: expect.objectContaining({ code: "capability_missing" }),
      ok: false,
    });
  });
});

describe("adoption and durable recovery", () => {
  it("does not adopt a candidate with earlier expiry", async () => {
    db.xeroCredentialOwner.findUnique.mockResolvedValue(owner());
    mocks.identity.mockResolvedValue({
      ok: true,
      value: {
        expiresAt: new Date(Date.now() + 600_000),
        xeroUserId: "authoriser",
      },
    });
    expect(
      (
        await adoptXeroCredential({
          accessToken: "synthetic",
          deadline: deadline(),
          refreshToken: "synthetic",
        })
      ).ok
    ).toBe(true);
    expect(db.xeroCredentialOwner.update).not.toHaveBeenCalled();
    expect(db.xeroConnection.updateMany).not.toHaveBeenCalled();
    expect(db.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      "xero-owner:app:authoriser",
      "xero-owner:owner",
    ]);
  });
  it("a newer adoption supersedes a pending attempt rather than proving its commit", async () => {
    db.xeroRefreshAttempt.findMany.mockResolvedValue([attempt()]);
    db.xeroCredentialOwner.findUniqueOrThrow.mockResolvedValue({
      ...owner(),
      last_refresh_attempt_id: "different-attempt",
      token_version: 2,
    });
    await recoverXeroRefreshAttempts({ now: new Date() });
    expect(db.xeroRefreshAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: "superseded",
          recovery_token_encrypted: null,
        }),
      })
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.metricLog).toHaveBeenCalledExactlyOnceWith(
      "Xero lifecycle metric",
      {
        metric: "xero.refresh.conflict",
        outcome: "superseded",
        value: 1,
      }
    );
  });
  it("matching attempt ID and exact next token version prove a lost commit", async () => {
    db.xeroRefreshAttempt.findMany.mockResolvedValue([attempt()]);
    db.xeroCredentialOwner.findUniqueOrThrow.mockResolvedValue({
      ...owner(),
      last_refresh_attempt_id: "attempt",
      token_version: 2,
    });
    await recoverXeroRefreshAttempts({ now: new Date() });
    expect(db.xeroRefreshAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: "committed" }),
      })
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.metricLog).not.toHaveBeenCalled();
  });
  it("grace expiry scrubs recovery material and marks only the matching owner version unusable", async () => {
    const old = new Date(Date.now() - 1_800_001);
    const expired = { ...attempt(), created_at: old, dispatched_at: old };
    db.xeroRefreshAttempt.findMany.mockResolvedValue([expired]);
    db.xeroRefreshAttempt.findUniqueOrThrow.mockResolvedValue(expired);
    await recoverXeroRefreshAttempts({ now: new Date() });
    expect(db.xeroRefreshAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: "failed",
          recovery_key_version: null,
          recovery_token_encrypted: null,
        }),
      })
    );
    expect(db.xeroCredentialOwner.updateMany).toHaveBeenCalledWith({
      data: { usability: "reauthorisation_required" },
      where: { id: "owner", token_version: 1 },
    });
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.metricLog).toHaveBeenCalledExactlyOnceWith(
      "Xero lifecycle metric",
      {
        metric: "xero.refresh.failed",
        outcome: "failed",
        value: 1,
      }
    );
  });
});

describe("161g resolver evidence and capabilities", () => {
  it.each(["payroll.employees.read", "payroll.settings.read"])(
    "accepts corresponding broad scope for %s",
    async (capability) => {
      db.xeroTenant.findFirst.mockResolvedValue({
        ...binding(),
        credential_owner: {
          ...owner(),
          granted_scopes: [capability.slice(0, -5)],
        },
      });
      expect(
        (await resolveXeroAccess({ ...accessInput(), capability })).ok
      ).toBe(true);
      expect(mocks.exchange).not.toHaveBeenCalled();
    }
  );
  it("rejects write capability on read-only consent without refreshing even if expired", async () => {
    db.xeroTenant.findFirst.mockResolvedValue({
      ...binding(),
      credential_owner: {
        ...owner(),
        granted_scopes: ["payroll.employees.read"],
        token_expires_at: new Date(0),
      },
    });
    expect(
      await resolveXeroAccess({
        ...accessInput(),
        capability: "payroll.employees",
        forceRefresh: true,
      })
    ).toMatchObject({ error: { code: "capability_missing" }, ok: false });
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it("requires all capabilities before refreshing", async () => {
    db.xeroTenant.findFirst.mockResolvedValue({
      ...binding(),
      credential_owner: { ...owner(), token_expires_at: new Date(0) },
    });
    expect(
      await resolveXeroAccess({
        ...accessInput(),
        capability: ["payroll.employees.read", "payroll.settings.read"],
      })
    ).toMatchObject({ error: { code: "capability_missing" }, ok: false });
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it.each([
    ["network_error", undefined, undefined, "network_error"],
    [
      "network_error",
      "admission_unavailable",
      undefined,
      "admission_unavailable",
    ],
    ["network_error", undefined, 429, "rate_limit_error"],
    ["client_credentials_invalid", undefined, undefined, "configuration_error"],
    ["refresh_token_invalid", undefined, undefined, "reauthorisation_required"],
  ])(
    "preserves refresh reason %s / %s / %s",
    async (code, transportCode, httpStatus, expected) => {
      const current = { ...owner(), token_expires_at: new Date(0) };
      db.xeroTenant.findFirst.mockResolvedValue({
        ...binding(),
        credential_owner: current,
      });
      db.xeroCredentialOwner.findUniqueOrThrow.mockResolvedValue(current);
      mocks.exchange.mockResolvedValue({
        error: {
          code,
          httpStatus,
          message: "safe",
          retryAfterMs: 1234,
          transportCode,
        },
        ok: false,
      });
      expect(await resolveXeroAccess(accessInput())).toMatchObject({
        error: { code: expected, retryAfterMs: 1234 },
        ok: false,
      });
      if (code !== "refresh_token_invalid") {
        expect(db.xeroCredentialOwner.update).not.toHaveBeenCalled();
        expect(db.xeroConnection.updateMany).not.toHaveBeenCalled();
      }
    }
  );
  it("forces one owner refresh using the rejected token version and same deadline", async () => {
    db.xeroTenant.findFirst.mockResolvedValue(binding());
    const input = {
      ...accessInput(),
      forceRefresh: true,
      previousTokenVersion: 1,
    };
    const result = await resolveXeroAccess(input);
    expect(result).toMatchObject({
      ok: true,
      value: {
        deadline: input.deadline,
        tokenVersion: 2,
        xeroTenantDatabaseId: "binding",
      },
    });
    expect(mocks.exchange).toHaveBeenCalledOnce();
    expect(mocks.exchange).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: input.deadline })
    );
  });
  it("reuses newer owner token instead of refreshing for an old401", async () => {
    db.xeroTenant.findFirst.mockResolvedValue({
      ...binding(),
      credential_owner: { ...owner(), token_version: 2 },
    });
    expect(
      (
        await resolveXeroAccess({
          ...accessInput(),
          forceRefresh: true,
          previousTokenVersion: 1,
        })
      ).ok
    ).toBe(true);
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("retains unknown-key decryption as configuration rather than reauthorisation", async () => {
    db.xeroTenant.findFirst.mockResolvedValue(binding());
    mocks.decrypt.mockImplementation(() => {
      throw new Error("unknown key version");
    });
    expect(await resolveXeroAccess(accessInput())).toMatchObject({
      error: { code: "configuration_error" },
      ok: false,
    });
    expect(db.xeroCredentialOwner.update).not.toHaveBeenCalled();
    expect(db.xeroConnection.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    ["network_error", "network_error"],
    ["client_credentials_invalid", "configuration_error"],
    ["refresh_token_invalid", "reauthorisation_required"],
  ])("preserves legacy refresh failure %s", async (code, expected) => {
    db.xeroTenant.findFirst.mockResolvedValue({
      ...binding(),
      credential_owner: null,
    });
    mocks.legacy.mockResolvedValue({
      error: { code, message: "safe" },
      ok: false,
    });
    expect(await resolveXeroAccess(accessInput())).toMatchObject({
      error: { code: expected },
      ok: false,
    });
  });
  it("refreshes a newer but expiring owner using its current version", async () => {
    const current = {
      ...owner(),
      token_expires_at: new Date(0),
      token_version: 2,
    };
    db.xeroTenant.findFirst.mockResolvedValue({
      ...binding(),
      credential_owner: current,
    });
    db.xeroCredentialOwner.findUniqueOrThrow.mockResolvedValue(current);
    db.xeroRefreshAttempt.findUniqueOrThrow.mockResolvedValue({
      ...attempt(),
      expected_token_version: 2,
    });
    db.xeroCredentialOwner.update.mockResolvedValue({
      ...current,
      token_version: 3,
    });
    expect(
      (
        await resolveXeroAccess({
          ...accessInput(),
          forceRefresh: true,
          previousTokenVersion: 1,
        })
      ).ok
    ).toBe(true);
    expect(mocks.exchange).toHaveBeenCalledOnce();
    expect(db.xeroRefreshAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expected_token_version: 2 }),
      })
    );
  });
});

it.each([
  "invalid_grant",
  "refresh_invalid_grant",
  "refresh_token_invalid",
  "reauthorisation_required",
])(
  "rejects recorded legacy grant %s before refresh or decryption",
  async (code) => {
    const current = binding();
    db.xeroTenant.findFirst.mockResolvedValue({
      ...current,
      credential_owner: null,
      xero_connection: {
        ...current.xero_connection,
        last_error_code: code,
        status: "stale",
      },
    });
    expect(await resolveXeroAccess(accessInput())).toMatchObject({
      error: { code: "reauthorisation_required" },
      ok: false,
    });
    expect(mocks.legacy).not.toHaveBeenCalled();
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.decrypt).not.toHaveBeenCalled();
  }
);
it("opts a recoverable legacy stale binding into existing scoped refresh", async () => {
  const current = binding();
  db.xeroTenant.findFirst.mockResolvedValue({
    ...current,
    credential_owner: null,
    xero_connection: {
      ...current.xero_connection,
      last_error_code: "client_credentials_invalid",
      status: "stale",
    },
  });
  mocks.legacy.mockResolvedValue({
    error: { code: "network_error", message: "safe" },
    ok: false,
  });
  expect(await resolveXeroAccess(accessInput())).toMatchObject({
    error: { code: "network_error" },
    ok: false,
  });
  expect(mocks.legacy).toHaveBeenCalledWith(
    expect.objectContaining({
      allowStaleLegacyRefresh: true,
      clerkOrgId: "clerk",
      organisationId: "organisation",
    })
  );
});

describe("refresh metric outcome safety", () => {
  it.each([false, true])(
    "records a dispatched lost response and preserves recovery when logger throws: %s",
    async (loggerFails) => {
      if (loggerFails) {
        mocks.metricLog.mockImplementation(() => {
          throw new Error("telemetry unavailable");
        });
      }
      const error = {
        code: "network_error",
        dispatched: true,
        message: "provider response lost",
      };
      mocks.exchange.mockResolvedValue({ error, ok: false });
      expect(
        await refreshXeroCredentialOwner({
          deadline: deadline(),
          expectedTokenVersion: 1,
          ownerId: "owner",
        })
      ).toEqual({ error, ok: false });
      expect(db.xeroRefreshAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: "lost_response",
            recovery_deadline: expect.any(Date),
            uncertain_since: expect.any(Date),
          }),
        })
      );
      expect(db.xeroCredentialOwner.update).not.toHaveBeenCalled();
      expect(mocks.metricLog).toHaveBeenCalledExactlyOnceWith(
        "Xero lifecycle metric",
        { metric: "xero.refresh.failed", outcome: "lost_response", value: 1 }
      );
    }
  );
  it("records definite exchange failure without changing its error or owner", async () => {
    const error = {
      code: "client_credentials_invalid",
      message: "invalid app credentials",
    };
    mocks.exchange.mockResolvedValue({ error, ok: false });
    expect(
      await refreshXeroCredentialOwner({
        deadline: deadline(),
        expectedTokenVersion: 1,
        ownerId: "owner",
      })
    ).toEqual({ error, ok: false });
    expect(db.xeroCredentialOwner.update).not.toHaveBeenCalled();
    expect(db.xeroConnection.updateMany).not.toHaveBeenCalled();
    expect(mocks.metricLog).toHaveBeenCalledExactlyOnceWith(
      "Xero lifecycle metric",
      { metric: "xero.refresh.failed", outcome: "failed", value: 1 }
    );
  });
  it("preserves the superseding credential winner when metric logging throws", async () => {
    const winner = { ...owner(), token_version: 2 };
    db.xeroCredentialOwner.findUniqueOrThrow.mockResolvedValue(winner);
    mocks.metricLog.mockImplementation(() => {
      throw new Error("telemetry unavailable");
    });
    expect(
      await refreshXeroCredentialOwner({
        deadline: deadline(),
        expectedTokenVersion: 1,
        ownerId: "owner",
      })
    ).toEqual({ ok: true, value: winner });
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(db.xeroCredentialOwner.update).not.toHaveBeenCalled();
    expect(db.xeroRefreshAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: "superseded",
          recovery_token_encrypted: null,
        }),
      })
    );
    expect(mocks.metricLog).toHaveBeenCalledExactlyOnceWith(
      "Xero lifecycle metric",
      { metric: "xero.refresh.conflict", outcome: "superseded", value: 1 }
    );
  });
});

// Credential tests isolate token ownership; campaign checks have dedicated protocol coverage.
vi.mock("@repo/database/xero-campaign-access", () => ({
  withXeroCampaignCredentialScope: vi.fn(
    (
      _scope: unknown,
      _externalTenantId: string,
      operation: () => Promise<unknown>
    ) => operation()
  ),
}));
