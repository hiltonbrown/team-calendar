import type { PreviewEvent } from "../projection/feed-projection";

export interface RenderFeedHtmlInput {
  events: PreviewEvent[];
  feedName: string;
  generatedAt?: Date;
}

export function renderFeedHtml(input: RenderFeedHtmlInput): string {
  const generatedAt = input.generatedAt ?? new Date();
  const events = [...input.events].sort(
    (first, second) =>
      first.startsAt.getTime() - second.startsAt.getTime() ||
      first.summary.localeCompare(second.summary)
  );

  return `<!doctype html>
<html lang="en-AU" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.feedName)} | LeaveSync</title>
  <style>
    :root {
      color-scheme: light dark;
      --primary: #336A3B;
      --primary-container: #6DA671;
      --on-primary-container: #1B3620;
      --secondary-container: #CAE8BC;
      --on-secondary-container: #2A3D24;
      --accent-container: #E5DFFF;
      --on-accent-container: #1F1551;
      --surface: #FCF8FF;
      --surface-container-lowest: #FFFFFF;
      --surface-container-low: #F6F1FF;
      --surface-container: #F1EBFD;
      --surface-container-high: #EBE5F7;
      --on-surface: #1C1A26;
      --on-surface-variant: #46454E;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --primary: #8FD496;
        --primary-container: #1F5226;
        --on-primary-container: #ABEDB0;
        --secondary-container: #374E2E;
        --on-secondary-container: #C8E6BB;
        --accent-container: #46398B;
        --on-accent-container: #E5DFFF;
        --surface: #131218;
        --surface-container-lowest: #0E0D13;
        --surface-container-low: #1C1B22;
        --surface-container: #211F26;
        --surface-container-high: #2B2931;
        --on-surface: #E6E1EC;
        --on-surface-variant: #C8C5D0;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--surface);
      color: var(--on-surface);
      font-family: "Plus Jakarta Sans", "Arial", sans-serif;
      line-height: 1.6;
    }

    .page-header {
      background: var(--surface-container-low);
      padding: 48px 24px 40px;
    }

    .page-header-inner,
    .calendar-shell {
      margin: 0 auto;
      max-width: 1120px;
    }

    h1 {
      margin: 0;
      font-size: 2.25rem;
      font-weight: 600;
      letter-spacing: 0;
      line-height: 1.2;
      text-wrap: balance;
    }

    .feed-meta {
      color: var(--on-surface-variant);
      font-size: 1rem;
      margin: 12px 0 0;
      max-width: 70ch;
    }

    .calendar-shell {
      display: grid;
      gap: 24px;
      padding: 32px 24px 48px;
    }

    .month-group {
      background: var(--surface-container-lowest);
      border-radius: 16px;
      padding: 24px;
    }

    .month-title {
      font-size: 1.375rem;
      font-weight: 500;
      line-height: 1.35;
      margin: 0 0 24px;
    }

    .event-list {
      display: grid;
      gap: 16px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .event {
      background: var(--surface-container);
      border-radius: 16px;
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(120px, 180px) 1fr;
      padding: 18px;
    }

    .event-time {
      color: var(--on-surface-variant);
      font-size: 0.875rem;
      font-weight: 500;
    }

    .event-summary {
      font-size: 1rem;
      font-weight: 500;
      line-height: 1.4;
      margin: 0;
    }

    .event-details {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .chip {
      background: var(--secondary-container);
      border-radius: 12px;
      color: var(--on-secondary-container);
      display: inline-flex;
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0;
      line-height: 1.3;
      padding: 3px 10px;
    }

    .chip-manual,
    .chip-holiday {
      background: var(--accent-container);
      color: var(--on-accent-container);
    }

    .empty {
      background: var(--surface-container-lowest);
      border-radius: 16px;
      color: var(--on-surface-variant);
      margin: 0;
      padding: 24px;
    }

    @media (max-width: 640px) {
      .page-header {
        padding: 36px 20px 32px;
      }

      h1 {
        font-size: 2rem;
      }

      .calendar-shell {
        padding: 24px 20px 40px;
      }

      .event {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header class="page-header">
    <div class="page-header-inner">
      <h1>${escapeHtml(input.feedName)}</h1>
      <p class="feed-meta">${events.length} ${events.length === 1 ? "event" : "events"} published by LeaveSync. Updated ${escapeHtml(formatDateTime(generatedAt))}.</p>
    </div>
  </header>
  <main class="calendar-shell">
    ${events.length === 0 ? renderEmptyState() : renderMonthGroups(events)}
  </main>
</body>
</html>`;
}

function renderMonthGroups(events: PreviewEvent[]): string {
  const groups = new Map<string, PreviewEvent[]>();
  for (const event of events) {
    const key = formatMonth(event.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return [...groups]
    .map(
      ([
        month,
        monthEvents,
      ]) => `<section class="month-group" aria-labelledby="${slugFor(month)}">
      <h2 class="month-title" id="${slugFor(month)}">${escapeHtml(month)}</h2>
      <ol class="event-list">
        ${monthEvents.map(renderEvent).join("\n        ")}
      </ol>
    </section>`
    )
    .join("\n    ");
}

function renderEvent(event: PreviewEvent): string {
  const chips = [
    renderRecordTypeChip(event),
    event.location ? renderChip(event.location) : null,
    event.contactabilityStatus
      ? renderChip(labelForContactability(event.contactabilityStatus))
      : null,
  ].filter((chip): chip is string => chip !== null);

  return `<li class="event">
          <time class="event-time" datetime="${escapeHtml(event.startsAt.toISOString())}">${escapeHtml(formatEventTime(event))}</time>
          <div>
            <p class="event-summary">${escapeHtml(event.summary)}</p>
            ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
            ${chips.length > 0 ? `<div class="event-details">${chips.join("")}</div>` : ""}
          </div>
        </li>`;
}

function renderRecordTypeChip(event: PreviewEvent): string {
  let className = "chip";
  if (event.isPublicHoliday) {
    className = "chip chip-holiday";
  } else if (usesAccentRecordType(event.recordType)) {
    className = "chip chip-manual";
  }
  return `<span class="${className}">${escapeHtml(labelForRecordType(event.recordType))}</span>`;
}

function renderChip(label: string): string {
  return `<span class="chip">${escapeHtml(label)}</span>`;
}

function renderEmptyState(): string {
  return '<p class="empty">No published availability events in this feed.</p>';
}

function formatEventTime(event: PreviewEvent): string {
  if (!event.allDay) {
    return `${formatDateTime(event.startsAt)} to ${formatDateTime(event.endsAt)}`;
  }

  const end = inclusiveAllDayEnd(event);
  const startLabel = formatDate(event.startsAt);
  const endLabel = formatDate(end);
  return startLabel === endLabel ? startLabel : `${startLabel} to ${endLabel}`;
}

function inclusiveAllDayEnd(event: PreviewEvent): Date {
  if (event.endsAt.getTime() <= event.startsAt.getTime()) {
    return event.startsAt;
  }

  const end = new Date(event.endsAt);
  end.setUTCDate(end.getUTCDate() - 1);
  return end;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(value);
}

function formatMonth(value: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(value);
}

function labelForRecordType(recordType: PreviewEvent["recordType"]): string {
  if (recordType === "public_holiday") {
    return "Public holiday";
  }
  return recordType
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function labelForContactability(
  contactability: NonNullable<PreviewEvent["contactabilityStatus"]>
): string {
  switch (contactability) {
    case "contactable":
      return "Contactable";
    case "limited":
      return "Limited contact";
    case "unavailable":
      return "Unavailable";
    case "use_alternative_contact":
      return "Use alternative contact";
    default:
      return contactability;
  }
}

function usesAccentRecordType(recordType: PreviewEvent["recordType"]): boolean {
  switch (recordType) {
    case "alternative_contact":
    case "another_office":
    case "client_site":
    case "contractor_unavailable":
    case "limited_availability":
    case "offsite_meeting":
    case "other":
    case "training":
    case "travel":
    case "travelling":
    case "wfh":
      return true;
    default:
      return false;
  }
}

function slugFor(value: string): string {
  return value.toLowerCase().replaceAll(" ", "-");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}
