"use client";

import { addDays, format, startOfWeek } from "date-fns";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signUpHref } from "@/src/lib/auth-links";
import { MarketingIcon } from "../../(home)/components/marketing-icons";

// Raw SVGs for brand calendar logos
const GCalIcon = () => (
  <svg
    className="mr-2 h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>Google Calendar Logo</title>
    <path
      d="M19 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3Z"
      fill="#4285F4"
    />
    <path d="M16.5 12H14.5V17H16.5V12Z" fill="white" />
    <path d="M9.5 10H7.5V15H9.5V10Z" fill="white" />
    <path d="M13 8H11V15H13V8Z" fill="white" />
  </svg>
);

const OutlookIcon = () => (
  <svg
    className="mr-2 h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>Outlook Logo</title>
    <path
      d="M20 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 8L12 13L4 8V6L12 11L20 6V8Z"
      fill="#0078D4"
    />
  </svg>
);

const AppleCalIcon = () => (
  <svg
    className="mr-2 h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>Apple Calendar Logo</title>
    <rect fill="#FF3B30" height="24" rx="5" width="24" />
    <text
      dominantBaseline="middle"
      fill="white"
      fontFamily="sans-serif"
      fontSize="7"
      fontWeight="bold"
      textAnchor="middle"
      x="50%"
      y="45%"
    >
      MAY
    </text>
    <text
      dominantBaseline="middle"
      fill="white"
      fontFamily="sans-serif"
      fontSize="9"
      fontWeight="bold"
      textAnchor="middle"
      x="50%"
      y="80%"
    >
      24
    </text>
  </svg>
);

interface Teammate {
  icon: "leaf" | "home" | "briefcase";
  id: string;
  initials: string;
  leaveKind: "annual" | "wfh" | "client";
  leaveLabel: string;
  leaveType: "sage" | "purple";
  name: string;
  role: string;
  type: "employee" | "contractor" | "director";
}

const TEAMMATES: Teammate[] = [
  {
    id: "sam",
    name: "Sarah Mitchell",
    role: "HR lead",
    initials: "SM",
    type: "employee",
    leaveLabel: "Annual leave",
    leaveType: "sage",
    leaveKind: "annual",
    icon: "leaf",
  },
  {
    id: "priya",
    name: "Daniel Chen",
    role: "Engineering",
    initials: "DC",
    type: "contractor",
    leaveLabel: "Working from home",
    leaveType: "purple",
    leaveKind: "wfh",
    icon: "home",
  },
  {
    id: "dee",
    name: "Patrick Nolan",
    role: "Sales",
    initials: "PN",
    type: "director",
    leaveLabel: "Client visit",
    leaveType: "purple",
    leaveKind: "client",
    icon: "briefcase",
  },
];

interface Particle {
  color: string;
  curveY: number; // offset control point for bezier curve
  progress: number; // 0 to 1
  speed: number;
  targetX: number;
  targetY: number;
  x: number;
  y: number;
}

interface CalculatedBlock {
  kind: "annual" | "wfh" | "client";
  label: string;
  span: number;
  start: number; // 1-indexed column start
  state: "approved" | "pending";
}

interface SelectedBlockState {
  kind: "annual" | "wfh" | "client";
  label: string;
  span: number;
  start: number;
  state: "approved" | "pending";
  teammateId: string;
}

const getSyncStatusText = (lastSync: number) => {
  const elapsed = Date.now() - lastSync;
  if (elapsed < 10_000) {
    return "Synced just now";
  }
  const mins = Math.floor(elapsed / 60_000);
  if (mins === 0) {
    return "Synced < 1m ago";
  }
  return `Synced ${mins}m ago`;
};

const getBlocksForTeammate = (
  teammateId: string,
  calendarState: Record<string, "approved" | "pending">
): CalculatedBlock[] => {
  const tm = TEAMMATES.find((t) => t.id === teammateId);
  if (!tm) {
    return [];
  }

  const blocks: CalculatedBlock[] = [];
  let i = 0;
  while (i < 5) {
    const state = calendarState[`${teammateId}-${i}`];
    if (state) {
      const start = i + 1;
      let span = 1;
      while (
        i + span < 5 &&
        calendarState[`${teammateId}-${i + span}`] === state
      ) {
        span++;
      }
      blocks.push({
        start,
        span,
        kind: tm.leaveKind,
        label: tm.leaveLabel,
        state,
      });
      i += span;
    } else {
      i++;
    }
  }
  return blocks;
};

const getSelectedDatesLabel = (
  selectedBlock: SelectedBlockState | null,
  weekDays: { date: Date; dow: string; num: number }[]
) => {
  if (!selectedBlock || weekDays.length === 0) {
    return "";
  }
  const startDay = weekDays[selectedBlock.start - 1];
  const endDay = weekDays[selectedBlock.start - 1 + selectedBlock.span - 1];
  if (!(startDay && endDay)) {
    return "";
  }
  return `${startDay.dow} ${startDay.num} to ${endDay.dow} ${endDay.num} ${format(
    new Date(),
    "MMM"
  )}`;
};

const BLOCK_KIND_ICONS = {
  annual: "leaf",
  wfh: "home",
  client: "briefcase",
} as const;

const useSyncParticles = (
  setLastSyncTime: React.Dispatch<React.SetStateAction<Record<string, number>>>
) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Targets coordinates mapped for sync spark paths
  const targetsRef = useRef<Record<string, { x: number; y: number }>>({});
  const cellsRef = useRef<Record<string, HTMLButtonElement | null>>({});

  // Particle emission helper
  const emitParticles = (fromKey: string, leaveType: "sage" | "purple") => {
    const startCell = cellsRef.current[fromKey];
    const container = containerRef.current;
    if (!(startCell && container)) {
      return;
    }

    const cellRect = startCell.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Start coordinates relative to container
    const startX = cellRect.left - containerRect.left + cellRect.width / 2;
    const startY = cellRect.top - containerRect.top + cellRect.height / 2;

    const color = leaveType === "sage" ? "#6DA671" : "#5E4F99";

    // Target the three calendar feeds
    const targetKeys = ["outlook", "gcal", "applecal"];
    for (const key of targetKeys) {
      const targetPos = targetsRef.current[key];
      if (targetPos) {
        // Add 2-3 particles per target feed with slightly staggered speeds
        for (let i = 0; i < 3; i++) {
          particlesRef.current.push({
            x: startX,
            y: startY,
            targetX: targetPos.x,
            targetY: targetPos.y,
            color,
            progress: 0,
            speed: 0.025 + Math.random() * 0.015 - i * 0.003,
            curveY: (Math.random() - 0.5) * 120, // random wave curve
          });
        }
      }
    }

    // Start loop if not already running
    if (!animationFrameRef.current) {
      tick();
    }
  };

  // Canvas drawing loop
  const tick = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const particles = particlesRef.current;
    if (particles.length === 0) {
      animationFrameRef.current = null;
      return;
    }

    // Update and draw particles
    particlesRef.current = particles.filter((p) => {
      p.progress += p.speed;

      // Cubic-bezier like interpolation for particle paths
      const t = p.progress;
      const mt = 1 - t;

      // Draw curved spline
      const cpX = (p.x + p.targetX) / 2;
      const cpY = (p.y + p.targetY) / 2 + p.curveY;

      // Quadratic bezier formula
      const x = mt * mt * p.x + 2 * mt * t * cpX + t * t * p.targetX;
      const y = mt * mt * p.y + 2 * mt * t * cpY + t * t * p.targetY;

      // Render glowing tail
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(cpX, cpY, p.targetX, p.targetY);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = Math.max(0, 1 - t * 1.5) * 0.25;
      ctx.stroke();

      // Render particle head
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = Math.min(1, mt * 1.8);
      ctx.fill();

      // Reset shadows
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      return t < 1;
    });

    // If any particle hits the target feed end (progress >= 1), trigger sync pulse
    const hasCompleted = particles.some((p) => p.progress >= 0.95);
    if (hasCompleted) {
      const now = Date.now();
      setLastSyncTime({
        outlook: now,
        gcal: now,
        applecal: now,
      });
    }

    animationFrameRef.current = requestAnimationFrame(tick);
  };

  // Set up resize handler for the canvas & update target element centers
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!(canvas && container)) {
        return;
      }

      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;

      // Update positions of target chips relative to the container
      for (const key of ["outlook", "gcal", "applecal"]) {
        const el = document.getElementById(`ft-sandbox-feed-${key}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          targetsRef.current[key] = {
            x: rect.left - containerRect.left + rect.width / 2,
            y: rect.top - containerRect.top + rect.height / 2,
          };
        }
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Emit spark burst directly from legend buttons
  const emitLegendSpark = (leaveType: "sage" | "purple", targetId: string) => {
    const el = document.getElementById(targetId);
    const container = containerRef.current;
    if (!(el && container)) {
      return;
    }

    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const startX = rect.left - containerRect.left + rect.width / 2;
    const startY = rect.top - containerRect.top + containerRect.height / 2;

    const color = leaveType === "sage" ? "#6DA671" : "#5E4F99";
    const targetKeys = ["outlook", "gcal", "applecal"];

    for (const key of targetKeys) {
      const targetPos = targetsRef.current[key];
      if (targetPos) {
        for (let i = 0; i < 4; i++) {
          particlesRef.current.push({
            x: startX,
            y: startY,
            targetX: targetPos.x,
            targetY: targetPos.y,
            color,
            progress: 0,
            speed: 0.02 + Math.random() * 0.015 - i * 0.003,
            curveY: (Math.random() - 0.5) * 160,
          });
        }
      }
    }

    if (!animationFrameRef.current) {
      tick();
    }
  };

  return {
    canvasRef,
    containerRef,
    cellsRef,
    emitParticles,
    emitLegendSpark,
  };
};

interface TeammateTrackRowProps {
  calendarState: Record<string, "approved" | "pending">;
  cellsRef: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  selectedBlock: SelectedBlockState | null;
  setSelectedBlock: React.Dispatch<
    React.SetStateAction<SelectedBlockState | null>
  >;
  tm: Teammate;
  toggleCell: (teammateId: string, dayIdx: number) => void;
}

const TeammateTrackRow = ({
  tm,
  calendarState,
  selectedBlock,
  setSelectedBlock,
  toggleCell,
  cellsRef,
}: TeammateTrackRowProps) => {
  return (
    <div className="contents">
      <div className="tl-row-staff">
        <div className="tl-avatar">{tm.initials}</div>
        <div className="tl-staff-meta">
          <div className="tl-staff-name">{tm.name}</div>
          <div className="tl-staff-role">{tm.role}</div>
        </div>
      </div>

      <div
        className="tl-row-track"
        style={{ gridTemplateColumns: "repeat(5, 1fr)" }}
      >
        {/* Day vertical guidelines */}
        {[1, 2, 3, 4].map((i) => (
          <span
            className="tl-day-guide"
            key={i}
            style={{ left: `${(i / 5) * 100}%` }}
          />
        ))}

        {/* Interactive overlay cell buttons */}
        {[0, 1, 2, 3, 4].map((dayIdx) => {
          const key = `${tm.id}-${dayIdx}`;
          return (
            <button
              aria-label={`Toggle ${tm.name} leave on day ${dayIdx + 1}`}
              className="ft-sandbox-cell-btn"
              key={dayIdx}
              onClick={() => toggleCell(tm.id, dayIdx)}
              ref={(el) => {
                cellsRef.current[key] = el;
              }}
              style={{
                left: `${(dayIdx / 5) * 100}%`,
                width: "20%",
                height: "100%",
                position: "absolute",
                zIndex: 1,
              }}
              type="button"
            />
          );
        })}

        {/* Visual Leave Span Blocks */}
        {getBlocksForTeammate(tm.id, calendarState).map((block) => {
          const tone = block.kind === "annual" ? "sage" : "purple";
          const iconId = (
            {
              annual: "leaf",
              wfh: "home",
              client: "briefcase",
            } as const
          )[block.kind];
          const blockKey = `${tm.id}-${block.start}-${block.span}`;
          const isSelected =
            selectedBlock &&
            selectedBlock.teammateId === tm.id &&
            selectedBlock.start === block.start &&
            selectedBlock.span === block.span;

          return (
            <button
              className={`tl-block tl-block--${tone} ${
                block.state === "pending" ? "tl-block--pending" : ""
              } ${isSelected ? "is-selected" : ""}`}
              key={blockKey}
              onClick={() => {
                setSelectedBlock({
                  teammateId: tm.id,
                  start: block.start,
                  span: block.span,
                  kind: block.kind,
                  label: block.label,
                  state: block.state,
                });
              }}
              style={{
                gridColumn: `${block.start} / span ${block.span}`,
                zIndex: 2,
              }}
              type="button"
            >
              <span className="tl-block__icon">
                <MarketingIcon id={iconId} size={14} />
              </span>
              {block.span >= 2 && (
                <span className="tl-block__label">{block.label}</span>
              )}
              {block.span >= 3 && (
                <span className="tl-block__days">{block.span}d</span>
              )}
              {block.state === "pending" && (
                <span className="ml-auto rounded bg-muted px-1 py-0.5 font-bold text-[9px] text-muted-foreground uppercase leading-none tracking-tight">
                  Pending
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface TimelineDetailStripProps {
  handleApprove: () => void;
  handleDecline: () => void;
  selectedBlock: SelectedBlockState | null;
  weekDays: { date: Date; dow: string; num: number }[];
}

const TimelineDetailStrip = ({
  selectedBlock,
  weekDays,
  handleApprove,
  handleDecline,
}: TimelineDetailStripProps) => {
  if (!selectedBlock) {
    return (
      <div className="tl-detail tl-detail--empty" style={{ marginTop: "12px" }}>
        <span aria-hidden="true" className="tl-detail-hint-icon">
          <MarketingIcon id="arrowUpRight" size={14} />
        </span>
        Click any leave block to view details, approve pending requests, or
        revoke synced leave.
      </div>
    );
  }

  return (
    <div
      className="tl-detail"
      style={{
        marginTop: "12px",
        border: "1px solid var(--marketing-ghost-border)",
      }}
    >
      <div
        className={`tl-detail-icon tl-detail-icon--${
          selectedBlock.kind === "annual" ? "sage" : "purple"
        }`}
      >
        <MarketingIcon id={BLOCK_KIND_ICONS[selectedBlock.kind]} size={20} />
      </div>
      <div className="tl-detail-content">
        <div className="tl-detail-title">
          {TEAMMATES.find((t) => t.id === selectedBlock.teammateId)?.name} ·{" "}
          {selectedBlock.label}{" "}
          <span
            className={`ml-1.5 rounded px-1.5 py-0.5 font-semibold text-[10px] ${
              selectedBlock.state === "pending"
                ? "bg-muted text-muted-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {selectedBlock.state === "pending"
              ? "Pending Approval"
              : "Approved & Synced"}
          </span>
        </div>
        <div className="tl-detail-meta mt-0.5 text-muted-foreground text-xs">
          <span>{getSelectedDatesLabel(selectedBlock, weekDays)}</span>
          <span aria-hidden="true" className="mx-1">
            ·
          </span>
          <span>
            {selectedBlock.span === 1 ? "1 day" : `${selectedBlock.span} days`}
          </span>
          <span aria-hidden="true" className="mx-1">
            ·
          </span>
          <span>
            {selectedBlock.state === "pending"
              ? "Sync writes back to Xero Payroll"
              : "Two-way Xero synchronization active"}
          </span>
        </div>
      </div>
      <div className="tl-detail-side flex items-center gap-2">
        {selectedBlock.state === "pending" ? (
          <>
            <button
              className="cursor-pointer rounded-lg bg-primary px-3.5 py-1.5 font-medium text-primary-foreground text-xs transition-colors hover:bg-primary/90"
              onClick={handleApprove}
              type="button"
            >
              Approve Sync
            </button>
            <button
              className="cursor-pointer rounded-lg border border-border/10 bg-transparent px-3.5 py-1.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted"
              onClick={handleDecline}
              type="button"
            >
              Decline
            </button>
          </>
        ) : (
          <button
            className="cursor-pointer border-none bg-transparent font-medium text-destructive text-xs hover:text-destructive/80"
            onClick={handleDecline}
            type="button"
          >
            Revoke Leave
          </button>
        )}
      </div>
    </div>
  );
};

export const InteractiveHeroSection = () => {
  // Calendar states: [teammateId-dayIndex]: approved | pending | undefined
  const [calendarState, setCalendarState] = useState<
    Record<string, "approved" | "pending">
  >({
    "sam-0": "approved",
    "sam-1": "approved",
    "sam-2": "pending",
    "priya-2": "approved",
    "dee-3": "pending",
    "dee-4": "approved",
  });

  const [selectedBlock, setSelectedBlock] = useState<SelectedBlockState | null>(
    null
  );

  const [lastSyncTime, setLastSyncTime] = useState<Record<string, number>>({
    outlook: Date.now() - 5000,
    gcal: Date.now() - 5000,
    applecal: Date.now() - 5000,
  });

  const [activeTab, setActiveTab] = useState<"visual" | "ics">("visual");
  const [copyStatus, setCopyStatus] = useState("Copy Link");
  const [mounted, setMounted] = useState(false);
  const [weekDays, setWeekDays] = useState<
    { date: Date; dow: string; num: number }[]
  >([]);

  const { canvasRef, containerRef, cellsRef, emitParticles, emitLegendSpark } =
    useSyncParticles(setLastSyncTime);

  const mockFeedUrl =
    "https://api.teamcalendar.online/v1/ical/feed_5f2d7a9b.ics";

  // Hydration-safe dynamic dates
  useEffect(() => {
    setMounted(true);
    const today = new Date();
    const mondayThisWeek = startOfWeek(today, { weekStartsOn: 1 });
    const days = [0, 1, 2, 3, 4].map((offset) => {
      const date = addDays(mondayThisWeek, offset);
      return {
        date,
        dow: format(date, "eee"),
        num: date.getDate(),
      };
    });
    setWeekDays(days);
  }, []);

  // Click on grid cell: Managers register a Staff request (marked Pending)
  const toggleCell = (teammateId: string, dayIdx: number) => {
    const key = `${teammateId}-${dayIdx}`;
    const tm = TEAMMATES.find((t) => t.id === teammateId);
    if (!tm) {
      return;
    }

    const currentCellState = calendarState[key];
    if (currentCellState) {
      // Toggle off
      const nextState = { ...calendarState };
      delete nextState[key];
      setCalendarState(nextState);
      setSelectedBlock(null);
    } else {
      // Create a pending request on behalf of staff
      setCalendarState((prev) => ({
        ...prev,
        [key]: "pending",
      }));
      // Auto-select the block to show manager controls
      setSelectedBlock({
        teammateId,
        start: dayIdx + 1,
        span: 1,
        kind: tm.leaveKind,
        label: tm.leaveLabel,
        state: "pending",
      });
    }
  };

  // Manager Approve Control Action
  const handleApprove = () => {
    if (!selectedBlock) {
      return;
    }
    const { teammateId, start, span } = selectedBlock;
    const tm = TEAMMATES.find((t) => t.id === teammateId);
    if (!tm) {
      return;
    }

    // Set span to approved
    const nextState = { ...calendarState };
    for (let d = start - 1; d < start - 1 + span; d++) {
      nextState[`${teammateId}-${d}`] = "approved";
    }
    setCalendarState(nextState);

    // Update selected block state to approved
    setSelectedBlock((prev) => (prev ? { ...prev, state: "approved" } : null));

    // Emit sync spark canvas effect starting from the approved block cell
    const cellKey = `${teammateId}-${start - 1}`;
    emitParticles(cellKey, tm.leaveType);
  };

  // Manager Decline/Delete Control Action
  const handleDecline = () => {
    if (!selectedBlock) {
      return;
    }
    const { teammateId, start, span } = selectedBlock;

    const nextState = { ...calendarState };
    for (let d = start - 1; d < start - 1 + span; d++) {
      delete nextState[`${teammateId}-${d}`];
    }
    setCalendarState(nextState);
    setSelectedBlock(null);
  };

  // Copy mock url to clipboard helper
  const copyToClipboard = () => {
    navigator.clipboard.writeText(mockFeedUrl);
    setCopyStatus("Copied!");
    setTimeout(() => {
      setCopyStatus("Copy Link");
    }, 2000);
  };

  return (
    <section className="ft-hero">
      <div className="ft-hero__left">
        <div className="fmkt-pill">Live Sync Platform</div>
        <h1 className="ft-hero__title">
          Every absence.
          <em>Every person on the calendar.</em>
        </h1>
        <p className="ft-hero__body">
          Employees request leave once. Team Calendar pulls the approved details
          sitting in Xero Payroll, layers in contractors and directors added by
          hand, and publishes a single, authoritative feed to Outlook, Google
          Calendar, and Apple Calendar automatically.
        </p>
        <div className="ft-hero__actions">
          <Link
            className="marketing-btn marketing-btn--primary"
            href={signUpHref}
          >
            Sign up
          </Link>
          <Link
            className="marketing-btn marketing-btn--outline"
            href="#coverage"
          >
            See who&apos;s covered
          </Link>
        </div>
      </div>

      <div className="ft-hero__right" ref={containerRef}>
        {/* Particle Canvas */}
        <canvas
          className="pointer-events-none absolute inset-0 z-10"
          ref={canvasRef}
        />

        {/* Decorative ambient background glows */}
        <div className="ft-sandbox-glow ft-sandbox-glow--green" />
        <div className="ft-sandbox-glow ft-sandbox-glow--purple" />

        {/* Main interactive panel */}
        <div className="ft-sandbox-card relative z-20">
          {/* Card Header tabs */}
          <div className="ft-sandbox-header">
            <div className="flex items-center gap-2">
              <span className="ft-sandbox-pulse" />
              <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Availability Sandbox
              </span>
            </div>
            <div className="ft-sandbox-tabs">
              <button
                className={`ft-sandbox-tab ${activeTab === "visual" ? "active" : ""}`}
                onClick={() => setActiveTab("visual")}
                type="button"
              >
                Calendar Sandbox
              </button>
              <button
                className={`ft-sandbox-tab ${activeTab === "ics" ? "active" : ""}`}
                onClick={() => setActiveTab("ics")}
                type="button"
              >
                Subscribe Feed
              </button>
            </div>
          </div>

          {activeTab === "visual" ? (
            <div className="ft-sandbox-content p-4">
              <p className="mb-4 text-muted-foreground text-xs">
                Staff request leave: click empty slots to request days. Managers
                approve: click any pending striped block and click{" "}
                <strong>Approve</strong> in the details below.
              </p>

              {/* Grid Timeline - Using authentic tl-card styles */}
              <div className="tl-card">
                <div className="tl-toolbar">
                  <div className="tl-week-meta" style={{ padding: 0 }}>
                    <div
                      className="tl-week-label"
                      style={{ fontSize: "14px", fontWeight: "600" }}
                    >
                      Manager Approval Panel
                    </div>
                    <div className="tl-week-sub mt-0.5 text-[10px] text-muted-foreground">
                      Review requests in timeline context before syncing.
                    </div>
                  </div>
                  {/* Interactive Legend that shoots sparks when clicked */}
                  <fieldset
                    aria-label="Legend"
                    className="tl-legend"
                    style={{
                      border: "none",
                      padding: 0,
                      margin: 0,
                      gap: "8px",
                    }}
                  >
                    <button
                      className="tl-legend-item flex cursor-pointer items-center border-none bg-transparent transition-all hover:opacity-80 active:scale-95"
                      id="legend-annual"
                      onClick={() => emitLegendSpark("sage", "legend-annual")}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="tl-swatch tl-swatch--sage"
                      />
                      Annual leave
                    </button>
                    <button
                      className="tl-legend-item flex cursor-pointer items-center border-none bg-transparent transition-all hover:opacity-80 active:scale-95"
                      id="legend-wfh"
                      onClick={() => emitLegendSpark("purple", "legend-wfh")}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="tl-swatch tl-swatch--purple"
                      />
                      Working from home
                    </button>
                    <button
                      className="tl-legend-item flex cursor-pointer items-center border-none bg-transparent transition-all hover:opacity-80 active:scale-95"
                      id="legend-client"
                      onClick={() => emitLegendSpark("purple", "legend-client")}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="tl-swatch tl-swatch--purple"
                      >
                        <MarketingIcon id="briefcase" size={9} />
                      </span>
                      Client visit
                    </button>
                  </fieldset>
                </div>

                <div
                  className="tl-grid"
                  style={{ gridTemplateColumns: "160px 1fr" }}
                >
                  <div className="tl-corner">Team</div>

                  {/* Dynamic Days Header */}
                  <div
                    className="tl-days-header"
                    style={{ gridTemplateColumns: "repeat(5, 1fr)" }}
                  >
                    {mounted &&
                      weekDays.map((day) => (
                        <div className="tl-day-head" key={day.num}>
                          <span className="tl-day-head__dow">{day.dow}</span>
                          <span className="tl-day-head__num">{day.num}</span>
                        </div>
                      ))}
                  </div>

                  {/* Teammate tracks */}
                  {TEAMMATES.map((tm) => (
                    <TeammateTrackRow
                      calendarState={calendarState}
                      cellsRef={cellsRef}
                      key={tm.id}
                      selectedBlock={selectedBlock}
                      setSelectedBlock={setSelectedBlock}
                      tm={tm}
                      toggleCell={toggleCell}
                    />
                  ))}
                </div>

                {/* Homepage-style Detail Strip */}
                <TimelineDetailStrip
                  handleApprove={handleApprove}
                  handleDecline={handleDecline}
                  selectedBlock={selectedBlock}
                  weekDays={weekDays}
                />
              </div>

              {/* Feeds status */}
              <div className="ft-sandbox-feeds mt-5">
                <span className="mb-2.5 block font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  Subscribed Calendar Feeds (.ICS)
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  <div
                    className="ft-sandbox-feed-item"
                    id="ft-sandbox-feed-outlook"
                  >
                    <OutlookIcon />
                    <div>
                      <div className="font-medium text-xs">Outlook</div>
                      <div className="mt-0.5 text-[9px] text-muted-foreground">
                        {getSyncStatusText(lastSyncTime.outlook)}
                      </div>
                    </div>
                  </div>

                  <div
                    className="ft-sandbox-feed-item"
                    id="ft-sandbox-feed-gcal"
                  >
                    <GCalIcon />
                    <div>
                      <div className="font-medium text-xs">Google Cal</div>
                      <div className="mt-0.5 text-[9px] text-muted-foreground">
                        {getSyncStatusText(lastSyncTime.gcal)}
                      </div>
                    </div>
                  </div>

                  <div
                    className="ft-sandbox-feed-item"
                    id="ft-sandbox-feed-applecal"
                  >
                    <AppleCalIcon />
                    <div>
                      <div className="font-medium text-xs">Apple Cal</div>
                      <div className="mt-0.5 text-[9px] text-muted-foreground">
                        {getSyncStatusText(lastSyncTime.applecal)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="ft-sandbox-content flex h-[380px] flex-col justify-between p-4">
              <div>
                <span className="mb-2 block font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  Subscribe to Calendar Feed
                </span>
                <p className="mb-4 text-muted-foreground text-xs">
                  Add your team availability feed to the calendar application
                  you already use. It remains synced automatically.
                </p>

                {/* Feed link copy component */}
                <div className="flex items-center gap-2 rounded-xl border border-border/10 bg-muted/40 p-1.5">
                  <input
                    className="flex-1 select-all border-none bg-transparent px-2 font-mono text-[11px] text-muted-foreground focus:outline-none"
                    readOnly
                    type="text"
                    value={mockFeedUrl}
                  />
                  <button
                    className="flex min-w-[85px] cursor-pointer items-center justify-center rounded-lg bg-primary px-3.5 py-1.5 font-medium text-primary-foreground text-xs transition-colors hover:bg-primary/90"
                    onClick={copyToClipboard}
                    type="button"
                  >
                    {copyStatus === "Copied!" ? (
                      <>
                        <MarketingIcon className="mr-1" id="check" size={10} />
                        Copied!
                      </>
                    ) : (
                      "Copy Link"
                    )}
                  </button>
                </div>
              </div>

              {/* Step-by-step guides for non-technical users */}
              <div className="mt-4 flex-1 border-border/10 border-t pt-4">
                <span className="mb-2.5 block font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  How to add to your calendar:
                </span>
                <div className="grid grid-cols-3 gap-3 text-left">
                  <div>
                    <div className="mb-1.5 flex items-center gap-1 font-medium text-foreground text-xs">
                      <GCalIcon />
                      Google Calendar
                    </div>
                    <ol className="list-decimal space-y-1 pl-4 text-[10.5px] text-muted-foreground leading-relaxed">
                      <li>Copy the feed link above</li>
                      <li>
                        Click the <strong className="text-foreground">+</strong>{" "}
                        next to &quot;Other calendars&quot;
                      </li>
                      <li>Select &quot;From URL&quot;</li>
                      <li>Paste feed link &amp; add</li>
                    </ol>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center gap-1 font-medium text-foreground text-xs">
                      <OutlookIcon />
                      Outlook / M365
                    </div>
                    <ol className="list-decimal space-y-1 pl-4 text-[10.5px] text-muted-foreground leading-relaxed">
                      <li>Copy the feed link above</li>
                      <li>Click &quot;Add Calendar&quot;</li>
                      <li>Select &quot;Subscribe from Web&quot;</li>
                      <li>Paste link &amp; import</li>
                    </ol>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center gap-1 font-medium text-foreground text-xs">
                      <AppleCalIcon />
                      Apple Calendar
                    </div>
                    <ol className="list-decimal space-y-1 pl-4 text-[10.5px] text-muted-foreground leading-relaxed">
                      <li>Copy the feed link above</li>
                      <li>Go to &quot;File&quot; menu</li>
                      <li>Select &quot;New Calendar Subscription&quot;</li>
                      <li>Paste link &amp; subscribe</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
