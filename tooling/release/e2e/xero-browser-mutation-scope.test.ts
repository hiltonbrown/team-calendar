import { describe, expect, it } from "vitest";
import {
  assertXeroBrowserMutationPage,
  assertXeroBrowserMutationRequest,
  type XeroBrowserMutationScope,
} from "./xero-browser-mutation-scope.js";

const scope: XeroBrowserMutationScope = {
  action: "approve",
  dateFrom: "2026-10-01",
  dateUntil: "2026-10-02",
  employeeId: null,
  leaveTypeId: null,
  organisationId: "00000000-0000-4000-8000-000000000001",
  recordId: "00000000-0000-4000-8000-000000000002",
};
describe("browser mutation payroll scope", () => {
  it("rejects a same-account foreign payroll entity before any click", () => {
    expect(() =>
      assertXeroBrowserMutationPage(
        "https://app.example/leave-approvals?org=00000000-0000-4000-8000-000000000009",
        "https://app.example",
        scope
      )
    ).toThrow("foreign payroll scope");
  });
  it("rejects a foreign record, absent scope or opaque action body before dispatch", () => {
    expect(() =>
      assertXeroBrowserMutationRequest(
        [
          {
            organisationId: scope.organisationId,
            recordId: "00000000-0000-4000-8000-000000000009",
          },
        ],
        scope
      )
    ).toThrow();
    expect(() => assertXeroBrowserMutationRequest([{}], scope)).toThrow();
    expect(() => assertXeroBrowserMutationRequest("opaque", scope)).toThrow();
  });
  it("admits only an exact scoped route and body", () => {
    expect(() =>
      assertXeroBrowserMutationPage(
        `https://app.example/leave-approvals?org=${scope.organisationId}`,
        "https://app.example",
        scope
      )
    ).not.toThrow();
    expect(() =>
      assertXeroBrowserMutationRequest(
        [{ organisationId: scope.organisationId, recordId: scope.recordId }],
        scope
      )
    ).not.toThrow();
  });
  it.each(["personId", "leaveTypeId", "unexpected"])(
    "rejects foreign or unknown %s payload fields instead of stripping them",
    (field) => {
      expect(() =>
        assertXeroBrowserMutationRequest(
          [
            {
              organisationId: scope.organisationId,
              recordId: scope.recordId,
              [field]: "00000000-0000-4000-8000-000000000009",
            },
          ],
          { ...scope, action: "create" }
        )
      ).toThrow();
    }
  );
});
