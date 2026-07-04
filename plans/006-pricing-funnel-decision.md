# Plan 006: Decide and specify the public pricing surface (spike, doc-only)

> **Executor instructions**: This is a design/spike plan. Your deliverable is a
> written report, not code. Do not modify any file outside `plans/`. Run every
> verification command and confirm the expected result. If anything in the
> "STOP conditions" section occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8790bdb..HEAD -- apps/web/app/pricing packages/database/src/seed/plans.ts packages/billing packages/availability/src/settings/billing-service.ts`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.
>
> **Preview branch note**: earlier-numbered plans land on `preview` before
> this one, so this diff will legitimately include their changes. Treat a
> mismatch as a STOP condition only when it is not explained by an earlier
> plan's documented scope; excerpt line numbers may have shifted accordingly.

## Status

- **Priority**: P1
- **Effort**: S (spike)
- **Risk**: LOW (doc-only)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `8790bdb`, 2026-07-02

## Why this matters

The public pricing page currently shows visitors a fallback card reading "Plans are being finalised. We are putting the finishing touches on billing. Tell us about your team and we will size the right plan with you." Meanwhile the product has a fully shipped Stripe billing stack: a plan catalogue, checkout, a customer portal, webhook mirroring, and an in-app upgrade flow gated to organisation owners. Every prospective self-serve customer is routed to "Talk to us" because the marketing surface and the billing backend are on two different rails. This spike inventories both rails, prices the options, and produces a recommendation the maintainer can act on. It deliberately does not implement anything: which rail wins is a product decision, and the dollar amounts for plans exist only in the Stripe dashboard, not in the repo.

## Current state

The two billing rails, verified in code:

**Rail 1: Clerk Billing (marketing page).** `apps/web/app/pricing/components/pricing-plans.tsx` is a client component that mounts a scoped `ClerkProvider` and renders Clerk's `<PricingTable />` (imports at lines 3-10). A comment at lines 12-15 explains: "The marketing site mounts no global ClerkProvider (auth is disabled in the root layout), so we scope one here around the table only." Because Clerk Billing evidently has no plans configured in the Clerk dashboard, the table renders empty; the component measures the rendered height after a 1.8 s settle window (comment at lines 60-63: "Clerk can load successfully yet render an empty table when no plans are configured in Billing") and swaps in `PlansFallback` (lines 47-58), the "Plans are being finalised" card.

**Rail 2: Direct Stripe (product).** `packages/database/src/seed/plans.ts` defines `PLAN_CATALOGUE`: Basic (limits: 2 feeds, 1 payroll entity, 10 seats; `priceId` from `STRIPE_PRICE_BASIC`), Premium (unlimited feeds, 2 payroll entities, 50 seats, analytics and priority support; `priceId` from `STRIPE_PRICE_PREMIUM`), Enterprise (`is_custom: true`, all limits -1, `priceId: null`). No dollar amounts exist anywhere in the repo; price ids reference Stripe Prices whose amounts live in the Stripe dashboard. `packages/billing` implements checkout and the hosted customer portal; `apps/api/app/webhooks/payments/route.ts` mirrors subscription state into `clerk_org_subscriptions`. `packages/availability/src/settings/billing-service.ts:121` gates the in-app upgrade flow: `hasUpgradeFlow: parsed.data.actingRole === "owner"`.

Documented constraints to honour in the report:

- PRODUCT.md: "Billing, plan limits, and usage are enforced at the Clerk Organisation level." CLAUDE.md documents `STRIPE_PRICE_BASIC` / `STRIPE_PRICE_PREMIUM` env vars and notes "Enterprise is custom quoted and has no price id."
- Brand: "Modern. Calm. Precise." (PRODUCT.md); the pricing page must not overpromise; Australian English; no em dashes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm no source changes | `git status --short` | only files under `plans/` |

## Scope

**In scope** (files you may create or modify):

- `plans/006-report-pricing-funnel.md` (create; the deliverable)
- `plans/README.md` (status row)

**Out of scope**: every other file. No code changes, no env changes, no Clerk or Stripe dashboard changes.

## Git workflow

- Branch: `preview` (shared branch for all plans; implement sequentially in plan-number order on top of the previous plan's commits)
- Commit message: `docs(plans): add pricing funnel decision report`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Inventory both rails precisely

Read, and summarise in the report with file:line citations:

1. `apps/web/app/pricing/components/pricing-plans.tsx` in full, plus the pricing page that mounts it (`apps/web/app/pricing/page.tsx` and siblings): what the visitor sees today, and what data the Clerk `<PricingTable />` would need to render.
2. `packages/billing/src/stripe.ts`: what checkout/portal capabilities exist (`resolvePlanKey`, checkout session creation, portal session creation).
3. `packages/database/src/seed/plans.ts` (`PLAN_CATALOGUE`) and `packages/database/src/seed/plan-sync.ts`: what plan facts the repo owns (names, limits, features) vs what only Stripe owns (amounts, currency, billing interval).
4. `packages/availability/src/settings/billing-service.ts` and `apps/app/app/(authenticated)/settings/billing/`: what the in-app upgrade journey already does, and for whom (`hasUpgradeFlow` is owner-only).

**Verify**: report section "Inventory" exists with citations for all four areas.

### Step 2: Specify the options with honest trade-offs

Write up three options (add a fourth only if the inventory reveals one):

- **Option A: configure Clerk Billing.** Keep `<PricingTable />`; configure plans in the Clerk dashboard mirroring `PLAN_CATALOGUE`. Assess: does the product then have two subscription sources of truth (Clerk Billing subscriptions vs the Stripe-webhook-mirrored `clerk_org_subscriptions`)? If yes, say so plainly; that conflict is the central argument against A.
- **Option B: static catalogue-driven pricing cards.** Replace `<PricingTable />` with server-rendered cards built from `PLAN_CATALOGUE` names/limits/features plus operator-supplied dollar amounts (a constants file in `apps/web`, since amounts are not in the repo). CTA links to sign-up; upgrade happens in-app via the existing owner-gated flow. No Clerk dependency on the marketing site.
- **Option C: fetch prices from the Stripe API** at build or request time using the existing price ids, so amounts stay single-sourced in Stripe. Assess the cost: a Stripe secret on the marketing site build, caching, and failure modes.

For each option: what changes where (files/dashboards), effort (S/M/L), risks, and what stays consistent with "Billing ... enforced at the Clerk Organisation level".

**Verify**: report section "Options" covers A, B, C with effort and risk each.

### Step 3: Recommend, and list the open questions for the maintainer

Make one recommendation with reasoning grounded in the inventory (the advisor's prior lean: B or C, because the shipped billing rail is direct Stripe and a second Clerk Billing rail would fork subscription truth; validate or refute this from what you find). Then list the decisions only the maintainer can make, each with a suggested default:

1. Which option (A/B/C)?
2. The public dollar amounts and billing interval for Basic and Premium (only the Stripe dashboard knows these).
3. Whether Enterprise stays "Talk to us" (suggested: yes; `is_custom: true` in the catalogue).
4. Whether the height-measurement fallback hack should be deleted regardless of option (suggested: yes, once the chosen rail renders deterministically).

**Verify**: report sections "Recommendation" and "Open questions" exist; `git status --short` shows only `plans/` changes.

## Test plan

Not applicable (doc-only). The follow-up implementation plan, written after the maintainer decides, will carry the test plan.

## Done criteria

- [ ] `plans/006-report-pricing-funnel.md` exists with sections: Inventory, Options, Recommendation, Open questions
- [ ] Every factual claim in the report carries a `file:line` citation or is labelled as an assumption
- [ ] `git status --short` shows changes only under `plans/`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- You find evidence that Clerk Billing is actually configured and the fallback fires for a different reason (that changes the whole framing).
- You find a second pricing surface elsewhere in `apps/web` that contradicts the pricing page.
- You are tempted to modify any source file. Do not; that is the follow-up plan's job.

## Maintenance notes

- Once the maintainer picks an option, write a fresh implementation plan (numbered 010+) from this report; do not retrofit implementation steps into this plan.
- If option B is chosen, the amounts constants file becomes the third place plan facts live (catalogue, Stripe, marketing); the report should propose a comment convention linking them.
