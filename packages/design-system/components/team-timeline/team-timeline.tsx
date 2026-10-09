"use client";

import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowUpRightIcon,
  BriefcaseIcon,
  CalendarCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  EyeOffIcon,
  GraduationCapIcon,
  HouseIcon,
  type LucideIcon,
  PencilIcon,
  PlaneIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import {
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

export type TeamTimelineTone = "leave_request" | "manual" | "private" | "xero";

export type TeamTimelineIcon =
  | "client"
  | "home"
  | "leave_request"
  | "other"
  | "private"
  | "training"
  | "travel"
  | "xero";

export interface TeamTimelineBlock {
  ariaLabel: string;
  /** "Mon 5 Oct", "Mon 5 to Wed 7 Oct" or "Mon 28 Sep to Fri 2 Oct". */
  dateLabel: string;
  dayCount: number;
  durationLabel: string;
  endIndex: number;
  icon: TeamTimelineIcon;
  id: string;
  label: string;
  note: string | null;
  provenanceLabel: string;
  startIndex: number;
  tone: TeamTimelineTone;
}

export interface TeamTimelineRowProps {
  blocks: TeamTimelineBlock[];
  initials: string;
  isSelf: boolean;
  name: string;
  personId: string;
  secondary: string | null;
}

export interface TeamTimelineDay {
  dateLabel: string;
  dow: string;
  holidayName: string | null;
  isToday: boolean;
  key: string;
}

export interface TeamTimelineLinkProps {
  "aria-label"?: string;
  children: ReactNode;
  className: string;
  href: string;
}

export interface TeamTimelineProps {
  cornerLabel: string;
  days: TeamTimelineDay[];
  footer: string | null;
  isCurrentWeek: boolean;
  navigation: { nextHref: string; previousHref: string; todayHref: string };
  /** Apps pass a framework link (for example next/link). */
  renderLink?: (props: TeamTimelineLinkProps) => ReactNode;
  rows: TeamTimelineRowProps[];
  /** "Mon 5 to Sun 11 Oct". */
  weekLabel: string;
  /** "This week · 2026". */
  weekSub: string;
}

const DAY_COUNT = 7;
const WEEK_COLUMNS = "grid-cols-[repeat(7,minmax(7rem,1fr))]";
const FOCUS_RING =
  "outline-hidden focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2";
const BLOCK_SELECTOR = "[data-timeline-block]";

const ICONS: Record<TeamTimelineIcon, LucideIcon> = {
  client: BriefcaseIcon,
  home: HouseIcon,
  leave_request: CalendarCheckIcon,
  other: CircleIcon,
  private: EyeOffIcon,
  training: GraduationCapIcon,
  travel: PlaneIcon,
  xero: RefreshCwIcon,
};

const PROVENANCE_ICONS: Record<TeamTimelineTone, LucideIcon> = {
  leave_request: CalendarCheckIcon,
  manual: PencilIcon,
  private: EyeOffIcon,
  xero: RefreshCwIcon,
};

const ACCENT_TONE = {
  block:
    "bg-accent-container text-on-accent-container hover:bg-[color-mix(in_oklch,var(--accent-container)_86%,var(--on-accent-container))]",
  selected:
    "bg-[color-mix(in_oklch,var(--accent-container)_86%,var(--on-accent-container))] text-on-accent-container ring-2 ring-on-accent-container",
  surface: "bg-accent-container text-on-accent-container",
};

const TONES: Record<
  TeamTimelineTone,
  { block: string; selected: string; surface: string }
> = {
  leave_request: ACCENT_TONE,
  manual: ACCENT_TONE,
  private: {
    block:
      "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest",
    selected:
      "bg-surface-container-highest text-on-surface-variant ring-2 ring-outline",
    surface: "bg-surface-container-high text-on-surface-variant",
  },
  xero: {
    block:
      "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary)_86%,var(--primary))]",
    selected:
      "bg-[color-mix(in_oklch,var(--secondary)_86%,var(--primary))] text-secondary-foreground ring-2 ring-primary",
    surface: "bg-secondary text-secondary-foreground",
  },
};

const defaultRenderLink = ({ children, ...props }: TeamTimelineLinkProps) => (
  <a {...props}>{children}</a>
);

/** Left offset and width of one day column, as inline styles. */
const columnStyle = (index: number) => ({
  left: `${(index / DAY_COUNT) * 100}%`,
  width: `calc(100% / ${DAY_COUNT})`,
});

/**
 * Arrow keys move between blocks in DOM order. Left and right stop at the
 * ends; up and down wrap, as on the homepage timeline.
 */
function moveBlockFocus(event: KeyboardEvent<HTMLButtonElement>) {
  const container = event.currentTarget.closest("[data-timeline-grid]");
  if (!container) {
    return;
  }
  const blocks = [...container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)];
  const index = blocks.indexOf(event.currentTarget);
  if (index === -1) {
    return;
  }
  const targets: Record<string, HTMLElement | undefined> = {
    ArrowDown: blocks[index + 1] ?? blocks[0],
    ArrowLeft: blocks[index - 1],
    ArrowRight: blocks[index + 1],
    ArrowUp: blocks[index - 1] ?? blocks.at(-1),
  };
  if (!(event.key in targets)) {
    return;
  }
  event.preventDefault();
  targets[event.key]?.focus();
}

export function TeamTimeline({
  cornerLabel,
  days,
  footer,
  isCurrentWeek,
  navigation,
  renderLink = defaultRenderLink,
  rows,
  weekLabel,
  weekSub,
}: TeamTimelineProps) {
  const detailId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selectedRow = rows.find((row) =>
    row.blocks.some((block) => block.id === selectedId)
  );
  const selectedBlock = selectedRow?.blocks.find(
    (block) => block.id === selectedId
  );

  const select = (blockId: string, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSelectedId(blockId);
  };

  const close = () => {
    setSelectedId(null);
    triggerRef.current?.focus();
  };

  const navClass = cn(
    "grid size-11 shrink-0 place-items-center rounded-md bg-surface-container-lowest text-on-surface transition-colors duration-150 ease-out hover:bg-surface-container-highest motion-reduce:transition-none",
    FOCUS_RING
  );

  return (
    <div>
      <p
        aria-hidden="true"
        className="mb-4 flex items-center justify-center gap-2 font-medium text-label-md text-on-surface-variant md:hidden"
      >
        Swipe to see the full week
        <span className="text-primary">→</span>
      </p>
      <div className="overflow-x-auto overscroll-x-contain rounded-xl bg-surface-container-low p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-6 max-md:flex-col max-md:items-start">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            {renderLink({
              "aria-label": "Previous week",
              children: (
                <ChevronLeftIcon aria-hidden="true" className="size-4" />
              ),
              className: navClass,
              href: navigation.previousHref,
            })}
            {renderLink({
              "aria-label": "Next week",
              children: (
                <ChevronRightIcon aria-hidden="true" className="size-4" />
              ),
              className: navClass,
              href: navigation.nextHref,
            })}
            {renderLink({
              children: "Today",
              className: cn(
                "inline-flex h-11 shrink-0 items-center rounded-md px-3.5 font-medium text-label-lg transition-colors duration-150 ease-out motion-reduce:transition-none",
                FOCUS_RING,
                isCurrentWeek
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-surface-container-lowest text-on-surface hover:bg-surface-container-highest"
              ),
              href: navigation.todayHref,
            })}
            <div className="ml-1.5 flex flex-col gap-0.5">
              <span className="font-semibold text-on-surface text-title-md">
                {weekLabel}
              </span>
              <span className="font-medium text-label-sm text-on-surface-variant uppercase tracking-wide">
                {weekSub}
              </span>
            </div>
          </div>
          <Legend />
        </div>

        {/* biome-ignore lint/a11y/useSemanticElements: This group contains an availability visualisation, not a form. */}
        <div
          aria-label="Team availability timeline"
          className="grid min-w-[62rem] grid-cols-[220px_1fr] overflow-hidden rounded-lg bg-surface-container-lowest max-lg:grid-cols-[200px_1fr]"
          data-timeline-grid=""
          role="group"
        >
          <div className="flex items-center bg-surface-container px-4.5 py-3.5 font-medium text-label-sm text-on-surface-variant uppercase tracking-wide">
            {cornerLabel}
          </div>
          <div
            className={cn(
              "relative grid min-w-0 bg-surface-container",
              WEEK_COLUMNS
            )}
          >
            <ColumnTints days={days} header />
            {days.map((day) => (
              <div
                className="relative z-10 flex flex-col items-start gap-0.5 px-3.5 py-3 max-md:px-2 max-md:py-2.5"
                key={day.key}
              >
                <span className="font-medium text-label-sm text-on-surface-variant uppercase tracking-wide">
                  {day.dow}
                </span>
                <span
                  className={cn(
                    "font-semibold text-title-md",
                    day.isToday ? "text-primary" : "text-on-surface"
                  )}
                >
                  {day.dateLabel}
                </span>
                {day.isToday ? (
                  <span className="mt-0.5 rounded-sm bg-primary px-2 py-0.5 font-medium text-label-sm text-primary-foreground uppercase leading-none tracking-wide">
                    Today
                  </span>
                ) : null}
                {day.holidayName ? (
                  <span className="mt-0.5 max-w-full truncate rounded-sm bg-warning-container px-2 py-0.5 font-medium text-label-sm text-on-warning-container leading-tight">
                    {day.holidayName}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {rows.map((row, rowIndex) => {
            const rowTone =
              rowIndex % 2 === 1
                ? "bg-surface-container-low"
                : "bg-surface-container-lowest";
            return (
              <Fragment key={row.personId}>
                <div
                  className={cn(
                    "flex min-h-16 items-center gap-3 px-4.5 py-3 max-md:px-3 max-md:py-2.5",
                    rowTone
                  )}
                >
                  <div
                    aria-hidden="true"
                    className="grid size-[34px] shrink-0 place-items-center rounded-full bg-surface-container-high font-semibold text-label-md text-on-surface"
                  >
                    {row.initials}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-on-surface text-title-sm">
                        {row.name}
                      </span>
                      {row.isSelf ? (
                        <span className="shrink-0 rounded-sm bg-primary-container px-2 py-0.5 font-medium text-label-sm text-on-primary-container uppercase leading-none tracking-wide">
                          You
                        </span>
                      ) : null}
                    </div>
                    {row.secondary ? (
                      <span className="truncate text-label-md text-on-surface-variant">
                        {row.secondary}
                      </span>
                    ) : null}
                  </div>
                </div>
                {/* biome-ignore lint/a11y/useSemanticElements: Availability entries are disclosure buttons, not form fields. */}
                <div
                  aria-label={`${row.name}: availability`}
                  className={cn(
                    "relative grid min-h-16 min-w-0 py-2",
                    WEEK_COLUMNS,
                    rowTone
                  )}
                  role="group"
                >
                  <ColumnTints days={days} />
                  {Array.from({ length: DAY_COUNT - 1 }, (_, index) => (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 w-px bg-outline-variant/15"
                      // biome-ignore lint/suspicious/noArrayIndexKey: Day guides are fixed positions.
                      key={index}
                      style={{
                        left: `${((index + 1) / DAY_COUNT) * 100}%`,
                      }}
                    />
                  ))}
                  {row.blocks.map((block) => (
                    <TimelineBlock
                      block={block}
                      detailId={detailId}
                      isSelected={block.id === selectedId}
                      key={block.id}
                      onSelect={select}
                    />
                  ))}
                </div>
              </Fragment>
            );
          })}
        </div>

        {footer ? (
          <p className="mt-3 text-label-md text-on-surface-variant">{footer}</p>
        ) : null}

        <section
          aria-label="Selected availability entry details"
          aria-live="polite"
          id={detailId}
        >
          {selectedRow && selectedBlock ? (
            <Detail block={selectedBlock} onClose={close} row={selectedRow} />
          ) : (
            <div className="mt-4 flex min-h-[76px] items-center gap-2.5 rounded-lg bg-surface-container-lowest px-5 py-4 text-body-sm text-on-surface-variant">
              <span
                aria-hidden="true"
                className="grid size-[26px] shrink-0 place-items-center rounded-sm bg-surface-container"
              >
                <ArrowUpRightIcon className="size-3.5" />
              </span>
              Select any entry above to see its details, owner and provenance.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Legend() {
  return (
    // biome-ignore lint/a11y/useSemanticElements: These labels describe the timeline, not form controls.
    <div
      aria-label="Legend"
      className="flex flex-wrap items-center gap-4.5 font-medium text-label-md text-on-surface-variant max-lg:text-label-sm"
      role="group"
    >
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden="true"
          className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-secondary text-secondary-foreground"
        >
          <RefreshCwIcon className="size-2.5" />
        </span>
        Leave from Xero
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden="true"
          className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-accent-container text-on-accent-container"
        >
          <CalendarCheckIcon className="size-2.5" />
        </span>
        Leave request
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden="true"
          className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-accent-container text-on-accent-container"
        >
          <BriefcaseIcon className="size-2.5" />
        </span>
        Manual: home, client site, training
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-[4px] bg-warning-container"
        />
        Public holiday
      </span>
    </div>
  );
}

function ColumnTints({
  days,
  header = false,
}: {
  days: TeamTimelineDay[];
  header?: boolean;
}) {
  return days.map((day, index) => {
    if (!(day.isToday || day.holidayName)) {
      return null;
    }
    let tint = header ? "bg-primary/8" : "bg-primary/5";
    if (day.holidayName) {
      tint = header ? "bg-warning-container/70" : "bg-warning-container/40";
    }
    return (
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-y-0 z-0", tint)}
        data-column-tint={day.holidayName ? "holiday" : "today"}
        key={day.key}
        style={columnStyle(index)}
      />
    );
  });
}

function TimelineBlock({
  block,
  detailId,
  isSelected,
  onSelect,
}: {
  block: TeamTimelineBlock;
  detailId: string;
  isSelected: boolean;
  onSelect: (blockId: string, trigger: HTMLButtonElement) => void;
}) {
  const Icon = ICONS[block.icon];
  const tone = TONES[block.tone];
  return (
    <button
      aria-controls={detailId}
      aria-expanded={isSelected}
      aria-label={block.ariaLabel}
      className={cn(
        "relative z-10 mx-1 my-1 flex h-10 pointer-coarse:h-11 items-center gap-2 overflow-hidden rounded-sm px-2.5 text-left font-medium text-label-md transition-[background-color,box-shadow,transform] duration-150 ease-out active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 max-md:h-11",
        FOCUS_RING,
        isSelected ? tone.selected : tone.block
      )}
      data-timeline-block=""
      onClick={(event) => onSelect(block.id, event.currentTarget)}
      onKeyDown={moveBlockFocus}
      style={{
        gridColumn: `${block.startIndex + 1} / span ${block.dayCount}`,
      }}
      type="button"
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {block.dayCount >= 2 ? (
        <span className="min-w-0 truncate max-lg:text-label-sm">
          {block.label}
        </span>
      ) : null}
      {block.dayCount >= 3 ? (
        <span className="ml-auto shrink-0 pl-1.5 font-semibold text-label-sm max-md:hidden">
          {block.dayCount}d
        </span>
      ) : null}
    </button>
  );
}

function Detail({
  block,
  onClose,
  row,
}: {
  block: TeamTimelineBlock;
  onClose: () => void;
  row: TeamTimelineRowProps;
}) {
  const Icon = ICONS[block.icon];
  const ProvenanceIcon = PROVENANCE_ICONS[block.tone];
  const tone = TONES[block.tone];
  const meta = [
    { key: "date", value: block.dateLabel },
    { key: "duration", value: block.durationLabel },
    { key: "secondary", value: row.secondary },
    { key: "note", value: block.note },
  ].filter((part): part is { key: string; value: string } =>
    Boolean(part.value)
  );
  return (
    <div className="mt-4 grid min-h-[76px] grid-cols-[auto_1fr_auto] items-center gap-4.5 rounded-lg bg-surface-container-lowest px-5 py-4 max-md:grid-cols-[auto_1fr]">
      <div
        aria-hidden="true"
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-sm",
          tone.surface
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold text-on-surface text-title-md">
          {row.name} · {block.label}
        </p>
        <p className="flex flex-wrap items-center gap-2.5 text-body-sm text-on-surface-variant">
          {meta.map((part, index) => (
            <Fragment key={part.key}>
              {index > 0 ? <span aria-hidden="true">·</span> : null}
              <span>{part.value}</span>
            </Fragment>
          ))}
        </p>
      </div>
      <div className="flex items-center gap-2.5 max-md:col-span-full max-md:justify-end">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 py-1 font-medium text-label-sm uppercase tracking-wide",
            tone.surface
          )}
        >
          <ProvenanceIcon aria-hidden="true" className="size-3" />
          {block.provenanceLabel}
        </span>
        <button
          aria-label="Close details"
          className={cn(
            "grid size-11 place-items-center rounded-md text-on-surface-variant transition-colors duration-150 ease-out hover:bg-surface-container hover:text-on-surface motion-reduce:transition-none",
            FOCUS_RING
          )}
          onClick={onClose}
          type="button"
        >
          <XIcon aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
