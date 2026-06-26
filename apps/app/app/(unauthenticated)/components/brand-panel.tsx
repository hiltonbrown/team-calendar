import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import { brandNameDisplay } from "@repo/seo/branding";
import { AvailabilityGrid } from "./availability-grid";
import { BrandGlyph } from "./brand-glyph";
import { TimeGreeting } from "./time-greeting";

// The desktop welcome surface: brand mark, a time-aware greeting, and a living
// availability motif that previews what the product is for. Hidden below lg,
// where MobileBrand carries the identity instead.
export const BrandPanel = () => (
  <aside className="auth-panel relative hidden overflow-hidden lg:flex lg:flex-col">
    <div className="relative z-10 flex h-full flex-col gap-10 p-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandGlyph animated className="size-9" onDark />
          <span
            className="font-semibold text-title-lg tracking-tight"
            style={{ color: "var(--auth-ink)" }}
          >
            {brandNameDisplay}
          </span>
        </div>
        <div className="auth-toggle">
          <ModeToggle />
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-9">
        <div
          className="auth-rise space-y-3"
          style={{ animationDelay: "120ms" }}
        >
          <p
            className="text-balance font-semibold text-display-sm tracking-tight"
            style={{ color: "var(--auth-ink)" }}
          >
            <TimeGreeting />
          </p>
          <p
            className="max-w-sm text-body-lg"
            style={{ color: "var(--auth-ink-soft)" }}
          >
            Sign in to see who is in, who is out, and why.
          </p>
        </div>
        <AvailabilityGrid />
      </div>

      <p
        className="max-w-md text-body-sm"
        style={{ color: "var(--auth-ink-soft)" }}
      >
        Approved leave and availability, published to secure calendar feeds.
        Xero stays your source of truth.
      </p>
    </div>
  </aside>
);

// Compact identity shown above the form on small screens, where BrandPanel is
// hidden, so mobile visitors still land on a branded page.
export const MobileBrand = () => (
  <div className="flex flex-col items-center gap-3 lg:hidden">
    <BrandGlyph className="size-11" />
    <span className="font-semibold text-foreground text-title-md tracking-tight">
      {brandNameDisplay}
    </span>
  </div>
);
