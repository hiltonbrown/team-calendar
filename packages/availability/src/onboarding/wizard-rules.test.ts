import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  canFinish,
  isStepComplete,
  nextStep,
  type StageInput,
  type WizardInputs,
} from "./wizard-rules";

const done = new Date("2026-10-09T00:00:00.000Z");
const stage = (
  completedAt: Date | null,
  latestRunStatus: StageInput["latestRunStatus"] = null
) => ({ completedAt, latestRunStatus });

function inputs(overrides: Partial<WizardInputs> = {}): WizardInputs {
  return {
    actingUserLinked: true,
    completedAt: null,
    connection: {
      balances: stage(null),
      importRequestedAt: done,
      leave: stage(null),
      people: stage(done),
    },
    organisationTimezone: "Australia/Sydney",
    pendingMatches: 0,
    step: "people",
    xeroSkippedAt: null,
    ...overrides,
  };
}

describe("wizard rules", () => {
  it("derives mode with a connection overriding an earlier skip", () => {
    expect(buildSnapshot(inputs({ xeroSkippedAt: done })).mode).toBe("xero");
    expect(
      buildSnapshot(inputs({ connection: null, xeroSkippedAt: done })).mode
    ).toBe("manual");
    expect(buildSnapshot(inputs({ connection: null })).mode).toBe("undecided");
  });

  it("derives stage status from completion, runs and the import request", () => {
    const snapshot = buildSnapshot(
      inputs({
        connection: {
          balances: stage(null, "failed"),
          importRequestedAt: done,
          leave: stage(null, "running"),
          people: stage(done, "succeeded"),
        },
      })
    );
    expect(snapshot.import).toEqual({
      balances: "failed",
      leave: "running",
      people: "complete",
    });
    expect(
      buildSnapshot(
        inputs({
          connection: {
            balances: stage(null),
            importRequestedAt: null,
            leave: stage(null),
            people: stage(null),
          },
        })
      ).import.people
    ).toBe("not_started");
  });

  it("requires an Australian timezone to leave details", () => {
    expect(isStepComplete("details", buildSnapshot(inputs()))).toBe(true);
    expect(
      isStepComplete(
        "details",
        buildSnapshot(inputs({ organisationTimezone: "UTC" }))
      )
    ).toBe(false);
  });

  it("requires a Xero decision to leave the Xero step", () => {
    expect(
      isStepComplete("xero", buildSnapshot(inputs({ connection: null })))
    ).toBe(false);
    expect(
      isStepComplete(
        "xero",
        buildSnapshot(inputs({ connection: null, xeroSkippedAt: done }))
      )
    ).toBe(true);
  });

  it("blocks the people step while people import, matches pend or the user is unlinked", () => {
    expect(isStepComplete("people", buildSnapshot(inputs()))).toBe(true);
    expect(
      isStepComplete(
        "people",
        buildSnapshot(
          inputs({
            connection: {
              balances: stage(null),
              importRequestedAt: done,
              leave: stage(null),
              people: stage(null, "running"),
            },
          })
        )
      )
    ).toBe(false);
    expect(
      isStepComplete("people", buildSnapshot(inputs({ pendingMatches: 2 })))
    ).toBe(false);
    expect(
      isStepComplete(
        "people",
        buildSnapshot(inputs({ actingUserLinked: false }))
      )
    ).toBe(false);
    expect(
      isStepComplete(
        "people",
        buildSnapshot(inputs({ connection: null, xeroSkippedAt: done }))
      )
    ).toBe(true);
  });

  it("lets the admin past a failed people import", () => {
    expect(
      isStepComplete(
        "people",
        buildSnapshot(
          inputs({
            connection: {
              balances: stage(null),
              importRequestedAt: done,
              leave: stage(null),
              people: stage(null, "failed"),
            },
          })
        )
      )
    ).toBe(true);
  });

  it("finishes on leave complete, leave failed, manual mode or force", () => {
    const running = buildSnapshot(inputs());
    expect(canFinish(running, { force: false })).toBe(false);
    expect(canFinish(running, { force: true })).toBe(true);
    const withLeave = (status: "complete" | "failed") =>
      buildSnapshot(
        inputs({
          connection: {
            balances: stage(null),
            importRequestedAt: done,
            leave: status === "complete" ? stage(done) : stage(null, "failed"),
            people: stage(done),
          },
        })
      );
    expect(canFinish(withLeave("complete"), { force: false })).toBe(true);
    expect(canFinish(withLeave("failed"), { force: false })).toBe(true);
    expect(
      canFinish(
        buildSnapshot(inputs({ connection: null, xeroSkippedAt: done })),
        { force: false }
      )
    ).toBe(true);
  });

  it("orders steps and stops at finish", () => {
    expect(nextStep("details")).toBe("xero");
    expect(nextStep("invites")).toBe("finish");
    expect(nextStep("finish")).toBe("finish");
  });
});
