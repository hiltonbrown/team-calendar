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

describe("connection mutation wire contracts", () => {
  const connect: XeroBrowserMutationScope = {
    ...scope,
    action: "connect",
    recordId: null,
  };
  const disconnect: XeroBrowserMutationScope = {
    ...connect,
    action: "disconnect",
    confirmationText: "Owned payroll company",
    connectionId: "00000000-0000-4000-8000-000000000003",
    disconnectMode: "soft",
  };
  const payload = {
    confirmationText: disconnect.confirmationText,
    connectionId: disconnect.connectionId,
    mode: disconnect.disconnectMode,
    organisationId: disconnect.organisationId,
  };
  it("admits the exact client connect payload without a leave record", () => {
    expect(() =>
      assertXeroBrowserMutationRequest(
        [{ organisationId: connect.organisationId }],
        connect
      )
    ).not.toThrow();
    expect(() =>
      assertXeroBrowserMutationRequest(
        [{ organisationId: connect.organisationId, recordId: scope.recordId }],
        connect
      )
    ).toThrow();
    expect(() =>
      assertXeroBrowserMutationRequest(
        [{ organisationId: scope.recordId }],
        connect
      )
    ).toThrow();
  });
  it.each(["soft", "destructive"] as const)(
    "admits exact %s disconnect metadata",
    (mode) => {
      expect(() =>
        assertXeroBrowserMutationRequest([{ ...payload, mode }], {
          ...disconnect,
          disconnectMode: mode,
        })
      ).not.toThrow();
    }
  );
  it.each([
    ["connectionId", scope.recordId],
    ["organisationId", scope.recordId],
    ["mode", "destructive"],
    ["confirmationText", "Other company"],
    ["confirmationText", " Owned payroll company "],
    ["recordId", scope.recordId],
  ])("denies altered or extra %s", (field, value) => {
    expect(() =>
      assertXeroBrowserMutationRequest(
        [{ ...payload, [field]: value }],
        disconnect
      )
    ).toThrow();
  });
  it("denies missing private intent and opaque or incomplete disconnect bodies", () => {
    expect(() =>
      assertXeroBrowserMutationRequest([payload], {
        ...connect,
        action: "disconnect",
      })
    ).toThrow();
    for (const field of Object.keys(payload)) {
      const incomplete = Object.fromEntries(
        Object.entries(payload).filter(([key]) => key !== field)
      );
      expect(() =>
        assertXeroBrowserMutationRequest([incomplete], disconnect)
      ).toThrow();
    }
    for (const value of [
      "opaque",
      { 0: payload },
      [payload, payload],
      ["$1"],
      [null],
    ]) {
      expect(() =>
        assertXeroBrowserMutationRequest(value, disconnect)
      ).toThrow();
    }
  });
  it("denies ambiguous organisation pages and connection plans carrying leave IDs", () => {
    const page = `https://app.example/settings/integrations/xero?org=${connect.organisationId}`;
    expect(() =>
      assertXeroBrowserMutationPage(page, "https://app.example", disconnect)
    ).not.toThrow();
    expect(() =>
      assertXeroBrowserMutationPage(
        `${page}&org=${connect.organisationId}`,
        "https://app.example",
        disconnect
      )
    ).toThrow();
    expect(() =>
      assertXeroBrowserMutationPage(page, "https://app.example", {
        ...connect,
        recordId: scope.recordId,
      })
    ).toThrow();
    expect(() =>
      assertXeroBrowserMutationRequest(
        [{ organisationId: scope.organisationId, recordId: scope.recordId }],
        { ...scope, recordId: null }
      )
    ).toThrow();
  });
});
