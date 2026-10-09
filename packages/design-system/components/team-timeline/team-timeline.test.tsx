import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TeamTimeline,
  type TeamTimelineBlock,
  type TeamTimelineDay,
  type TeamTimelineIcon,
  type TeamTimelineLinkProps,
  type TeamTimelineProps,
  type TeamTimelineRowProps,
  type TeamTimelineTone,
} from "./team-timeline";

afterEach(cleanup);

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function buildDays(
  overrides: Record<number, Partial<TeamTimelineDay>> = {}
): TeamTimelineDay[] {
  return DOW.map((dow, index) => ({
    dateLabel: `${5 + index} Oct`,
    dow,
    holidayName: null,
    isToday: false,
    key: `2026-10-${String(5 + index).padStart(2, "0")}`,
    ...overrides[index],
  }));
}

function buildBlock(
  overrides: Partial<TeamTimelineBlock> = {}
): TeamTimelineBlock {
  return {
    ariaLabel:
      "Sarah Mitchell: Annual leave, Monday 5 October 2026 to Wednesday 7 October 2026, Synced from Xero",
    dateLabel: "Mon 5 to Wed 7 Oct",
    dayCount: 3,
    durationLabel: "3 days",
    endIndex: 2,
    icon: "xero",
    id: "block-1",
    label: "Annual leave",
    note: "Family trip",
    provenanceLabel: "Synced from Xero",
    startIndex: 0,
    tone: "xero",
    ...overrides,
  };
}

function buildRow(
  overrides: Partial<TeamTimelineRowProps> = {}
): TeamTimelineRowProps {
  return {
    blocks: [buildBlock()],
    initials: "SM",
    isSelf: false,
    name: "Sarah Mitchell",
    personId: "person-1",
    secondary: "HR lead",
    ...overrides,
  };
}

function renderTimeline(overrides: Partial<TeamTimelineProps> = {}) {
  return render(
    <TeamTimeline
      cornerLabel="My team"
      days={buildDays({ 4: { isToday: true } })}
      footer={null}
      isCurrentWeek
      navigation={{
        nextHref: "?week=2026-10-12",
        previousHref: "?week=2026-09-28",
        todayHref: "?",
      }}
      rows={[buildRow()]}
      weekLabel="Mon 5 to Sun 11 Oct"
      weekSub="This week · 2026"
      {...overrides}
    />
  );
}

function blockButtons() {
  return [
    ...document.querySelectorAll<HTMLButtonElement>("[data-timeline-block]"),
  ];
}

describe("TeamTimeline", () => {
  it("renders the toolbar, legend, corner and day heads", () => {
    renderTimeline({
      days: buildDays({
        0: { holidayName: "King's Birthday" },
        4: { isToday: true },
      }),
    });
    expect(screen.getByText("Mon 5 to Sun 11 Oct")).toBeTruthy();
    expect(screen.getByText("This week · 2026")).toBeTruthy();
    const legend = screen.getByRole("group", { name: "Legend" });
    for (const label of [
      "Leave from Xero",
      "Leave request",
      "Manual: home, client site, training",
      "Public holiday",
    ]) {
      expect(legend.textContent).toContain(label);
    }
    expect(screen.getByText("My team")).toBeTruthy();
    for (const dow of DOW) {
      expect(screen.getByText(dow)).toBeTruthy();
    }
    expect(screen.getAllByText("Today")).toHaveLength(2);
    expect(screen.getByText("King's Birthday").className).toContain(
      "bg-warning-container"
    );
  });

  it("tints today and holiday columns only when present", () => {
    renderTimeline({ days: buildDays() });
    expect(document.querySelectorAll("[data-column-tint]")).toHaveLength(0);
    cleanup();
    renderTimeline({
      days: buildDays({ 0: { holidayName: "Holiday" }, 4: { isToday: true } }),
      rows: [buildRow(), buildRow({ personId: "person-2" })],
    });
    const tints = [...document.querySelectorAll("[data-column-tint]")];
    // One header and two row tints for each tinted day.
    expect(
      tints.filter((tint) => tint.getAttribute("data-column-tint") === "today")
    ).toHaveLength(3);
    expect(
      tints.filter(
        (tint) => tint.getAttribute("data-column-tint") === "holiday"
      )
    ).toHaveLength(3);
    expect(tints[0]?.getAttribute("style")).toContain("left: 0%");
  });

  it("places blocks and shows labels and day counts by span", () => {
    renderTimeline({
      rows: [
        buildRow({
          blocks: [
            buildBlock({
              ariaLabel: "One day",
              dayCount: 1,
              endIndex: 0,
              id: "a",
              label: "One",
            }),
            buildBlock({
              ariaLabel: "Two days",
              dayCount: 2,
              endIndex: 2,
              id: "b",
              label: "Two",
              startIndex: 1,
            }),
            buildBlock({
              ariaLabel: "Three days",
              dayCount: 3,
              endIndex: 6,
              id: "c",
              label: "Three",
              startIndex: 4,
            }),
          ],
        }),
      ],
    });
    const one = screen.getByRole("button", { name: "One day" });
    const two = screen.getByRole("button", { name: "Two days" });
    const three = screen.getByRole("button", { name: "Three days" });
    expect(one.style.gridColumn).toBe("1 / span 1");
    expect(two.style.gridColumn).toBe("2 / span 2");
    expect(three.style.gridColumn).toBe("5 / span 3");
    expect(one.textContent).toBe("");
    expect(two.textContent).toBe("Two");
    expect(three.textContent).toBe("Three3d");
    const dayCount = [...three.querySelectorAll("span")].find(
      (span) => span.textContent === "3d"
    );
    expect(dayCount?.className).toContain("max-md:hidden");
  });

  it.each([
    ["xero", "bg-secondary"],
    ["manual", "bg-accent-container"],
    ["leave_request", "bg-accent-container"],
    ["private", "bg-surface-container-high"],
  ] as const)("styles the %s tone", (tone: TeamTimelineTone, fill) => {
    renderTimeline({ rows: [buildRow({ blocks: [buildBlock({ tone })] })] });
    expect(blockButtons()[0]?.classList.contains(fill)).toBe(true);
  });

  it.each([
    ["xero", "lucide-refresh-cw"],
    ["home", "lucide-house"],
    ["client", "lucide-briefcase"],
    ["training", "lucide-graduation-cap"],
    ["travel", "lucide-plane"],
    ["other", "lucide-circle"],
    ["private", "lucide-eye-off"],
    ["leave_request", "lucide-calendar-check"],
  ] as const)("renders the %s icon", (icon: TeamTimelineIcon, className) => {
    renderTimeline({ rows: [buildRow({ blocks: [buildBlock({ icon })] })] });
    expect(blockButtons()[0]?.querySelector(`.${className}`)).not.toBeNull();
  });

  it("opens the detail strip and returns focus to the block on close", () => {
    renderTimeline();
    expect(
      screen.getByText(
        "Select any entry above to see its details, owner and provenance."
      )
    ).toBeTruthy();
    const [block] = blockButtons();
    if (!block) {
      throw new Error("Expected a block");
    }
    expect(block.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(block);
    expect(block.getAttribute("aria-expanded")).toBe("true");
    const details = screen.getByRole("region", {
      name: "Selected availability entry details",
    });
    expect(block.getAttribute("aria-controls")).toBe(details.id);
    expect(details.textContent).toContain("Sarah Mitchell · Annual leave");
    expect(details.textContent).toContain(
      "Mon 5 to Wed 7 Oct·3 days·HR lead·Family trip"
    );
    const chip = screen.getByText("Synced from Xero");
    expect(chip.querySelector(".lucide-refresh-cw")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(document.activeElement).toBe(block);
    expect(block.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.getByText(
        "Select any entry above to see its details, owner and provenance."
      )
    ).toBeTruthy();
  });

  it("shows the matching provenance icon for each tone", () => {
    renderTimeline({
      rows: [
        buildRow({
          blocks: [
            buildBlock({
              id: "m",
              provenanceLabel: "Manual entry",
              tone: "manual",
            }),
            buildBlock({
              id: "l",
              provenanceLabel: "Leave request",
              startIndex: 3,
              tone: "leave_request",
            }),
          ],
        }),
      ],
    });
    const [manual, leave] = blockButtons();
    if (!(manual && leave)) {
      throw new Error("Expected two blocks");
    }
    fireEvent.click(manual);
    expect(
      screen.getByText("Manual entry").querySelector(".lucide-pencil")
    ).not.toBeNull();
    fireEvent.click(leave);
    expect(manual.getAttribute("aria-expanded")).toBe("false");
    const details = screen.getByRole("region", {
      name: "Selected availability entry details",
    });
    const chip = [...details.querySelectorAll("span")].find(
      (span) => span.textContent === "Leave request"
    );
    expect(chip?.querySelector(".lucide-calendar-check")).not.toBeNull();
  });

  it("moves focus between blocks with the arrow keys", () => {
    renderTimeline({
      rows: [
        buildRow({
          blocks: [
            buildBlock({ id: "a" }),
            buildBlock({ id: "b", startIndex: 4 }),
          ],
        }),
        buildRow({ blocks: [buildBlock({ id: "c" })], personId: "person-2" }),
      ],
    });
    const [first, second, third] = blockButtons();
    if (!(first && second && third)) {
      throw new Error("Expected three blocks");
    }
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: "ArrowRight" });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(third, { key: "ArrowRight" });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(third, { key: "ArrowDown" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(third, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(second);
  });

  it("uses renderLink for navigation and marks the current week", () => {
    const renderLink = vi.fn(
      ({ children, ...props }: TeamTimelineLinkProps) => (
        <a data-custom-link="" {...props}>
          {children}
        </a>
      )
    );
    renderTimeline({ renderLink });
    expect(renderLink).toHaveBeenCalledTimes(3);
    const previous = screen.getByRole("link", { name: "Previous week" });
    const next = screen.getByRole("link", { name: "Next week" });
    const today = screen.getByRole("link", { name: "Today" });
    expect(previous.getAttribute("href")).toBe("?week=2026-09-28");
    expect(next.getAttribute("href")).toBe("?week=2026-10-12");
    expect(today.getAttribute("href")).toBe("?");
    for (const link of [previous, next, today]) {
      expect(link.hasAttribute("data-custom-link")).toBe(true);
      expect(link.className).toContain("focus-visible:outline-3");
    }
    expect(today.classList.contains("bg-secondary")).toBe(true);
    cleanup();
    renderTimeline({ isCurrentWeek: false });
    const plainToday = screen.getByRole("link", { name: "Today" });
    expect(plainToday.classList.contains("bg-secondary")).toBe(false);
  });

  it("renders the row details, footer and swipe hint", () => {
    renderTimeline({
      footer: "Showing 12 of 31 people.",
      rows: [buildRow({ isSelf: true })],
    });
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("HR lead")).toBeTruthy();
    expect(screen.getByText("SM").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Showing 12 of 31 people.")).toBeTruthy();
    const hint = screen.getByText("Swipe to see the full week");
    expect(hint.classList.contains("md:hidden")).toBe(true);
    expect(hint.getAttribute("aria-hidden")).toBe("true");
  });

  it("respects reduced motion on block presses", () => {
    renderTimeline();
    const [block] = blockButtons();
    expect(block?.className).toContain("motion-reduce:transition-none");
    expect(block?.className).toContain("motion-reduce:active:translate-y-0");
  });
});
