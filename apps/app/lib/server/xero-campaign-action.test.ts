import { XeroCampaignDeniedError } from "@repo/database/xero-campaign-contract";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ action: vi.fn(), headers: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@repo/database/xero-campaign-access", () => ({
  withXeroCampaignAction: mocks.action,
}));
const { withAuthenticatedXeroCampaignAction } = await import(
  "./xero-campaign-action"
);
const scope = {
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  userId: "manager_1",
};
const campaign = {
  dispatchId: "00000000-0000-4000-8000-000000000002",
  epoch: 1,
  runId: "00000000-0000-4000-8000-000000000003",
};
describe("authenticated action admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.action.mockImplementation((_id, _scope, operation) => operation());
  });
  it("passes exact authenticated scope and validated target through the complete operation", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({ "x-teamcalendar-xero-campaign": JSON.stringify(campaign) })
    );
    const persisted = vi.fn();
    const result = await withAuthenticatedXeroCampaignAction(
      "leave.approve",
      scope,
      { optional: undefined, recordId: "record_1" },
      async () => {
        await Promise.resolve();
        persisted();
        return { ok: true, value: 1 };
      }
    );
    expect(result).toEqual({ ok: true, value: 1 });
    expect(persisted).toHaveBeenCalledOnce();
    expect(mocks.action).toHaveBeenCalledWith(
      "leave.approve",
      { ...scope, campaign, target: { recordId: "record_1" } },
      expect.any(Function)
    );
  });
  it.each([
    "bad",
    JSON.stringify({ ...campaign, actor: "forged" }),
    "x".repeat(1025),
  ])("denies malformed authority before the operation", async (encoded) => {
    mocks.headers.mockResolvedValue(
      new Headers({ "x-teamcalendar-xero-campaign": encoded })
    );
    const op = vi.fn();
    expect(
      await withAuthenticatedXeroCampaignAction("leave.submit", scope, {}, op)
    ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
    expect(op).not.toHaveBeenCalled();
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("preserves ordinary provider-neutral operations but propagates reserved-scope denial", async () => {
    const op = vi.fn().mockResolvedValue({ ok: true, value: 1 });
    expect(
      (
        await withAuthenticatedXeroCampaignAction(
          "leave.create-local",
          scope,
          {},
          op
        )
      ).ok
    ).toBe(true);
    mocks.action.mockRejectedValueOnce(new XeroCampaignDeniedError());
    op.mockClear();
    expect(
      await withAuthenticatedXeroCampaignAction(
        "leave.create-local",
        scope,
        {},
        op
      )
    ).toEqual({
      error: {
        code: "not_authorised",
        message: "This action is temporarily unavailable. Try again later.",
      },
      ok: false,
    });
    expect(op).not.toHaveBeenCalled();
  });
});
