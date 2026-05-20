import Link from "next/link";
import { env } from "@/env";
import { MarketingIcon } from "../../(home)/components/marketing-icons";

const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

const calendarRows = [
  {
    who: "Sam",
    span: [0, 5] as [number, number],
    bg: "#CAE8BC",
    fg: "#336A3B",
  },
  {
    who: "Jess",
    span: [2, 5] as [number, number],
    bg: "#E5DFFF",
    fg: "#5E4F99",
  },
  {
    who: "Kiri",
    span: [0, 2] as [number, number],
    bg: "#FFDAD6",
    fg: "#BA1A1A",
  },
  {
    who: "Lara",
    span: [3, 4] as [number, number],
    bg: "#E5DFFF",
    fg: "#5E4F99",
  },
];

const HeroVisual = () => (
  <div aria-hidden="true" className="fmkt-hero__visual">
    {/* Sage radial glow */}
    <div
      style={{
        position: "absolute",
        inset: "-20px -40px 40px 40px",
        background:
          "radial-gradient(60% 70% at 40% 50%, rgba(109,166,113,0.18), transparent 70%)",
      }}
    />

    {/* Card 1 — leave form, back left */}
    <div
      style={{
        position: "absolute",
        top: "8%",
        left: 0,
        width: "60%",
        background: "var(--marketing-surface-lowest)",
        borderRadius: 16,
        padding: 18,
        boxShadow: "0 8px 24px rgba(53,51,64,0.06)",
        transform: "rotate(-2deg)",
      }}
    >
      <div
        style={{
          font: "500 11px/1.3 var(--marketing-font)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--marketing-on-surface-variant)",
        }}
      >
        New leave request
      </div>
      {(
        [
          ["Type", "Annual leave"],
          ["Date range", "Mon 12 to Fri 16 May"],
          ["Days", "5 days"],
        ] as [string, string][]
      ).map(([k, v]) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 0",
            borderTop:
              "1px solid color-mix(in srgb, var(--border) 12%, transparent)",
            marginTop: 8,
          }}
        >
          <span
            style={{
              font: "400 12px/1.4 var(--marketing-font)",
              color: "var(--marketing-on-surface-variant)",
            }}
          >
            {k}
          </span>
          <span
            style={{
              font: "500 13px/1.4 var(--marketing-font)",
              color: "var(--marketing-inverse-surface)",
            }}
          >
            {v}
          </span>
        </div>
      ))}
      <div
        style={{
          marginTop: 12,
          padding: "10px 12px",
          background: "var(--marketing-secondary-container)",
          color: "var(--marketing-on-secondary-container)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            background: "rgba(42,61,36,0.15)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <MarketingIcon id="check" size={12} />
        </span>
        <div>
          <div style={{ font: "500 12px/1.2 var(--marketing-font)" }}>
            Submitted to manager
          </div>
          <div
            style={{
              font: "400 11px/1.3 var(--marketing-font)",
              opacity: 0.8,
            }}
          >
            Sam Aboud · today, 9:14 am
          </div>
        </div>
      </div>
    </div>

    {/* Card 2 — team calendar, front right */}
    <div
      style={{
        position: "absolute",
        top: "30%",
        right: 0,
        width: "70%",
        background: "var(--marketing-surface-lowest)",
        borderRadius: 16,
        padding: 18,
        boxShadow:
          "0 24px 48px rgba(53,51,64,0.08), 0 4px 12px rgba(53,51,64,0.04)",
        transform: "rotate(2deg)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              font: "500 11px/1.3 var(--marketing-font)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--marketing-on-surface-variant)",
            }}
          >
            Team · Operations
          </div>
          <div
            style={{ font: "500 16px/1.3 var(--marketing-font)", marginTop: 2 }}
          >
            Mon 12 — Fri 16 May
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 9999,
            background: "var(--marketing-secondary-container)",
            color: "var(--marketing-on-secondary-container)",
            font: "500 10px/1.2 var(--marketing-font)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <MarketingIcon id="leaf" size={10} /> Xero
        </span>
      </div>
      {/* Week grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px repeat(5, 1fr)",
          gap: 6,
        }}
      >
        {[
          { id: "name-col", label: "", align: "left" as const },
          { id: "mon", label: "M", align: "center" as const },
          { id: "tue", label: "T", align: "center" as const },
          { id: "wed", label: "W", align: "center" as const },
          { id: "thu", label: "T", align: "center" as const },
          { id: "fri", label: "F", align: "center" as const },
        ].map((col) => (
          <div
            key={col.id}
            style={{
              font: "500 10px/1 var(--marketing-font)",
              color: "var(--marketing-on-surface-variant)",
              textAlign: col.align,
              padding: "0 0 6px",
            }}
          >
            {col.label}
          </div>
        ))}
        {calendarRows.map((row) => (
          <>
            <div
              key={`${row.who}-label`}
              style={{
                font: "400 11px/1 var(--marketing-font)",
                color: "var(--marketing-inverse-surface)",
                display: "flex",
                alignItems: "center",
              }}
            >
              {row.who}
            </div>
            <div
              key={`${row.who}-bar`}
              style={{
                gridColumn: "2 / span 5",
                position: "relative",
                height: 18,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${(row.span[0] / 5) * 100}%`,
                  width: `${((row.span[1] - row.span[0]) / 5) * 100}%`,
                  background: row.bg,
                  borderRadius: 4,
                  boxShadow: `inset 2px 0 0 ${row.fg}`,
                }}
              />
            </div>
          </>
        ))}
      </div>
    </div>

    {/* Card 3 — calendar subscription chips, bottom left */}
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: "10%",
        width: "55%",
        background: "var(--marketing-surface-lowest)",
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 8px 24px rgba(53,51,64,0.06)",
        transform: "rotate(-1deg)",
      }}
    >
      <div
        style={{
          font: "500 11px/1.3 var(--marketing-font)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--marketing-on-surface-variant)",
          marginBottom: 10,
        }}
      >
        Published to
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            ["outlook", "Outlook"],
            ["gcal", "Google Calendar"],
            ["applecal", "Apple Calendar"],
          ] as [string, string][]
        ).map(([id, name]) => (
          <span
            key={id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              background: "var(--marketing-surface-high)",
              borderRadius: 10,
              font: "500 12px/1.3 var(--marketing-font)",
              color: "var(--marketing-inverse-surface)",
            }}
          >
            <MarketingIcon
              id={id as Parameters<typeof MarketingIcon>[0]["id"]}
              size={14}
            />
            {name}
          </span>
        ))}
      </div>
    </div>
  </div>
);

export const HeroSection = () => (
  <section className="fmkt-hero">
    <div className="fmkt-hero__copy">
      <div className="fmkt-hero__copy-inner">
        <div className="fmkt-pill">Now in early access</div>
        <h1 className="fmkt-hero__title">
          Simple leave requests.
          <em>Clear calendars for everyone.</em>
        </h1>
        <p className="fmkt-hero__body">
          Employees request leave once in LeaveSync. Managers approve in
          context, Xero stays current, and Outlook, Google Calendar and Apple
          Calendar show who is available.
        </p>
        <div className="fmkt-hero__actions">
          <Link
            className="marketing-btn marketing-btn--primary"
            href={signUpHref}
          >
            Sign up
          </Link>
          <Link
            className="marketing-btn marketing-btn--outline"
            href="#how-it-works"
          >
            See how it works
          </Link>
        </div>
        <div className="fmkt-hero__stat-row">
          <div className="fmkt-hero__stat">
            <strong>Xero only</strong>AU, NZ and UK Payroll
          </div>
          <div className="fmkt-hero__stat">
            <strong>One feed</strong>Outlook, Google, Apple
          </div>
          <div className="fmkt-hero__stat">
            <strong>WCAG 2.2 AA</strong>across the product
          </div>
        </div>
      </div>
    </div>
    <HeroVisual />
  </section>
);
