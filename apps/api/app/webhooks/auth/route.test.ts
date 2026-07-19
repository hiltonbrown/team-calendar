import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyticsCapture: vi.fn(),
  analyticsGroupIdentify: vi.fn(),
  analyticsIdentify: vi.fn(),
  analyticsShutdown: vi.fn(),
  ensureCurrentUserPerson: vi.fn(),
  organisationFindMany: vi.fn(),
  personUpdateMany: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@repo/analytics/server", () => ({
  analytics: {
    capture: mocks.analyticsCapture,
    groupIdentify: mocks.analyticsGroupIdentify,
    identify: mocks.analyticsIdentify,
    shutdown: mocks.analyticsShutdown,
  },
}));
vi.mock("@repo/availability", () => ({
  ensureCurrentUserPerson: mocks.ensureCurrentUserPerson,
}));
vi.mock("@repo/database", () => ({
  database: {
    organisation: { findMany: mocks.organisationFindMany },
    person: { updateMany: mocks.personUpdateMany },
  },
}));
vi.mock("@repo/observability/log", () => ({
  log: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("@/env", () => ({
  env: { CLERK_WEBHOOK_SECRET: "secret" },
}));
vi.mock("svix", () => ({
  Webhook: class {
    verify = mocks.verify;
  },
}));
vi.mock("next/headers", () => ({
  headers: () => ({ get: () => "svix-header-value" }),
}));

const {
  POST,
  handleOrganizationMembershipCreated,
  handleOrganizationMembershipDeleted,
} = await import("./route");

function membershipFixture() {
  return {
    organization: { id: "org_1" },
    public_user_data: {
      first_name: "Test",
      identifier: "person@example.com",
      image_url: "https://img.clerk.com/user.png",
      last_name: "Person",
      user_id: "user_1",
    },
  } as Parameters<typeof handleOrganizationMembershipCreated>[0];
}

describe("Clerk organisation membership webhook handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organisationFindMany.mockResolvedValue([
      {
        clerk_org_id: "org_1",
        id: "00000000-0000-4000-8000-000000000001",
      },
      {
        clerk_org_id: "org_1",
        id: "00000000-0000-4000-8000-000000000002",
      },
    ]);
    mocks.ensureCurrentUserPerson.mockResolvedValue({
      ok: true,
      value: { id: "00000000-0000-4000-8000-000000000011" },
    });
    mocks.personUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("links or creates people for each active organisation on membership creation", async () => {
    const response = await handleOrganizationMembershipCreated(
      membershipFixture()
    );

    expect(response.status).toBe(201);
    expect(mocks.organisationFindMany).toHaveBeenCalledWith({
      where: {
        archived_at: null,
        clerk_org_id: "org_1",
      },
      select: {
        clerk_org_id: true,
        id: true,
      },
    });
    expect(mocks.ensureCurrentUserPerson).toHaveBeenCalledTimes(2);
    expect(mocks.ensureCurrentUserPerson).toHaveBeenCalledWith(
      {
        clerkOrgId: "org_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
      },
      {
        avatarUrl: "https://img.clerk.com/user.png",
        clerkUserId: "user_1",
        displayName: "Test Person",
        email: "person@example.com",
        firstName: "Test",
        lastName: "Person",
      }
    );
  });

  it("clears clerk_user_id on membership deletion without deleting people", async () => {
    const response = await handleOrganizationMembershipDeleted(
      membershipFixture()
    );

    expect(response.status).toBe(201);
    expect(mocks.personUpdateMany).toHaveBeenCalledWith({
      where: {
        clerk_org_id: "org_1",
        clerk_user_id: "user_1",
      },
      data: {
        clerk_user_id: null,
      },
    });
  });
});

describe("Clerk webhook payload validation", () => {
  function webhookRequest() {
    return new Request("http://localhost/webhooks/auth", {
      body: JSON.stringify({}),
      method: "POST",
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when a consumed event has a malformed payload", async () => {
    // user.created without the required created_at field.
    mocks.verify.mockReturnValue({
      data: { id: "user_1" },
      type: "user.created",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(400);
    expect(mocks.analyticsCapture).not.toHaveBeenCalled();
  });

  it("accepts a valid consumed event payload", async () => {
    mocks.verify.mockReturnValue({
      data: { created_by: "user_1", id: "org_1", name: "Acme" },
      type: "organization.created",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(201);
  });

  it("ignores unhandled event types without validation", async () => {
    mocks.verify.mockReturnValue({
      data: { id: "sess_1" },
      type: "session.created",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(201);
  });
});

describe("Clerk webhook configuration", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("rejects delivery when the webhook secret is not configured", async () => {
    vi.resetModules();
    vi.doMock("@/env", () => ({
      env: { CLERK_WEBHOOK_SECRET: undefined },
    }));
    const { POST: PostWithoutSecret } = await import("./route");

    const response = await PostWithoutSecret(
      new Request("http://localhost/webhooks/auth", { method: "POST" })
    );

    expect(response.status).toBe(500);
    expect(response.status).not.toBe(200);
  });
});
