import { describe, expect, it } from "vitest";
import { buildCoverageDays } from "./coverage-timeline-data";

type TeamTodayData = Parameters<typeof buildCoverageDays>[0];

function makeTeamToday(overrides: Partial<TeamTodayData> = {}): TeamTodayData {
  return {
    ctaUrl: "/calendar",
    peopleAvailableCount: 6,
    peopleNeedingAttention: [],
    peopleOnLeaveCount: 0,
    peopleOtherOooCount: 0,
    peopleTravellingCount: 0,
    peopleWithXeroSyncFailedCount: 0,
    peopleWorkingFromHomeCount: 0,
    ...overrides,
  };
}

function attentionPerson(firstName: string, lastName: string) {
  return {
    approvalStatus: null,
    contactabilityStatus: null,
    endsAt: null,
    personFirstName: firstName,
    personId: `${firstName}-${lastName}`,
    personLastName: lastName,
    recordType: null,
    startsAt: null,
    statusKey: "on_leave" as const,
    statusLabel: "On leave",
    xeroSyncFailedCount: 0,
  };
}

describe("buildCoverageDays", () => {
  it("returns a 14-day series", () => {
    const { days } = buildCoverageDays(makeTeamToday(), null);
    expect(days).toHaveLength(14);
  });

  it("totals every person in scope and counts only unavailable as away today", () => {
    const { days, total } = buildCoverageDays(
      makeTeamToday({
        peopleAvailableCount: 6,
        peopleOnLeaveCount: 2,
        peopleTravellingCount: 1,
        peopleWorkingFromHomeCount: 1,
      }),
      null
    );

    expect(total).toBe(10);
    expect(days[0].awayCount).toBe(4);
  });

  it("names the people it can and tracks the rest as extra", () => {
    const { days } = buildCoverageDays(
      makeTeamToday({
        peopleOnLeaveCount: 3,
        peopleNeedingAttention: [attentionPerson("Mei", "Lin")],
      }),
      null
    );

    expect(days[0].names).toEqual(["Mei Lin"]);
    expect(days[0].extraCount).toBe(2);
  });

  it("places a forecast peak on its matching future day and leaves others at baseline", () => {
    const peakDate = new Date();
    peakDate.setHours(0, 0, 0, 0);
    peakDate.setDate(peakDate.getDate() + 3);

    const { days } = buildCoverageDays(makeTeamToday(), [
      {
        date: peakDate,
        peopleAwayCount: 5,
        percentage: 50,
        recordTypes: [],
        totalPeopleInScope: 10,
      },
    ]);

    expect(days[3].awayCount).toBe(5);
    expect(days[3].extraCount).toBe(5);
    expect(days[1].awayCount).toBe(0);
    expect(days[2].awayCount).toBe(0);
  });
});
