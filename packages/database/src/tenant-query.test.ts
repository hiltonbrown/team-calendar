import { describe, expect, it } from "vitest";
import { scopedQuery, scopedTo } from "./tenant-query";

describe("scopedQuery", () => {
  it("returns both tenant keys", () => {
    expect(
      scopedQuery(
        "org_123" as never,
        "11111111-1111-4111-8111-111111111111" as never
      )
    ).toEqual({
      account_id: "org_123",
      organisation_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("returns exactly two keys and no others", () => {
    const result = scopedQuery(
      "org_123" as never,
      "11111111-1111-4111-8111-111111111111" as never
    );
    expect(Object.keys(result).sort()).toEqual([
      "account_id",
      "organisation_id",
    ]);
  });
});

describe("scopedTo", () => {
  it("returns both tenant keys from context object", () => {
    expect(
      scopedTo({
        accountId: "org_123",
        organisationId: "11111111-1111-4111-8111-111111111111",
      })
    ).toEqual({
      account_id: "org_123",
      organisation_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("returns exactly two keys and no others", () => {
    const result = scopedTo({
      accountId: "org_123",
      organisationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(Object.keys(result).sort()).toEqual([
      "account_id",
      "organisation_id",
    ]);
  });
});
