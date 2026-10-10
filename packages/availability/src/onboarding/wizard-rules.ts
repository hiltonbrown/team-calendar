import type { OnboardingStep } from "@repo/database/queries/onboarding";

export type StageStatus = "complete" | "failed" | "not_started" | "running";
export type WizardMode = "manual" | "undecided" | "xero";

export interface StageInput {
  completedAt: Date | null;
  /** Latest sync run of this type for the connection, newest first. */
  latestRunStatus:
    | "cancelled"
    | "failed"
    | "partial_success"
    | "running"
    | "succeeded"
    | null;
}

export interface WizardInputs {
  actingUserLinked: boolean;
  completedAt: Date | null;
  connection: {
    balances: StageInput;
    importRequestedAt: Date | null;
    leave: StageInput;
    people: StageInput;
  } | null;
  organisationTimezone: string | null;
  pendingMatches: number;
  step: OnboardingStep;
  xeroSkippedAt: Date | null;
}

export interface WizardSnapshot {
  actingUserLinked: boolean;
  completed: boolean;
  import: {
    balances: StageStatus;
    leave: StageStatus;
    people: StageStatus;
  };
  mode: WizardMode;
  pendingMatches: number;
  step: OnboardingStep;
  timezoneConfirmed: boolean;
}

export const STEP_ORDER: readonly OnboardingStep[] = [
  "details",
  "xero",
  "people",
  "invites",
  "finish",
];

export function stepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  return (
    STEP_ORDER[Math.min(stepIndex(step) + 1, STEP_ORDER.length - 1)] ?? step
  );
}

// A connected Xero file always wins over an earlier "Set up without Xero"
// choice, so connecting later needs no extra bookkeeping.
export function deriveMode(inputs: WizardInputs): WizardMode {
  if (inputs.connection) {
    return "xero";
  }
  return inputs.xeroSkippedAt ? "manual" : "undecided";
}

export function deriveStage(
  stage: StageInput,
  importRequestedAt: Date | null
): StageStatus {
  if (stage.completedAt) {
    return "complete";
  }
  // A partial run leaves no full watermark, so it would otherwise read as
  // running forever and hold the admin on the people step.
  if (
    stage.latestRunStatus === "failed" ||
    stage.latestRunStatus === "cancelled" ||
    stage.latestRunStatus === "partial_success"
  ) {
    return "failed";
  }
  if (stage.latestRunStatus === "running" || importRequestedAt) {
    return "running";
  }
  return "not_started";
}

export function buildSnapshot(inputs: WizardInputs): WizardSnapshot {
  const { connection } = inputs;
  const stage = (key: "balances" | "leave" | "people"): StageStatus =>
    connection
      ? deriveStage(connection[key], connection.importRequestedAt)
      : "not_started";
  return {
    actingUserLinked: inputs.actingUserLinked,
    completed: inputs.completedAt !== null,
    import: {
      balances: stage("balances"),
      leave: stage("leave"),
      people: stage("people"),
    },
    mode: deriveMode(inputs),
    pendingMatches: inputs.pendingMatches,
    step: inputs.step,
    timezoneConfirmed: Boolean(
      inputs.organisationTimezone?.startsWith("Australia/")
    ),
  };
}

// Server-side completion rule for leaving each step (spec section 5).
export function isStepComplete(
  step: OnboardingStep,
  snapshot: WizardSnapshot
): boolean {
  switch (step) {
    case "details":
      return snapshot.timezoneConfirmed;
    case "xero":
      return snapshot.mode !== "undecided";
    case "people":
      if (!snapshot.actingUserLinked) {
        return false;
      }
      // A failed people import must not trap the admin; they continue and
      // review people once the scheduled sync recovers.
      return (
        snapshot.mode === "manual" ||
        ((snapshot.import.people === "complete" ||
          snapshot.import.people === "failed") &&
          snapshot.pendingMatches === 0)
      );
    case "invites":
      return true;
    default:
      return canFinish(snapshot, { force: false });
  }
}

// A failed or slow import never traps the user: failure completes, and
// "Open calendar now" forces completion while the import keeps running.
export function canFinish(
  snapshot: WizardSnapshot,
  options: { force: boolean }
): boolean {
  if (options.force || snapshot.mode === "manual") {
    return true;
  }
  return (
    snapshot.import.leave === "complete" || snapshot.import.leave === "failed"
  );
}
