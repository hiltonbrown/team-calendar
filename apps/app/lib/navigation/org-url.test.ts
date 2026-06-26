import { describe, expect, it } from "vitest";
import {
  getOrgFromSearchParams,
  preserveOrgQueryParam,
  withOrg,
} from "./org-url";

const orgId = "00000000-0000-4000-8000-000000000100";

describe("org-aware URLs", () => {
  it("adds the org query parameter to plain app paths", () => {
    expect(withOrg("/calendar", orgId)).toBe(`/calendar?org=${orgId}`);
  });

  it("leaves clean app links clean when no explicit org query exists", () => {
    expect(withOrg("/calendar", null)).toBe("/calendar");
  });

  it("preserves existing query parameters and hash fragments", () => {
    expect(withOrg("/calendar?week=2026-04-20#team", orgId)).toBe(
      `/calendar?week=2026-04-20&org=${orgId}#team`
    );
  });

  it("does not rewrite external URLs", () => {
    expect(withOrg("https://teamcalendar.online", orgId)).toBe(
      "https://teamcalendar.online"
    );
  });

  it("reads a non-empty org param", () => {
    expect(getOrgFromSearchParams(new URLSearchParams(`org=${orgId}`))).toBe(
      orgId
    );
  });

  it("preserves explicit org in filter params", () => {
    const params = new URLSearchParams("week=2026-04-20");
    preserveOrgQueryParam(params, orgId);
    expect(params.toString()).toBe(`week=2026-04-20&org=${orgId}`);
  });

  it("removes org from filter params when routing uses Clerk cookie state", () => {
    const params = new URLSearchParams(`week=2026-04-20&org=${orgId}`);
    preserveOrgQueryParam(params, null);
    expect(params.toString()).toBe("week=2026-04-20");
  });
});
