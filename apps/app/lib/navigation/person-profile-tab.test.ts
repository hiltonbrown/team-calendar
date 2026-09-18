import { describe, expect, it } from "vitest";
import { parsePersonProfileTab } from "./person-profile-tab";

describe("parsePersonProfileTab", () => {
  it.each(["alternative_contacts", "balances", "history", "upcoming"] as const)(
    "accepts the %s profile tab",
    (tab) => {
      expect(parsePersonProfileTab(tab)).toBe(tab);
    }
  );

  it("uses the first repeated value", () => {
    expect(parsePersonProfileTab(["balances", "history"])).toBe("balances");
  });

  it("falls back to Upcoming for missing or unknown values", () => {
    expect(parsePersonProfileTab(undefined)).toBe("upcoming");
    expect(parsePersonProfileTab("unknown")).toBe("upcoming");
  });
});
