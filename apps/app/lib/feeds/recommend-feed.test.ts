import type { FeedListItem } from "@repo/feeds";
import { describe, expect, it } from "vitest";
import { recommendFeed } from "./recommend-feed";

let sequence = 0;
function feed(overrides: Partial<FeedListItem> = {}): FeedListItem {
  sequence += 1;
  return {
    activeTokenHint: null,
    createdAt: new Date(`2026-01-${String(sequence).padStart(2, "0")}`),
    createdByName: null,
    createdByUserId: "user_admin",
    description: null,
    id: `feed_${sequence}`,
    includesPublicHolidays: false,
    isOwnedByActor: false,
    kind: "organisation",
    lastFetchedAt: null,
    lastRenderedAt: null,
    name: `Feed ${sequence}`,
    privacyMode: "named",
    scopeCount: 1,
    scopeSummary: "All organisation",
    status: "active",
    subscribeUrl: `https://api.test/ical/${sequence}.ics`,
    ...overrides,
  };
}

describe("recommendFeed", () => {
  it("prefers the person's own personal feed, then team, then organisation", () => {
    const org = feed();
    const team = feed({ isOwnedByActor: true, kind: "manager_team" });
    const personal = feed({ isOwnedByActor: true, kind: "personal" });
    expect(recommendFeed([org, team, personal]).recommended?.id).toBe(
      personal.id
    );
    expect(recommendFeed([org, team]).recommended?.id).toBe(team.id);
    expect(recommendFeed([org]).recommended?.id).toBe(org.id);
  });

  it("picks the oldest organisation feed and falls back to name order", () => {
    const older = feed({ createdAt: new Date("2025-01-01"), name: "Zed" });
    const newer = feed({ createdAt: new Date("2025-06-01"), name: "Alpha" });
    expect(recommendFeed([newer, older]).recommended?.id).toBe(older.id);
    const teamB = feed({ kind: "team", name: "Bravo" });
    const teamA = feed({ kind: "team", name: "Alpha" });
    expect(recommendFeed([teamB, teamA]).recommended?.id).toBe(teamA.id);
  });

  it("never recommends paused, archived or URL-less feeds and reports an own paused feed", () => {
    const paused = feed({
      isOwnedByActor: true,
      kind: "personal",
      status: "paused",
    });
    const archived = feed({ status: "archived" });
    const noUrl = feed({ subscribeUrl: null });
    const org = feed();
    const result = recommendFeed([paused, archived, noUrl, org]);
    expect(result.recommended?.id).toBe(org.id);
    expect(result.ownPausedFeed?.id).toBe(paused.id);
    expect(result.others.map((item) => item.id)).not.toContain(archived.id);
  });

  it("lists other usable feeds without the recommended one or other people's own feeds", () => {
    const org = feed({ name: "All staff" });
    const team = feed({ kind: "team", name: "Sales" });
    const someoneElsesPersonal = feed({ kind: "personal", name: "Ava's" });
    const someoneElsesTeam = feed({ kind: "manager_team", name: "Dan's team" });
    const result = recommendFeed([
      someoneElsesTeam,
      team,
      org,
      someoneElsesPersonal,
    ]);
    expect(result.recommended?.id).toBe(org.id);
    expect(result.others.map((item) => item.id)).toEqual([team.id]);
  });

  it("returns nothing when no feed is usable", () => {
    expect(recommendFeed([])).toEqual({
      others: [],
      ownPausedFeed: null,
      recommended: null,
    });
  });
});
