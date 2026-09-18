# Plan 122: Reshape `/customers` into an honest, specific “Who it’s for” page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Use the
> Impeccable design brief below as the authority for this surface. Modify only
> files listed under **In scope**. If a STOP condition occurs, stop and report it
> rather than improvising. The reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat e7ee7c7..HEAD -- apps/web/app/customers/page.tsx apps/web/app/customers/customers.module.css apps/web/app/customers/customers.test.ts apps/web/app/components/header/index.tsx apps/web/app/components/header/header.test.tsx apps/web/app/components/footer.tsx apps/web/app/components/footer.test.tsx apps/web/app/styles.css apps/web/app/styles/shell.css apps/web/app/styles/features.css apps/web/app/styles/style-loading.test.ts apps/web/app/'(home)'/layout.tsx apps/web/app/features/page.tsx apps/web/app/integrations/page.tsx apps/web/app/pricing/page.tsx`
> Compare every changed in-scope file with **Current state**. Changes from Plans
> 117–120 are expected only after those plans are DONE; any other material
> mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plan 120 DONE
- **Category**: direction
- **Planned at**: commit `e7ee7c7`, 2026-08-30
- **Findings combined**: malformed proposition; misleading “Customers” identity;
  absent authentic proof; AU/early-access and cohort-size drift; weak conversion
  hierarchy; missing main landmark and bypass link; generic icon-tile
  composition; long closing measure; card-radius drift; missing page regression
  tests; missing canonical/Open Graph URL and Australian locale; globally
  imported route-specific marketing CSS

## Why this matters

`/customers` currently calls itself “Customers” but contains no customer,
result, quote or case study. Its core sentence is malformed, its fit statement
omits the Australia-only early-access boundary, and its only contextual action
is a small text link. The generic icon-card template also fails to demonstrate
the Xero-to-calendar workflow that makes Team Calendar specific.

This plan follows the Impeccable critique recommendation: keep the stable URL,
rename the visible surface **Who it’s for**, and make it a truthful self-
qualification page until permissioned customer evidence exists. The finished
page helps a small Australian Xero Payroll team recognise its situation,
understand why Team Calendar fits, and choose an honest next step without
invented social proof or unsupported availability claims.

## Impeccable design brief

### Job and audience

- **Mode**: Persuade.
- **Visitor**: an Australian small-business owner, payroll administrator or
  operations manager evaluating whether Team Calendar fits a calendar-led team.
- **State of mind**: time-poor and cautious because the product touches payroll,
  leave and team availability. They need specificity and proof of fit, not hype.
- **Primary job**: decide within one short page whether their current workflow,
  team shape and launch region match the product, then contact Team Calendar.

### Outcome and proof

- The primary action is **Talk to us**, linking to `/contact`. Do not label the
  action “Apply” until the application flow named in the go-to-market plan is
  implemented and measurable.
- A secondary action links to `/integrations` as **See how it works**.
- Product proof comes from the shipped workflow, not testimonials: approved
  leave stays anchored in Xero Payroll; manual availability joins it in Team
  Calendar; the combined view publishes to Outlook, Google Calendar and Apple
  Calendar.
- The page says **Australian closed early access** and describes roughly 8–30
  people as the initial guided cohort, not a permanent product ceiling. Larger
  or multi-entity businesses are invited to discuss their setup.

### Selected direction

- Retain `/customers`, but use **Who it’s for** in metadata, the page kicker and
  the footer link label.
- Replace the interchangeable icon tiles with one authored fit surface: three
  scan rows for team size/admin burden, calendar-led planning, and mixed payroll/
  non-payroll availability. Icons sit beside headings without coloured tiles.
- Add a compact product-specific sequence: **Xero Payroll → Team Calendar →
  Outlook, Google Calendar and Apple Calendar**. It explains why these teams fit
  without pretending to be a customer case study.
- End with a constrained-measure AU early-access callout and button-sized CTA.
  The journey is recognition, product specificity, then action.

### Scope, states and anti-goals

- Production-ready responsive page, light and dark themes, keyboard and screen-
  reader accessible, safe at 200% zoom.
- Static Server Component. No loading, error or success state and no new client
  boundary.
- Do not add a questionnaire, form, decorative animation, testimonial, customer
  logo, quantified saving, refresh-time promise or new product capability claim.
- Do not rename `/customers`, redesign another page, or replace `DESIGN.md`.
- Keep Australian English and do not use em dashes.

### Layout and interaction

- One `<main id="customers-main" tabIndex={-1}>` landmark.
- A route-aware skip link appears before repeated header navigation on
  `/customers`, targets `#customers-main`, and uses the documented 3px focus
  ring. Do not add a broken global target to other routes.
- At 1440px the hero exposes primary and secondary actions and the fit/workflow
  composition is deliberate, not a 2+1 card grid. At 390px and 200% zoom,
  content and actions stack in reading order without horizontal scrolling.
- Persistent panels use 20px radii. CTA hit areas remain at least 44px. Body
  measure stays around 65–75 characters where practical.

## Current state

### Page identity, copy and semantics

`apps/web/app/customers/page.tsx:6-10` publishes:

```tsx
export const metadata: Metadata = createMetadata({
  description:
    "The Xero Payroll small businesses Team Calendar is built for, where leave admin has outgrown texts, forms and a shared calendar.",
  title: "Customers",
});
```

The same malformed sentence appears at lines 40–43. Lines 48–65 render three
`marketing-simple__panel` icon cards. Lines 67–89 end with an inline `/contact`
link. The root at line 31 is a `<div>`, while `apps/web/app/layout.tsx:23-25`
places route content directly between the shared header and footer, so the route
has no main landmark.

`apps/web/app/components/footer.tsx:17-21` labels `/customers` “Customers”. Keep
the `href`; change only the label.

### Launch and content truth

`plans/gtm-team-calendar-go-to-market-plan.md` is the current launch authority:

- lines 12–23: Australia-only closed early access; initial cohort is 8–12
  businesses with 8–30 people;
- lines 75–85: every public page must say Australian closed early access;
- lines 160–170: “Apply for early access” is not valid until the application
  flow exists;
- lines 283–289: submission, approval, Xero write-back, calendar publication,
  with Xero authoritative for balances.

`PRODUCT.md:40-44` says the product starts with small teams and grows with them.
Therefore 8–30 is a cohort description, not a permanent product limit.

### Existing exemplars and rules

- `apps/web/app/features/components/hero-section.tsx:21-34` demonstrates the
  established primary/secondary `marketing-btn` CTA structure.
- `apps/app/app/(authenticated)/layout.tsx:39-55` demonstrates the repository’s
  skip-link and focusable main-target behaviour. Adapt the behaviour, not app-
  specific styling.
- `apps/web/app/contact/contact.test.ts:1-14` demonstrates focused
  `renderToStaticMarkup` tests. Do not add whole-page snapshots.
- `DESIGN.md:140-157` defines Persuade mode, Australian English and WCAG 2.2 AA.
- `DESIGN.md:231-241` sets body measure at approximately 65–75 characters.
- `.impeccable.md:21-30` requires 20px persistent cards, 14px buttons, tonal
  layering and no decorative frost.
- `.impeccable.md:44-46` requires keyboard reachability and a visible 3px focus
  ring.

### Metadata

`packages/seo/metadata.ts:19-55` accepts additional Next metadata properties and
deep-merges them into defaults. Do not modify it in this plan. Pass page-specific
values from `customers/page.tsx`:

```tsx
alternates: { canonical: "/customers" },
openGraph: { locale: "en_AU", url: "/customers" },
```

If Plan 118 already makes `en_AU` the shared default, still assert the effective
locale in the page test; omit a redundant page override only when the test proves
the inherited value.

### Stylesheet loading

At `e7ee7c7`, `apps/web/app/styles.css` imports `home.css`, `features.css` and
`motion.css` from the root layout, so every route imports route-specific visual
systems. Plans 119–120 may move integrations selectors, but they do not remove
the need to verify `/customers` first-load CSS.

The installed Next.js 16 guide at
`apps/web/node_modules/next/dist/docs/01-app/01-getting-started/11-css.md:248-304`
permits CSS imports in an App Router page/layout and recommends keeping root
global CSS truly global. Use `customers.module.css` for this page. Before moving
any remaining route-specific root imports, map all consumers with `rg`, preserve
one import order, and never duplicate rule bodies.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `TMPDIR=/tmp bunx vitest run apps/web/app/customers/customers.test.ts apps/web/app/components/header/header.test.tsx apps/web/app/components/footer.test.tsx apps/web/app/styles/style-loading.test.ts` | all new tests pass |
| Focused lint | `bunx ultracite check apps/web/app/customers apps/web/app/components/header apps/web/app/components/footer.tsx apps/web/app/components/footer.test.tsx apps/web/app/styles/features.css apps/web/app/styles/style-loading.test.ts apps/web/app/'(home)'/layout.tsx apps/web/app/features/page.tsx apps/web/app/integrations/page.tsx apps/web/app/pricing/page.tsx` | exit 0, no fixes |
| Web typecheck | `bun run --cwd apps/web typecheck` | exit 0, no errors |
| Web tests | `TMPDIR=/tmp bun run --cwd apps/web test` | all web tests pass |
| Production build | `bun run --cwd apps/web build` | exit 0; `/customers`, `/`, `/features`, `/integrations` and `/pricing` build |
| Repository gates | `bun run check && bun run typecheck && TMPDIR=/tmp bun run test && TMPDIR=/tmp bun run test:integration` | every command exits 0 |
| Diff hygiene | `git diff --check` | exit 0, no output |

The `TMPDIR=/tmp` prefix is required in the current WSL environment; otherwise
Vitest targets an unavailable Windows temporary directory.

## Suggested executor toolkit

- Use the `impeccable` skill. Run its context script once for
  `apps/web/app/customers`, then read `reference/craft-floor.md` immediately
  before editing. The direction is decided here; do not run a new visual-world
  workshop.
- Read the installed Next.js CSS guide cited above before changing style entry
  points. Do not rely on remembered Next.js behaviour.
- If available, run `vercel:react-best-practices` after editing TSX files.
- Use browser verification in Impeccable’s bounded form: inspect desktop and
  mobile together, fix the observed defects in one batch, then perform at most
  one confirmation pass.

## Scope

**In scope** (the only source files the executor may modify):

- `apps/web/app/customers/page.tsx`
- `apps/web/app/customers/customers.module.css` (create)
- `apps/web/app/customers/customers.test.ts` (create)
- `apps/web/app/components/header/index.tsx`
- `apps/web/app/components/header/header.test.tsx` (create)
- `apps/web/app/components/footer.tsx`
- `apps/web/app/components/footer.test.tsx` (create)
- `apps/web/app/styles.css`
- `apps/web/app/styles/shell.css`
- `apps/web/app/styles/features.css` (shared-rule extraction only)
- `apps/web/app/styles/style-loading.test.ts` (create)
- `apps/web/app/(home)/layout.tsx` (create only if needed for scoped imports)
- `apps/web/app/features/page.tsx` (CSS import only)
- `apps/web/app/integrations/page.tsx` (CSS import only)
- `apps/web/app/pricing/page.tsx` (CSS import only)
- `plans/README.md` (status bookkeeping only)

**Out of scope**:

- Renaming or redirecting `/customers`.
- Changing `packages/seo/metadata.ts`, signup/application behaviour,
  `signUpHref`, launch-mode helpers or contact behaviour.
- Editing product capabilities, pricing, Xero logic or integrations copy.
- Adding customer names, quotes, logos, metrics, screenshots or stock imagery.
- Broad redesigns of other `marketing-simple` pages.
- Changing every existing shared panel to 20px. Apply the rule to new page-owned
  surfaces; shared-system reconciliation is separate.
- Modifying Plans 110–120 or undoing their completed source changes.

## Git workflow

- Branch: `preview` (`origin/preview`), not `main` or a plan-specific feature
  branch. The completed plan lands on `preview`.
- Work directly in the current working tree under `plans/README.md` § Execution
  policy.
- Commit: `feat(web): reshape customers page around audience fit`
- Do not push to `origin/preview` without operator instruction.
- Before changing branches, stop if `git status --short` contains user work that
  is not safely accounted for. Never overwrite Plans 110–120.

## Steps

### Step 1: Lock factual and semantic contracts with failing tests

Create `customers.test.ts` following the contact-page static-render pattern.
Assert:

- one `<main id="customers-main" tabindex="-1">`;
- visible identity “Who it’s for”, without a page heading/kicker claiming to
  present customers;
- grammatical metadata title/description, `/customers` canonical and Open Graph
  URL, and effective `en_AU` locale;
- Australian closed early access;
- 8–30 people described as the initial cohort, not an exclusion;
- the three fit dimensions and Xero → Team Calendar → calendar-client order;
- primary `/contact` and secondary `/integrations` links;
- absence of the malformed sentence, fake case-study claims and “Apply” CTA.

Create focused footer and header tests. Mock `usePathname()` in the header test:

- `/customers` renders a skip link to `#customers-main` before header content;
- another route does not render a broken customers-specific skip link;
- the footer retains `/customers` and labels it “Who it’s for”.

**Verify**: focused tests fail for the expected missing contracts before source
edits, then pass after Steps 2–5.

### Step 2: Correct identity, metadata, truth and conversion hierarchy

Update `customers/page.tsx` as a Server Component:

1. Keep the route and named metadata/default page exports.
2. Use metadata title “Who it’s for”; write one grammatical Australian-English
   description; add effective canonical, Open Graph URL and `en_AU` locale.
3. Use `<main id="customers-main" tabIndex={-1}>` as the root.
4. State Australian closed early access without claiming an application flow.
5. Add `Talk to us` as a primary `/contact` button and `See how it works` as a
   secondary `/integrations` button.
6. Describe 8–30 people as the initial cohort and leave a contact path for
   larger or multi-entity teams.

Update the footer label to “Who it’s for”; keep its route unchanged.

**Verify**: customer/footer tests pass. `rg -n "The Xero Payroll small businesses Team Calendar is built for|title: \"Customers\"" apps/web/app/customers apps/web/app/components/footer.tsx` returns no matches.

### Step 3: Replace generic tiles with a product-authored fit narrative

Remove the `customerTypes` icon-card rendering shape. Implement:

- a section heading orienting visitors to fit criteria;
- three semantic scan rows for team/admin burden, existing calendar behaviour,
  and mixed payroll/non-payroll people;
- decorative icons beside headings, confirmed `aria-hidden` in static output;
- a compact ordered workflow naming Xero Payroll, Team Calendar and Outlook,
  Google Calendar and Apple Calendar in the correct sequence;
- no heading, quote treatment or visual implying a real customer case study.

Use logical `h1` → `h2` → `h3` structure and semantic lists. Do not add a client
boundary.

**Verify**: customer test and web typecheck pass.

### Step 4: Create page-owned responsive styling at the craft floor

Create `customers.module.css`. Migrate page composition away from
`marketing-simple__grid--two`, `marketing-simple__panel`,
`marketing-simple__icon` and `marketing-simple__callout`.

Required outcomes:

- 20px persistent fit/workflow/callout radii;
- icons aligned with headings, without repeated 44px coloured tiles;
- 65–75-character practical body measure, including the closing callout;
- shared button classes and at least 44px CTA hit areas;
- one-column mobile reading order, no 2+1 orphan and no horizontal overflow;
- token-only colours, tonal layering and no decorative border/shadow/frost;
- inherited or explicit dark, forced-colours and reduced-motion support.

Add customers skip-link styling to `shell.css` only if Plan 117 did not provide
an appropriate shared pattern. It stays off-canvas until `:focus-visible`, uses
the documented 3px outline and appears above the sticky header.

**Verify**: lint/tests pass. Run the Impeccable detector exactly once against the
completed page source; `icon-tile-stack` and callout `line-length` do not recur.

### Step 5: Add a route-aware bypass link

In `components/header/index.tsx`, render “Skip to main content” only when
`usePathname()` resolves to `/customers` (handle a trailing slash if relevant).
Place it before repeated header content in DOM order and target
`#customers-main`. Do not refactor unrelated header behaviour.

**Verify**: header tests pass for customers and a non-customers route. In the
browser, first Tab reveals the link and Enter moves focus to the main target.

### Step 6: Remove route-specific CSS from the customers first-load graph

Map consumers first:

```bash
rg -n "fmkt-|tl-|marketing-" apps/web/app \
  --glob '*.{ts,tsx}' --glob '!**/*.test.*'
```

Reconcile the result with Plans 119–120, then:

1. Keep design-system globals, `tokens.css` and genuinely shared `shell.css` in
   root `styles.css`. Move the shared `.fmkt-page`, `.fmkt-container`,
   `.fmkt-overline`, `.fmkt-section-header` and `.fmkt-section-title` rule
   families from `features.css` into `shell.css`; do not duplicate their rule
   bodies.
2. Import any remaining `home.css`, `features.css` and `motion.css` only from
   layouts/pages that consume them. Use one consistent import order.
3. Do not alter markup or copy in home, features, integrations or pricing.
4. Add `style-loading.test.ts` that asserts root omission, required route owners
   and consistent ordering.

If the consumer map finds a route outside the allowlisted entry points, STOP
instead of leaving it unstyled or broadening scope.

**Verify**: style-loading tests, web build and web tests pass. Record before/
after built CSS bytes for `/customers`; the after value is lower and the first
load does not include home-only styles.

### Step 7: Run bounded visual and accessibility verification

Inspect `/customers` in one batched browser pass:

- 1440×1000 and 390×844, light and dark;
- 200% desktop zoom;
- keyboard order/focus, skip link and both CTAs;
- heading and landmark output;
- forced-colours if supported.

Check `/`, `/features`, `/integrations` and `/pricing` once at desktop and mobile
after style-entry changes. Fix defects in one batch and perform at most one
confirmation pass.

**Verify**: no overflow, clipped focus ring, orphaned row, unstyled rich route or
console error.

### Step 8: Run all gates and review the final diff

Run every command in **Commands you will need**. Confirm only in-scope files are
modified and Plans 110–120 are untouched.

**Verify**: every command exits 0; `git diff --check` has no output.

## Test plan

- `customers.test.ts`: metadata, main landmark, identity, AU early-access and
  cohort truth, fit criteria, workflow order, CTA targets and prohibited copy.
- `header.test.tsx`: customers skip-link target and non-customers absence.
- `footer.test.tsx`: stable route with “Who it’s for” label.
- `style-loading.test.ts`: global versus route-specific stylesheet ownership and
  import ordering.
- Follow `apps/web/app/contact/contact.test.ts`; use narrow static-render,
  metadata and source import-graph assertions, never snapshots.
- Mutation proof: separately restore the malformed lead, remove effective
  `en_AU`, and remove the main landmark. Each corresponding test must fail;
  revert each mutation immediately.

## Done criteria

- [ ] `/customers` stays stable while metadata, kicker and footer say “Who it’s
  for”.
- [ ] No malformed proposition, fake proof or unsupported application CTA.
- [ ] Australian closed early access and initial 8–30-person cohort are accurate
  without creating a permanent size ceiling.
- [ ] The page shows Xero → Team Calendar → calendar-client workflow.
- [ ] Primary `/contact` and secondary `/integrations` buttons are prominent.
- [ ] One focusable main landmark and a working route-aware skip link exist.
- [ ] Page-owned surfaces use 20px radii, readable measure, non-tiled icons and
  responsive reflow.
- [ ] Effective metadata includes `/customers` canonical/Open Graph URL and
  `en_AU`.
- [ ] `/customers` first-load CSS excludes route-specific home styling and is
  smaller than the recorded baseline.
- [ ] Focused tests, web tests/build, repository gates and diff hygiene pass.
- [ ] Desktop/mobile light/dark, 200% zoom and keyboard checks pass in no more
  than two browser rounds.
- [ ] Only in-scope files changed; Plans 110–120 remain untouched.
- [ ] `plans/README.md` status row is updated after execution.

## STOP conditions

Stop and report, do not improvise, if:

- Plan 120 is not DONE;
- current state has materially drifted beyond expected Plans 117–120 changes;
- authentic customer material is required, because none is authorised here;
- the operator wants `/customers` renamed or redirected;
- an “Apply” CTA is requested while the application flow is absent;
- launch mode or support is no longer Australia-only closed early access;
- CSS consumers exist outside allowlisted entry points;
- CSS splitting requires markup/copy changes to another route or exposes an
  unsafe cascade dependency;
- a verification fails twice after a reasonable correction;
- any out-of-scope file or concurrent Plan 110–120 would need modification.

## Maintenance notes

- When a permissioned quantified customer story exists, decide whether
  `/customers` should become a true case-study surface or case studies deserve
  their own route. Do not silently mix proof into this fit page.
- When the application flow ships, change the CTA separately with acquisition
  instrumentation and tests.
- When NZ or UK activates, update qualification and locale deliberately.
- Review claims, keyboard focus, mobile order, style ownership and the built
  `/customers` CSS delta closely.
