import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyXeroInactivity,
  type XeroInactivityInputs,
} from "./inactivity-policy";

const importPattern = /^import /m;
const now = new Date("2026-09-26T00:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
const inactive: XeroInactivityInputs = {
  bindingReserved: true,
  feedLastUsedAt: ago(31),
  lastHumanActivityAt: ago(91),
  now,
  onboardingComplete: "unknown",
  organisationArchived: false,
  subscriptionActive: false,
  syncPaused: false,
};
describe("report-only inactivity policy", () => {
  it("active calendar feed with no login for six months remains active", () => {
    expect(
      classifyXeroInactivity({
        ...inactive,
        feedLastUsedAt: ago(1),
        lastHumanActivityAt: ago(180),
      }).kind
    ).toBe("active");
  });
  it("two-hour feed lag and exact thirty days count as use", () => {
    for (const days of [2 / 24, 30]) {
      expect(
        classifyXeroInactivity({ ...inactive, feedLastUsedAt: ago(days) }).kind
      ).toBe("active");
    }
  });
  it("paused sync, subscription and recent human activity independently prove active", () => {
    for (const change of [
      { syncPaused: true },
      { subscriptionActive: true },
      { lastHumanActivityAt: ago(90) },
    ]) {
      expect(classifyXeroInactivity({ ...inactive, ...change }).kind).toBe(
        "active"
      );
    }
  });
  it("requires reserved bindings and every known decision signal", () => {
    for (const change of [
      { bindingReserved: false },
      { subscriptionActive: "unknown" as const },
      { feedLastUsedAt: "unknown" as const },
      { lastHumanActivityAt: "unknown" as const },
    ]) {
      expect(classifyXeroInactivity({ ...inactive, ...change }).kind).toBe(
        "unknown"
      );
    }
  });
  it("unrelated unknown never overrides an active signal", () => {
    expect(
      classifyXeroInactivity({
        ...inactive,
        feedLastUsedAt: ago(1),
        lastHumanActivityAt: "unknown",
        subscriptionActive: "unknown",
      }).kind
    ).toBe("active");
  });
  it("archive cannot infer missing feed, subscription or human evidence", () => {
    for (const change of [
      { subscriptionActive: "unknown" as const },
      { feedLastUsedAt: "unknown" as const },
      { lastHumanActivityAt: "unknown" as const },
    ]) {
      expect(
        classifyXeroInactivity({
          ...inactive,
          organisationArchived: true,
          ...change,
        }).kind
      ).toBe("unknown");
    }
    expect(
      classifyXeroInactivity({ ...inactive, organisationArchived: true }).reason
    ).toContain("organisation archived");
  });
  it("classifies proven never-used signals with the policy reason", () => {
    expect(
      classifyXeroInactivity({
        ...inactive,
        feedLastUsedAt: null,
        lastHumanActivityAt: null,
      })
    ).toMatchObject({
      kind: "candidate",
      reason: expect.stringContaining("known inactive"),
    });
  });
  it("future and invalid dates cannot become candidates", () => {
    for (const date of [new Date(Number.NaN), ago(-1)]) {
      for (const field of ["feedLastUsedAt", "lastHumanActivityAt"] as const) {
        expect(
          classifyXeroInactivity({ ...inactive, [field]: date }).kind
        ).toBe("unknown");
      }
    }
  });
  it("is pure and has no runtime imports or scheduled-sync input", () => {
    expect(classifyXeroInactivity(inactive)).toEqual(
      classifyXeroInactivity(inactive)
    );
    const source = readFileSync(
      new URL("./inactivity-policy.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(importPattern);
    expect(source).not.toContain("syncSuccess");
  });
});
