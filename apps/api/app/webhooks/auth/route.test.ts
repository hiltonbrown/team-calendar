import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uuidV5Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const mocks = vi.hoisted(() => ({
  analyticsCapture: vi.fn(),
  analyticsFlush: vi.fn(),
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
    flush: mocks.analyticsFlush,
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
    role: "org:owner",
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
      membershipFixture(),
      "msg_membership_1",
      new Date(1_700_000_000_000)
    );

    expect(response.status).toBe(201);
    expect(mocks.organisationFindMany).toHaveBeenCalledWith({
      select: {
        clerk_org_id: true,
        id: true,
      },
      where: {
        archived_at: null,
        clerk_org_id: "org_1",
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

  it("returns 503 and withholds activation analytics when any organisation fails", async () => {
    mocks.ensureCurrentUserPerson
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "00000000-0000-4000-8000-000000000011" },
      })
      .mockResolvedValueOnce({
        error: { code: "database_error", message: "temporary failure" },
        ok: false,
      });

    const response = await handleOrganizationMembershipCreated(
      membershipFixture(),
      "msg_membership_partial",
      new Date(1_700_000_000_000)
    );

    expect(response.status).toBe(503);
    expect(mocks.ensureCurrentUserPerson).toHaveBeenCalledTimes(2);
    expect(mocks.analyticsGroupIdentify).not.toHaveBeenCalled();
    expect(mocks.analyticsCapture).not.toHaveBeenCalled();

    mocks.ensureCurrentUserPerson.mockResolvedValue({
      ok: true,
      value: { id: "00000000-0000-4000-8000-000000000011" },
    });
    const retry = await handleOrganizationMembershipCreated(
      membershipFixture(),
      "msg_membership_partial",
      new Date(1_700_000_000_000)
    );
    const delivered = mocks.analyticsCapture.mock.calls
      .map(([event]) => event)
      .filter((event) => event.event === "Customer Admitted");
    expect(retry.status).toBe(201);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      timestamp: new Date(1_700_000_000_000),
      uuid: expect.any(String),
    });
  });

  it("returns 503 when every organisation fails", async () => {
    mocks.ensureCurrentUserPerson.mockResolvedValue({
      error: { code: "database_error", message: "temporary failure" },
      ok: false,
    });

    const response = await handleOrganizationMembershipCreated(
      membershipFixture(),
      "msg_membership_failure",
      new Date(1_700_000_000_000)
    );

    expect(response.status).toBe(503);
    expect(mocks.ensureCurrentUserPerson).toHaveBeenCalledTimes(2);
    expect(mocks.analyticsCapture).not.toHaveBeenCalled();
  });

  it("repairs a failed replay and uses one provider delivery identity after success", async () => {
    mocks.ensureCurrentUserPerson
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "00000000-0000-4000-8000-000000000011" },
      })
      .mockResolvedValueOnce({
        error: { code: "database_error", message: "temporary failure" },
        ok: false,
      });

    const failed = await handleOrganizationMembershipCreated(
      membershipFixture(),
      "msg_membership_replay",
      new Date(1_700_000_000_000)
    );
    mocks.ensureCurrentUserPerson.mockResolvedValue({
      ok: true,
      value: { id: "00000000-0000-4000-8000-000000000011" },
    });
    const repaired = await handleOrganizationMembershipCreated(
      membershipFixture(),
      "msg_membership_replay",
      new Date(1_700_000_000_000)
    );
    const duplicate = await handleOrganizationMembershipCreated(
      membershipFixture(),
      "msg_membership_replay",
      new Date(1_700_000_000_000)
    );

    expect([failed.status, repaired.status, duplicate.status]).toEqual([
      503, 201, 201,
    ]);
    const deliveredEvents = mocks.analyticsCapture.mock.calls
      .map(([event]) => event)
      .filter((event) => event.event === "Customer Admitted");
    const deliveredUuids = deliveredEvents.map((event) => event.uuid);
    expect(deliveredUuids).toHaveLength(2);
    expect(new Set(deliveredUuids).size).toBe(1);
    expect(deliveredUuids[0]).toMatch(uuidV5Pattern);
  });

  it("clears clerk_user_id on membership deletion without deleting people", async () => {
    const response = await handleOrganizationMembershipDeleted(
      membershipFixture()
    );

    expect(response.status).toBe(201);
    expect(mocks.personUpdateMany).toHaveBeenCalledWith({
      data: {
        clerk_user_id: null,
      },
      where: {
        clerk_org_id: "org_1",
        clerk_user_id: "user_1",
      },
    });
  });
});

describe("Clerk webhook payload validation", () => {
  function webhookRequest(body: string) {
    return new Request("http://localhost/webhooks/auth", {
      body,
      method: "POST",
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockReturnValue(undefined);
  });

  it("returns 400 when a consumed event has a malformed payload", async () => {
    // user.created without the required created_at field.
    const body = JSON.stringify({
      data: { id: "user_1" },
      type: "user.created",
    });

    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.analyticsCapture).not.toHaveBeenCalled();
    expect(mocks.analyticsGroupIdentify).not.toHaveBeenCalled();
    expect(mocks.analyticsIdentify).not.toHaveBeenCalled();
    expect(mocks.ensureCurrentUserPerson).not.toHaveBeenCalled();
    expect(mocks.organisationFindMany).not.toHaveBeenCalled();
    expect(mocks.personUpdateMany).not.toHaveBeenCalled();
  });

  it("passes the exact raw body to Svix and accepts a valid consumed event", async () => {
    const body = ` {
  "data": { "created_by": "user_1", "id": "org_1", "name": "Acme" },
  "timestamp": 1789776000000,
  "type": "organization.created"
} `;

    const response = await POST(webhookRequest(body));

    expect(mocks.verify).toHaveBeenCalledWith(body, {
      "svix-id": "svix-header-value",
      "svix-signature": "svix-header-value",
      "svix-timestamp": "svix-header-value",
    });
    expect(response.status).toBe(201);
    expect(mocks.analyticsGroupIdentify).toHaveBeenCalledWith({
      distinctId: "user_1",
      groupKey: "org_1",
      groupType: "company",
      properties: {
        avatar: undefined,
        name: "Acme",
      },
    });
  });

  it("uses the verified Svix delivery identity for membership activation", async () => {
    mocks.organisationFindMany.mockResolvedValue([
      {
        clerk_org_id: "org_1",
        id: "00000000-0000-4000-8000-000000000001",
      },
    ]);
    mocks.ensureCurrentUserPerson.mockResolvedValue({
      ok: true,
      value: { id: "00000000-0000-4000-8000-000000000011" },
    });
    const body = JSON.stringify({
      data: membershipFixture(),
      timestamp: 1_700_000_000_000,
      type: "organizationMembership.created",
    });

    const first = await POST(webhookRequest(body));
    const replay = await POST(webhookRequest(body));

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    const deliveredEvents = mocks.analyticsCapture.mock.calls
      .map(([event]) => event)
      .filter((event) => event.event === "Customer Admitted");
    const deliveredUuids = deliveredEvents.map((event) => event.uuid);
    expect(deliveredUuids).toHaveLength(2);
    expect(new Set(deliveredUuids).size).toBe(1);
    expect(deliveredEvents[0]?.timestamp).toEqual(new Date(1_700_000_000_000));
    expect(deliveredEvents[1]?.timestamp).toEqual(new Date(1_700_000_000_000));
  });

  it("returns a retryable response when membership event time is absent", async () => {
    const body = JSON.stringify({
      data: membershipFixture(),
      type: "organizationMembership.created",
    });

    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(503);
    expect(mocks.ensureCurrentUserPerson).not.toHaveBeenCalled();
    expect(mocks.analyticsCapture).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON after successful verification", async () => {
    const response = await POST(webhookRequest('{ "type":'));

    expect(response.status).toBe(400);
    expect(mocks.analyticsCapture).not.toHaveBeenCalled();
    expect(mocks.analyticsGroupIdentify).not.toHaveBeenCalled();
    expect(mocks.analyticsIdentify).not.toHaveBeenCalled();
    expect(mocks.ensureCurrentUserPerson).not.toHaveBeenCalled();
    expect(mocks.organisationFindMany).not.toHaveBeenCalled();
    expect(mocks.personUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed webhook envelope", async () => {
    const response = await POST(
      webhookRequest(JSON.stringify({ type: "organization.created" }))
    );

    expect(response.status).toBe(400);
    expect(mocks.analyticsCapture).not.toHaveBeenCalled();
    expect(mocks.analyticsGroupIdentify).not.toHaveBeenCalled();
    expect(mocks.analyticsIdentify).not.toHaveBeenCalled();
    expect(mocks.ensureCurrentUserPerson).not.toHaveBeenCalled();
    expect(mocks.organisationFindMany).not.toHaveBeenCalled();
    expect(mocks.personUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 400 when Svix rejects the signature", async () => {
    const body = JSON.stringify({
      data: { created_by: "user_1", id: "org_1", name: "Acme" },
      type: "organization.created",
    });
    mocks.verify.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.analyticsCapture).not.toHaveBeenCalled();
    expect(mocks.analyticsGroupIdentify).not.toHaveBeenCalled();
    expect(mocks.analyticsIdentify).not.toHaveBeenCalled();
    expect(mocks.ensureCurrentUserPerson).not.toHaveBeenCalled();
    expect(mocks.organisationFindMany).not.toHaveBeenCalled();
    expect(mocks.personUpdateMany).not.toHaveBeenCalled();
  });

  it("ignores unhandled event types without validation", async () => {
    const body = JSON.stringify({
      data: { id: "sess_1" },
      type: "session.created",
    });

    const response = await POST(webhookRequest(body));

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
