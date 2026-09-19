export type ActiveRunState = "acquired" | "interrupted";
export type LiveRunMode =
  | "new"
  | "preacquired"
  | "recover"
  | "recover-if-owned";

export const resolveLiveRunAction = (
  state: ActiveRunState,
  mode: LiveRunMode
): "cleanup" | "release-noop" | "run" => {
  if (mode === "recover") {
    if (state === "acquired") {
      throw new Error("No interrupted release run exists for recovery");
    }
    return "cleanup";
  }
  if (mode === "recover-if-owned") {
    return state === "interrupted" ? "cleanup" : "release-noop";
  }
  if (state === "interrupted") {
    throw new Error(
      "Interrupted release run detected; rerun with --recover to reconcile it"
    );
  }
  return "run";
};
