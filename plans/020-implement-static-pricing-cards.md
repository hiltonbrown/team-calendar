# Plan 020: Replace Clerk pricing table fallback with static catalogue-driven pricing cards

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a38876d..HEAD -- apps/web/app/pricing packages/database/src/seed/plans.ts apps/web/app/styles/features.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/006-pricing-funnel-decision.md
- **Category**: direction
- **Planned at**: commit `a38876d`, 2026-07-05

## Why this matters

The public pricing page currently shows visitors a fallback card reading "Plans are being finalised. We are putting the finishing touches on billing. Tell us about your team and we will size the right plan with you." Meanwhile, the product app has a fully functional direct Stripe billing integration. Using Clerk Billing on the marketing site would fork the subscription source of truth (Clerk state vs direct Stripe/webhook mirrored state). Following the maintainer's approval, this plan implements Option B: replacing the height-measurement Clerk `<PricingTable />` fallback with custom, static React pricing cards driven by the internal plan catalogue specs and styled with the design system's tonal layering.

## Current state

The files and configurations as they exist today:

1. **Pricing Plans Component:**
   `apps/web/app/pricing/components/pricing-plans.tsx` imports Clerk Billing components, mounts a scoped `ClerkProvider`, and uses a `ResizeObserver` + `setTimeout` fallback hack to detect when Clerk renders an empty table:
   ```typescript
   // apps/web/app/pricing/components/pricing-plans.tsx:64-70
   const PlansTable = () => {
     const ref = useRef<HTMLDivElement>(null);
     const [isEmpty, setIsEmpty] = useState(false);
   ```

2. **Styling features:**
   `apps/web/app/styles/features.css` defines the skeleton styles (lines 2354–2415) and fallback card styling:
   ```css
   /* apps/web/app/styles/features.css:2417-2422 */
   .fmkt-plan-fallback {
     display: grid;
     gap: 14px;
     justify-items: center;
     max-width: 560px;
   ```
   And collapses the skeleton to 1fr on mobile:
   ```css
   /* apps/web/app/styles/features.css:3087-3090 */
   .fmkt-pricing-setup__grid,
   .fmkt-plan-skeleton {
     grid-template-columns: 1fr;
   }
   ```

3. **Plan Catalogue:**
   `packages/database/src/seed/plans.ts` defines features and limits for `PLAN_CATALOGUE` (Basic, Premium, Enterprise). Feature counts/limits are defined, but price dollar amounts are omitted as they live in Stripe.

4. **Conventions and brand constraints:**
   - Font: Plus Jakarta Sans (via css variable `var(--marketing-font)`).
   - Border radius: 16px.
   - Primary brand color: `#336A3B` (deep forest green).
   - Tonal layering: No borders for separation, use tonal surface shifts (e.g. using `var(--marketing-surface-container)` or similar).
   - Australian English (e.g., "organisation").

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Lint check | `bun run check` | exit 0, no errors |
| Project build | `bun run build` | exit 0, no errors |

## Scope

**In scope** (only files you should modify):
- `apps/web/app/pricing/constants.ts` (create)
- `apps/web/app/pricing/components/pricing-plans.tsx`
- apps/web/app/styles/features.css
- `packages/database/src/seed/plans.ts` (comments only)

**Out of scope**:
- Direct Stripe dashboard updates or environment secret additions.
- Adding Clerk billing components.

## Git workflow

- Branch: `preview`
- Commit message: `feat(marketing): replace Clerk table with static pricing cards`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `apps/web/app/pricing/constants.ts`

Create a new file `apps/web/app/pricing/constants.ts` defining `MARKETING_PLANS` corresponding to Option B. Ensure features and limits align with `PLAN_CATALOGUE` in `packages/database/src/seed/plans.ts`, and public pricing amounts are hardcoded.

Add a prominent cross-reference comment linking to `packages/database/src/seed/plans.ts` to aid future updates.

```typescript
// apps/web/app/pricing/constants.ts
/**
 * NOTE: If plans, features, or limits change in the database seed catalogue
 * (packages/database/src/seed/plans.ts), update these constants accordingly.
 */
export interface PlanCardDetails {
  readonly name: string;
  readonly price: string;
  readonly interval: string;
  readonly description: string;
  readonly features: string[];
  readonly ctaText: string;
  readonly ctaHref: string;
  readonly highlighted: boolean;
}

export const MARKETING_PLANS: readonly PlanCardDetails[] = [
  {
    name: "Basic",
    price: "$19",
    interval: "mo",
    description: "For small teams starting with calendar publishing",
    features: [
      "1 Xero Payroll organisation",
      "Up to 2 calendar feeds",
      "Up to 10 user seats",
      "Manual availability entries",
      "Basic sync health dashboard"
    ],
    ctaText: "Get started",
    ctaHref: "/sign-up",
    highlighted: false
  },
  {
    name: "Premium",
    price: "$49",
    interval: "mo",
    description: "For growing teams needing advanced coverage",
    features: [
      "2 Xero Payroll organisations",
      "Unlimited calendar feeds",
      "Up to 50 user seats",
      "Manual availability entries",
      "Advanced sync health dashboard",
      "Analytics & leave reports",
      "Priority support"
    ],
    ctaText: "Get started",
    ctaHref: "/sign-up",
    highlighted: true
  },
  {
    name: "Enterprise",
    price: "Custom",
    interval: "",
    description: "For multi-entity payroll and guided rollout support",
    features: [
      "Multiple Xero Payroll organisations",
      "Custom calendar feeds",
      "Unlimited user seats",
      "Manual availability entries",
      "Advanced sync health dashboard",
      "Implementation partner support",
      "Guided rollout & onboarding"
    ],
    ctaText: "Talk to us",
    ctaHref: "#contact",
    highlighted: false
  }
] as const;
```

**Verify**: The file compiles.

---

### Step 2: Replace `apps/web/app/pricing/components/pricing-plans.tsx`

Completely rewrite `apps/web/app/pricing/components/pricing-plans.tsx`. Remove all Clerk authentication, loading state, skeleton, height-observer, and Clerk billing imports.
Render clean, semantic React components using the `MARKETING_PLANS` constant. Use standard Next `Link` from `next/link` for navigation:
- "Basic" and "Premium" CTAs link to `/sign-up`.
- "Enterprise" CTA links to `#contact` to jump to the page's enquiry contact form.

```tsx
"use client";

import { MARKETING_PLANS } from "../constants";
import Link from "next/link";

export const PricingPlans = () => {
  return (
    <div className="fmkt-pricing-cards">
      {MARKETING_PLANS.map((plan) => (
        <div
          key={plan.name}
          className={`fmkt-pricing-card ${plan.highlighted ? "fmkt-pricing-card--highlighted" : ""}`}
        >
          {plan.highlighted && (
            <div className="fmkt-pricing-card__badge">Most Popular</div>
          )}
          <div className="fmkt-pricing-card__header">
            <h3 className="fmkt-pricing-card__title">{plan.name}</h3>
            <p className="fmkt-pricing-card__description">{plan.description}</p>
            <div className="fmkt-pricing-card__price-wrap">
              <span className="fmkt-pricing-card__price">{plan.price}</span>
              {plan.interval && (
                <span className="fmkt-pricing-card__interval">/{plan.interval}</span>
              )}
            </div>
          </div>
          <ul className="fmkt-pricing-card__features">
            {plan.features.map((feature) => (
              <li key={feature} className="fmkt-pricing-card__feature">
                <span className="fmkt-pricing-card__feature-icon" aria-hidden="true">✓</span>
                {feature}
              </li>
            ))}
          </ul>
          <div className="fmkt-pricing-card__footer">
            <Link
              href={plan.ctaHref}
              className={`marketing-btn ${plan.highlighted ? "marketing-btn--primary" : "marketing-btn--secondary"}`}
            >
              {plan.ctaText}
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
};
```

**Verify**: `bun run typecheck` succeeds without issues.

---

### Step 3: Implement pricing cards layout and styles in CSS

In `apps/web/app/styles/features.css`:
1. Remove/replace the `.fmkt-plan-skeleton` styling blocks (lines 2354–2415) since they are obsolete.
2. In the responsive rules (line 3088), replace `.fmkt-plan-skeleton` with `.fmkt-pricing-cards` to collapse the cards grid to 1fr on mobile.
3. Append styles for `.fmkt-pricing-cards`, `.fmkt-pricing-card`, and their sub-elements using brand-compliant styling:
   - Cards grid: 3-column layout (`repeat(3, 1fr)`) with `gap: 24px`.
   - Cards: 16px border-radius, padding `32px`, flex direction column, background `var(--marketing-surface-container)` (tonal layering, no borders).
   - Highlighting: `fmkt-pricing-card--highlighted` has a slight elevation/scale or distinct surface shift (e.g. background `var(--marketing-surface-low)` or a subtle accent border matching `#336A3B` forest green).
   - Badge: `#336A3B` background with white text, positioned at the top.
   - Text styling matching Outfit / Plus Jakarta Sans.
   - Check marks styled elegantly in forest green or accent color.

**Verify**: The CSS file parses correctly with clean styling.

---

### Step 4: Add cross-reference comments in DB plans catalog

Add a comment in `packages/database/src/seed/plans.ts` at line 12 referring back to `apps/web/app/pricing/constants.ts` to aid developer synchronization:

```typescript
// packages/database/src/seed/plans.ts:12
// NOTE: If plan features or limits change here, ensure to synchronize the public
// marketing constants in apps/web/app/pricing/constants.ts.
export const PLAN_CATALOGUE = [
```

**Verify**: `bun run check` and `bun run build` succeed across all workspaces.

---

## Test plan

1. Run the marketing site locally on port 3001:
   `cd apps/web && bun run dev`
2. Perform a test curl check on the pricing page:
   `curl -s http://localhost:3001/pricing | grep -E "Starter|Premium|Enterprise|Basic"`
3. Confirm that the pricing table is visible and correctly references the static plan information.
4. Stop the dev server.

## Done criteria

- [ ] `apps/web/app/pricing/constants.ts` exists and specifies all static plans.
- [ ] `apps/web/app/pricing/components/pricing-plans.tsx` contains no Clerk Billing imports/logic and renders the three plan cards.
- [ ] Obsolete skeleton CSS rules removed from `apps/web/app/styles/features.css` and replaced with the cards styles.
- [ ] Cross-reference comments are present in both plan definition files.
- [ ] `bun run check` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `bun run build` exits 0.

## STOP conditions

- You observe another pricing cards page in `apps/web` or `apps/app` that conflicts with this layout.
- An in-scope file has drifted significantly from the excerpts provided.

## Maintenance notes

- Any future changes to Stripe Prices or DB schema plan seed definitions must update the marketing plan constants (`apps/web/app/pricing/constants.ts`).
- Reviewers should verify that the border radius, colors, and margins comply strictly with `DESIGN.md` guidelines.
