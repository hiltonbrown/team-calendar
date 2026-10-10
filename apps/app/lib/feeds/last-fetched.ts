const STALE_AFTER_DAYS = 30;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relativeFormat = new Intl.RelativeTimeFormat("en-AU", {
  numeric: "auto",
});

export interface LastFetchedDescription {
  flag: "never" | "stale" | null;
  relative: string;
}

// "Last fetched" is the latest time a calendar app pulled the feed's active
// token. Only active feeds are expected to be fetched, so paused and archived
// feeds never carry a staleness flag.
export function describeLastFetched(input: {
  lastFetchedAt: Date | null;
  now: Date;
  status: "active" | "archived" | "paused";
}): LastFetchedDescription {
  const isActive = input.status === "active";
  if (!input.lastFetchedAt) {
    return { flag: isActive ? "never" : null, relative: "Never fetched" };
  }
  const elapsed = input.now.getTime() - input.lastFetchedAt.getTime();
  return {
    flag: isActive && elapsed > STALE_AFTER_DAYS * DAY ? "stale" : null,
    relative: formatRelative(elapsed),
  };
}

function formatRelative(elapsed: number): string {
  if (elapsed < HOUR) {
    return relativeFormat.format(
      -Math.max(1, Math.round(elapsed / MINUTE)),
      "minute"
    );
  }
  if (elapsed < DAY) {
    return relativeFormat.format(-Math.round(elapsed / HOUR), "hour");
  }
  const days = Math.round(elapsed / DAY);
  if (days < 7) {
    return relativeFormat.format(-days, "day");
  }
  if (days < 30) {
    return relativeFormat.format(-Math.round(days / 7), "week");
  }
  if (days < 365) {
    return relativeFormat.format(-Math.round(days / 30), "month");
  }
  return relativeFormat.format(-Math.round(days / 365), "year");
}
