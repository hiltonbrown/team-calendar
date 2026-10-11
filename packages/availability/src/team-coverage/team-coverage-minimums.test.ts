import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const tx = { auditEvent: { create: vi.fn() } };
  return {
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) =>
      run(tx)
    ),
    listTeamsWithCoverageMinimum: vi.fn(),
    setTeamCoverageMinimum: vi.fn(),
    tx,
  };
});

vi.mock("@repo/database", () => ({
  tenantDatabase: vi.fn((accountId: string) => {
    if (!accountId) {
      throw new Error("Missing tenant context");
    }
    return { $transaction: mocks.$transaction };
  }),
  tenantTransaction: vi.fn(
    (accountId: string, transactionCallback: unknown, options?: unknown) => {
      if (!accountId) {
        throw new Error("Missing tenant context");
      }
      return { $transaction: mocks.$transaction }.$transaction(
        transactionCallback,
        options
      );
    }
  ),
}));

vi.mock("@repo/database/queries/teams", () => ({
  listTeamsWithCoverageMinimum: mocks.listTeamsWithCoverageMinimum,
  setTeamCoverageMinimum: mocks.setTeamCoverageMinimum,
}));

const {
  listTeamCoverageMinimums,
  TEAM_COVERAGE_MINIMUM_AUDIT_ACTION,
  updateTeamCoverageMinimum,
} = await import("./team-coverage-minimums");

const TEAM_ID = "33333333-3333-4333-8333-333333333333";
const scope = {
  clerkOrgId: "org_coverage",
  organisationId: "11111111-1111-4111-8111-111111111111",
};

const buildTeam = (overrides: Partial<{ activePeopleCount: number }> = {}) => ({
  activePeopleCount: 7,
  id: TEAM_ID,
  minimumAvailablePeople: null,
  name: "Customer support",
  ...overrides,
});

const buildInput = (
  overrides: Partial<{ actingRole: string; minimum: number | null }> = {}
) => ({
  ...scope,
  actingRole: "admin",
  actingUserId: "user_admin",
  minimum: 2,
  teamId: TEAM_ID,
  ...overrides,
});

describe("updateTeamCoverageMinimum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTeamsWithCoverageMinimum.mockResolvedValue({
      ok: true,
      value: [buildTeam()],
    });
    mocks.setTeamCoverageMinimum.mockImplementation(
      (input: { minimum: number | null }) =>
        Promise.resolve({
          ok: true,
          value: {
            after: input.minimum,
            before: 1,
            teamId: TEAM_ID,
            teamName: "Customer support",
          },
        })
    );
  });

  it.each(["manager", "viewer", "employee"])(
    "rejects the %s role without reading or writing",
    async (actingRole) => {
      const result = await updateTeamCoverageMinimum(
        buildInput({ actingRole })
      );

      expect(result).toMatchObject({
        error: { code: "not_authorised" },
        ok: false,
      });
      expect(mocks.listTeamsWithCoverageMinimum).not.toHaveBeenCalled();
      expect(mocks.$transaction).not.toHaveBeenCalled();
    }
  );

  it.each([-1, 8, 1.5])(
    "rejects a minimum of %s with the team size in the message",
    async (minimum) => {
      const result = await updateTeamCoverageMinimum(buildInput({ minimum }));

      expect(result).toEqual({
        error: {
          code: "validation_error",
          message: "Minimum must be between 0 and 7 people.",
        },
        ok: false,
      });
      expect(mocks.$transaction).not.toHaveBeenCalled();
    }
  );

  it("uses the singular for a team of one", async () => {
    mocks.listTeamsWithCoverageMinimum.mockResolvedValue({
      ok: true,
      value: [buildTeam({ activePeopleCount: 1 })],
    });

    const result = await updateTeamCoverageMinimum(buildInput({ minimum: 2 }));

    expect(result).toMatchObject({
      error: { message: "Minimum must be between 0 and 1 person." },
    });
  });

  it("accepts the team size itself and zero", async () => {
    await expect(
      updateTeamCoverageMinimum(buildInput({ minimum: 7 }))
    ).resolves.toMatchObject({ ok: true, value: { minimum: 7 } });
    await expect(
      updateTeamCoverageMinimum(buildInput({ minimum: 0 }))
    ).resolves.toMatchObject({ ok: true, value: { minimum: 0 } });
  });

  it("accepts null to clear the minimum", async () => {
    const result = await updateTeamCoverageMinimum(
      buildInput({ minimum: null })
    );

    expect(result).toEqual({
      ok: true,
      value: { minimum: null, teamName: "Customer support" },
    });
    expect(mocks.setTeamCoverageMinimum).toHaveBeenCalledWith(
      expect.objectContaining({ minimum: null }),
      mocks.tx
    );
  });

  it("updates and writes one audit event inside the same transaction", async () => {
    const result = await updateTeamCoverageMinimum(buildInput({ minimum: 2 }));

    expect(result).toEqual({
      ok: true,
      value: { minimum: 2, teamName: "Customer support" },
    });
    expect(mocks.$transaction).toHaveBeenCalledOnce();
    expect(mocks.setTeamCoverageMinimum).toHaveBeenCalledWith(
      { ...scope, minimum: 2, teamId: TEAM_ID },
      mocks.tx
    );
    expect(mocks.tx.auditEvent.create).toHaveBeenCalledOnce();
    expect(mocks.tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: TEAM_COVERAGE_MINIMUM_AUDIT_ACTION,
        actor_user_id: "user_admin",
        after_value: { minimum: 2 },
        before_value: { minimum: 1 },
        clerk_org_id: scope.clerkOrgId,
        entity_id: TEAM_ID,
        entity_type: "team",
        organisation_id: scope.organisationId,
        payload: { after: 2, before: 1 },
      }),
    });
    expect(TEAM_COVERAGE_MINIMUM_AUDIT_ACTION).toBe(
      "teams.coverage_minimum_updated"
    );
  });

  it("scopes the team lookup by both tenancy keys and rejects a team from another organisation", async () => {
    mocks.listTeamsWithCoverageMinimum.mockResolvedValue({
      ok: true,
      value: [],
    });

    const result = await updateTeamCoverageMinimum(buildInput());

    expect(mocks.listTeamsWithCoverageMinimum).toHaveBeenCalledWith(
      expect.objectContaining(scope)
    );
    expect(result).toMatchObject({ error: { code: "not_found" }, ok: false });
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it("writes no audit event when the scoped update finds no team", async () => {
    mocks.setTeamCoverageMinimum.mockResolvedValue({
      error: { code: "not_found", message: "Team not found" },
      ok: false,
    });

    const result = await updateTeamCoverageMinimum(buildInput());

    expect(result).toMatchObject({ error: { code: "not_found" }, ok: false });
    expect(mocks.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("reports an unknown error when the transaction fails", async () => {
    mocks.tx.auditEvent.create.mockRejectedValueOnce(new Error("down"));

    const result = await updateTeamCoverageMinimum(buildInput());

    expect(result).toMatchObject({
      error: { code: "unknown_error" },
      ok: false,
    });
  });

  it("rejects malformed identifiers", async () => {
    const result = await updateTeamCoverageMinimum({
      ...buildInput(),
      teamId: "not-a-uuid",
    });

    expect(result).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
  });
});

describe("listTeamCoverageMinimums", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the scoped teams for owners and admins", async () => {
    mocks.listTeamsWithCoverageMinimum.mockResolvedValue({
      ok: true,
      value: [buildTeam()],
    });

    const result = await listTeamCoverageMinimums({
      ...scope,
      actingRole: "owner",
    });

    expect(result).toEqual({ ok: true, value: [buildTeam()] });
    expect(mocks.listTeamsWithCoverageMinimum).toHaveBeenCalledWith(scope);
  });

  it("rejects other roles", async () => {
    const result = await listTeamCoverageMinimums({
      ...scope,
      actingRole: "manager",
    });

    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.listTeamsWithCoverageMinimum).not.toHaveBeenCalled();
  });
});
