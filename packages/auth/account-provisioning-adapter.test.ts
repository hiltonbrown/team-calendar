import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withAccountProvisioning } from "./account-provisioning-adapter";
import { createBetterAuthOptions } from "./better-auth-options";
import {
  bootstrapCookieName,
  openBootstrap,
  sealBootstrap,
} from "./bootstrap-proof";
import { parseBetterAuthEnvironment } from "./keys";

vi.mock("@repo/email", () => ({
  sendAuthEmail: vi.fn().mockResolvedValue(undefined),
}));
const origin = "http://localhost:3000";
const secret = "test-bootstrap-secret-with-at-least-32-characters";
const environment = parseBetterAuthEnvironment({
  BETTER_AUTH_SECRET: secret,
  BETTER_AUTH_URL: origin,
  GOOGLE_CLIENT_ID: "google",
  GOOGLE_CLIENT_SECRET: "google-secret",
  MICROSOFT_CLIENT_ID: "microsoft",
  MICROSOFT_CLIENT_SECRET: "microsoft-secret",
  NEXT_PUBLIC_APP_URL: origin,
  XERO_AUTH_CLIENT_ID: "xero-auth",
  XERO_AUTH_CLIENT_SECRET: "xero-auth-secret",
});
const proof = () => ({
  countryCode: "AU" as const,
  expiresAt: Date.now() + 600_000,
  timeZone: "Australia/Brisbane",
  version: 1 as const,
});
const emptyStorage = (): Record<string, Record<string, unknown>[]> =>
  Object.fromEntries(
    [
      "AuthUser",
      "AuthSession",
      "AuthIdentity",
      "AuthVerification",
      "AuthOrganization",
      "AuthMember",
      "AuthInvitation",
      "AuthRateLimit",
    ].map((name) => [name, []])
  );
const request = (email: string, extra = {}) =>
  new Request(`${origin}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      callbackURL: "/select-account",
      email,
      name: "Alex",
      password: "a long and valid password",
    }),
    headers: {
      "content-type": "application/json",
      cookie: `${bootstrapCookieName(origin)}=${sealBootstrap({ ...proof(), ...extra }, secret)}`,
      origin,
    },
    method: "POST",
  });

describe("atomic Account bootstrap", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          authorization_endpoint:
            "https://login.xero.com/identity/connect/authorize",
          issuer: "https://identity.xero.com",
          jwks_uri: "https://identity.xero.com/jwks",
          token_endpoint: "https://identity.xero.com/connect/token",
        })
      )
    )
  );
  afterEach(() => vi.unstubAllGlobals());
  it("creates one user, Account and owner membership on public signup", async () => {
    const storage = emptyStorage();
    const auth = betterAuth(
      createBetterAuthOptions(environment, memoryAdapter(storage))
    );
    const response = await auth.handler(request("alex@example.test"));
    expect(response.status).toBe(200);
    expect(storage.AuthUser).toHaveLength(1);
    expect(storage.AuthOrganization).toHaveLength(1);
    expect(storage.AuthMember).toHaveLength(1);
    expect(storage.AuthMember[0]).toMatchObject({
      account_id: storage.AuthOrganization[0].id,
      role: "owner",
      user_id: storage.AuthUser[0].id,
    });
    expect(storage.AuthOrganization[0]).toMatchObject({
      country_code: "AU",
      provisioning_status: "pending",
    });
  });
  it("rejects signup without valid setup context without committing an orphan", async () => {
    const storage = emptyStorage();
    const auth = betterAuth(
      createBetterAuthOptions(environment, memoryAdapter(storage))
    );
    const missing = request("alex@example.test");
    missing.headers.delete("cookie");
    expect((await auth.handler(missing)).status).toBeGreaterThanOrEqual(400);
    expect(storage.AuthUser).toHaveLength(0);
    expect(storage.AuthOrganization).toHaveLength(0);
  });
  it("rolls back user and Account when membership creation fails", async () => {
    const storage = emptyStorage();
    const options = createBetterAuthOptions(environment, undefined);
    const base = memoryAdapter(storage)(options);
    const decorated = withAccountProvisioning(
      () => ({
        ...base,
        transaction: (callback) =>
          base.transaction((tx) =>
            callback({
              ...tx,
              create: (args) => {
                if (args.model === "member") {
                  throw new Error("membership persistence failed");
                }
                return tx.create(args);
              },
            })
          ),
      }),
      origin,
      secret,
      async () => proof()
    )(options);
    await expect(
      decorated.create({
        data: {
          createdAt: new Date(),
          email: "alex@example.test",
          emailVerified: false,
          name: "Alex",
          updatedAt: new Date(),
        },
        model: "user",
      })
    ).rejects.toThrow("membership persistence failed");
    expect(storage.AuthUser).toHaveLength(0);
    expect(storage.AuthOrganization).toHaveLength(0);
  });
  it("decorates native outer transactions as well as standalone creates", async () => {
    const storage = emptyStorage();
    const options = createBetterAuthOptions(environment, undefined);
    const decorated = withAccountProvisioning(
      memoryAdapter(storage),
      origin,
      secret,
      async () => proof()
    )(options);
    await decorated.transaction((tx) =>
      tx.create({
        data: {
          createdAt: new Date(),
          email: "alex@example.test",
          emailVerified: false,
          name: "Alex",
          updatedAt: new Date(),
        },
        model: "user",
      })
    );
    expect(storage.AuthMember).toHaveLength(1);
    expect(storage.AuthOrganization).toHaveLength(1);
  });
  it("joins and consumes the addressed invitation without creating another Account", async () => {
    const storage = emptyStorage();
    const factory = memoryAdapter(storage);
    const auth = betterAuth(createBetterAuthOptions(environment, factory));
    const raw = factory(auth.options);
    const now = new Date();
    const inviter = await raw.create<Record<string, unknown>, { id: string }>({
      data: {
        createdAt: now,
        email: "owner@example.test",
        emailVerified: true,
        name: "Owner",
        updatedAt: now,
      },
      model: "user",
    });
    const account = await raw.create<Record<string, unknown>, { id: string }>({
      data: {
        countryCode: "AU",
        createdAt: now,
        name: "Existing Account",
        provisioningStatus: "ready",
        slug: "existing",
      },
      model: "organization",
    });
    await raw.create({
      data: {
        createdAt: now,
        organizationId: account.id,
        role: "owner",
        userId: inviter.id,
      },
      model: "member",
    });
    const invitation = await raw.create<
      Record<string, unknown>,
      { id: string }
    >({
      data: {
        createdAt: now,
        email: "alex@example.test",
        expiresAt: new Date(Date.now() + 600_000),
        inviterId: inviter.id,
        organizationId: account.id,
        role: "manager",
        status: "pending",
      },
      model: "invitation",
    });
    expect(
      (
        await auth.handler(
          request("alex@example.test", { invitationId: invitation.id })
        )
      ).status
    ).toBe(200);
    expect(storage.AuthOrganization).toHaveLength(1);
    expect(storage.AuthUser).toHaveLength(2);
    expect(storage.AuthMember[1]).toMatchObject({
      account_id: account.id,
      role: "manager",
    });
    expect(storage.AuthInvitation[0].status).toBe("accepted");
  });
  it("rejects altered or expired proof and validates country/timezone", () => {
    const sealed = sealBootstrap(proof(), secret);
    expect(openBootstrap(sealed, secret).countryCode).toBe("AU");
    expect(() => openBootstrap(`${sealed}tampered`, secret)).toThrow();
    expect(() => openBootstrap(sealed, secret, Date.now() + 700_000)).toThrow();
    expect(() =>
      sealBootstrap({ ...proof(), timeZone: "invented" }, secret)
    ).toThrow();
  });
});
