import { describe, expect, it } from "vitest";
import { feedKind, isFeedOwner, ownFeedScopeType } from "./feed-ownership";

const owner = "user_owner";

describe("isFeedOwner", () => {
  it("accepts the creator of a personal feed", () => {
    expect(
      isFeedOwner(
        { createdByUserId: owner, scopes: [{ scopeType: "self" }] },
        owner
      )
    ).toBe(true);
  });

  it("accepts the creator of a manager team feed", () => {
    expect(
      isFeedOwner(
        { createdByUserId: owner, scopes: [{ scopeType: "manager_team" }] },
        owner
      )
    ).toBe(true);
  });

  it("rejects another user", () => {
    expect(
      isFeedOwner(
        { createdByUserId: owner, scopes: [{ scopeType: "self" }] },
        "user_other"
      )
    ).toBe(false);
  });

  it("rejects an org feed created by a since-demoted admin", () => {
    expect(
      isFeedOwner(
        { createdByUserId: owner, scopes: [{ scopeType: "org" }] },
        owner
      )
    ).toBe(false);
  });

  it("rejects mixed scopes that include an admin-only scope", () => {
    expect(
      isFeedOwner(
        {
          createdByUserId: owner,
          scopes: [{ scopeType: "self" }, { scopeType: "team" }],
        },
        owner
      )
    ).toBe(false);
  });

  it("rejects feeds without scopes or creator", () => {
    expect(isFeedOwner({ createdByUserId: owner, scopes: [] }, owner)).toBe(
      false
    );
    expect(
      isFeedOwner(
        { createdByUserId: null, scopes: [{ scopeType: "self" }] },
        owner
      )
    ).toBe(false);
  });
});

describe("feedKind", () => {
  it("classifies feeds by scope", () => {
    expect(feedKind([{ scopeType: "org" }])).toBe("organisation");
    expect(feedKind([{ scopeType: "team" }])).toBe("team");
    expect(feedKind([{ scopeType: "person" }])).toBe("person");
    expect(feedKind([{ scopeType: "self" }])).toBe("personal");
    expect(feedKind([{ scopeType: "manager_team" }])).toBe("manager_team");
    expect(feedKind([{ scopeType: "team" }, { scopeType: "person" }])).toBe(
      "mixed"
    );
    expect(feedKind([{ scopeType: "org" }, { scopeType: "team" }])).toBe(
      "organisation"
    );
  });
});

describe("ownFeedScopeType", () => {
  it("maps own feed kinds to their single scope type", () => {
    expect(ownFeedScopeType("personal")).toBe("self");
    expect(ownFeedScopeType("team")).toBe("manager_team");
  });
});
