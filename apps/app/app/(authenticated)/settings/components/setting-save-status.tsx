export type SettingSaveState = "error" | "idle" | "saved" | "saving";

export function SettingSaveStatus({
  id,
  state,
}: {
  id: string;
  state: SettingSaveState;
}) {
  return (
    <p
      aria-live="polite"
      className={
        state === "error"
          ? "min-h-5 text-destructive text-xs"
          : "min-h-5 text-muted-foreground text-xs"
      }
      id={id}
    >
      {statusLabel(state)}
    </p>
  );
}

function statusLabel(state: SettingSaveState) {
  if (state === "saving") {
    return "Saving…";
  }
  if (state === "saved") {
    return "Saved";
  }
  if (state === "error") {
    return "Not saved. Try again.";
  }
  return "Changes save automatically.";
}
