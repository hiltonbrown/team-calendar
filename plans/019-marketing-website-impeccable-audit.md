# Marketing Website Impeccable Audit

Date: 2026-06-18  
Surface: `apps/web` public marketing site  
Audit type: `$impeccable audit`, technical quality, not implementation

## Anti-Patterns Verdict

Fail. The strongest home and features surfaces are recognisably more bespoke than the scaffold pages, but the whole marketing site still carries visible AI-generation tells:

- Repeating diagonal stripe fills for pending calendar states in `apps/web/app/styles/features.css:207` and `apps/web/app/styles/features.css:240`.
- Ghost-card treatment, persistent cards mixing borders, backdrop blur, and large soft shadows in `apps/web/app/styles/features.css:91`, `apps/web/app/styles/features.css:122`, and `apps/web/app/styles/features.css:2517`.
- Over-rounded section and card shapes at `24px` and `28px` in `apps/web/app/styles/features.css:2501` and `apps/web/app/styles/features.css:3162`.
- Repeated tiny uppercase section labels across legacy and feature pages, for example `apps/web/app/integrations/xero/page.tsx:94`, `apps/web/app/integrations/xero/page.tsx:172`, and `apps/web/app/security/page.tsx:76`.
- Several routes still look like next-forge scaffold pages rather than the same brand system as `/` and `/features`, especially `/security`, `/integrations/xero`, `/contact`, `/blog`, and `/changelog`.

This does not read as broken, but it does read uneven: part bespoke marketing experience, part generated SaaS template.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|---:|---:|---|
| 1 | Accessibility | 2/4 | Focus is removed from invisible calendar-cell buttons, and some routes have weak heading/form semantics. |
| 2 | Performance | 2/4 | Production build is env-fragile, visual assets are large, and scroll animation/shadow/blur work is heavy. |
| 3 | Responsive Design | 2/4 | Core pages have breakpoints, but multiple marketing mocks rely on wide `min-width` horizontal scrolling. |
| 4 | Theming | 2/4 | Marketing tokens exist, but hard-coded colours and unscoped legacy Tailwind routes dilute the system. |
| 5 | Anti-Patterns | 1/4 | Several explicit impeccable bans are present: repeating stripes, ghost cards, over-rounding, repeated eyebrows. |
| **Total** |  | **9/20** | **Poor, major overhaul recommended before launch.** |

## Executive Summary

Audit Health Score: **9/20** (Poor)  
Issues found: **0 P0, 7 P1, 6 P2, 3 P3**

Top issues:

- Build depends on Vercel-only production URL state for `robots.ts` and `sitemap.ts`; without `VERCEL_PROJECT_PRODUCTION_URL`, static generation fails.
- Interactive calendar cells in the features sandbox suppress focus outlines while remaining keyboard-focusable controls.
- The marketing site is visually split between polished `fmkt-*` pages and older scaffold-style routes.
- Several CSS patterns directly violate the project design rules and the impeccable absolute bans.
- Responsive handling often uses horizontal scroll as the solution for calendar mocks, which is acceptable for data tables but rough for a marketing page.

Recommended path:

1. `$impeccable harden apps/web`
2. `$impeccable polish apps/web`
3. `$impeccable adapt apps/web`
4. `$impeccable quieter apps/web`
5. Re-run `$impeccable audit apps/web`

## Detailed Findings

### [P1] Production build is brittle outside Vercel

Location: `apps/web/app/robots.ts:4`, `apps/web/app/robots.ts:7`, `apps/web/app/sitemap.ts:13`, `apps/web/app/sitemap.ts:16`  
Category: Performance / Reliability  
Impact: Static generation of `/robots.txt` and `/sitemap.xml` fails when `VERCEL_PROJECT_PRODUCTION_URL` is absent, producing `"http://" cannot be parsed as a URL.` This blocks local production builds and any non-Vercel build path.  
WCAG/Standard: Production readiness  
Recommendation: Derive the canonical site URL from `NEXT_PUBLIC_WEB_URL` first, then fall back to `VERCEL_PROJECT_PRODUCTION_URL`, and validate before constructing `new URL()`. Keep one helper shared by robots, sitemap, and SEO metadata.  
Suggested command: `$impeccable harden apps/web`

### [P1] Focus indication is removed from interactive sandbox cells

Location: `apps/web/app/styles/features.css:184`, `apps/web/app/features/components/interactive-hero.tsx:490`  
Category: Accessibility  
Impact: The overlay calendar buttons can be focused and toggled by keyboard, but `.ft-sandbox-cell-btn` sets `outline: none` and provides only hover styling. Keyboard users can land on invisible controls with no visible position.  
WCAG/Standard: WCAG 2.2 AA, Focus Visible, 2.4.7  
Recommendation: Add a `:focus-visible` style that draws an inset ring or cell tint without shifting layout. If the overlay buttons are only a pointer affordance, remove them from the tab order and expose one coherent keyboard model elsewhere.  
Suggested command: `$impeccable polish apps/web`

### [P1] Contact page has no page-level heading and weak form semantics

Location: `apps/web/app/contact/components/contact-form.tsx:58`, `apps/web/app/contact/components/contact-form.tsx:86`, `apps/web/app/contact/components/contact-form.tsx:123`  
Category: Accessibility  
Impact: The main page title is an `h4`, so assistive technology users do not get a proper page-level heading. The date label points at `picture`, the same id used by the file input, and the date picker trigger has no matching id.  
WCAG/Standard: WCAG 2.2 AA, Info and Relationships, 1.3.1; Labels or Instructions, 3.3.2  
Recommendation: Use `h1` for "Get in touch", give the date trigger a real id or accessible name connected to the label, and avoid reusing `picture` for unrelated fields.  
Suggested command: `$impeccable harden apps/web/contact`

### [P1] Tab pattern is incomplete

Location: `apps/web/app/(home)/components/calendar-integration-section.tsx:398`, `apps/web/app/(home)/components/calendar-integration-section.tsx:404`  
Category: Accessibility  
Impact: The tab buttons set `role="tab"` and `aria-selected`, but they do not have ids, `aria-controls`, or a corresponding `tabpanel`. Screen reader users get tab semantics without the expected panel relationship.  
WCAG/Standard: WAI-ARIA Authoring Practices, Tabs pattern  
Recommendation: Either complete the tab pattern with `tablist`, `tab`, `tabpanel`, ids, `aria-controls`, and roving `tabIndex`, or simplify to a segmented button group if the current content swap does not need tab semantics.  
Suggested command: `$impeccable harden apps/web`

### [P1] Explicit repeating stripe backgrounds violate the design rules

Location: `apps/web/app/styles/features.css:207`, `apps/web/app/styles/features.css:240`  
Category: Anti-Pattern / Theming  
Impact: The pending leave state uses `repeating-linear-gradient(...)`, which the impeccable guidance explicitly bans as a Codex decoration tell. It also hard-codes colours and uses `!important`, making state styling hard to theme.  
WCAG/Standard: Project design rules, impeccable anti-pattern rules  
Recommendation: Replace stripes with a tokenised state treatment: dashed outline, small pending badge, icon, or tonal container. Remove hard-coded hex and `!important`.  
Suggested command: `$impeccable quieter apps/web/features`

### [P1] Persistent content surfaces use glass/card/shadow mixtures

Location: `apps/web/app/styles/features.css:91`, `apps/web/app/styles/features.css:122`, `apps/web/app/styles/features.css:2517`, `apps/web/app/styles/features.css:2533`  
Category: Anti-Pattern / Performance / Theming  
Impact: Persistent content cards use border, shadow, blur, and translucent fills together. That conflicts with `DESIGN.md`, where frost and blur are reserved for elevated transient UI, and it increases paint work on a page already using sticky sections and scroll animations.  
WCAG/Standard: Project design rules  
Recommendation: Convert persistent cards to tonal layering only. Keep blur for sticky header chrome and popovers, not dashboard mock cards.  
Suggested command: `$impeccable quieter apps/web/features`

### [P1] Legacy marketing routes do not match the newer marketing system

Location: `apps/web/app/security/page.tsx:73`, `apps/web/app/security/page.tsx:97`, `apps/web/app/integrations/xero/page.tsx:91`, `apps/web/app/integrations/xero/page.tsx:126`, `apps/web/app/blog/page.tsx:26`, `apps/web/app/changelog/page.tsx:25`  
Category: Anti-Pattern / Theming / Brand consistency  
Impact: Several public routes still use generic scaffold Tailwind layouts (`bg-muted`, `rounded-2xl`, repeated card grids, uppercase tracked labels). Visitors moving from `/` or `/features` to these pages see a different product quality bar.  
WCAG/Standard: Brand consistency and design-system governance  
Recommendation: Pull these pages into the same marketing layout vocabulary, or create a lower-density article/support page system that still uses the marketing tokens and spacing rhythm.  
Suggested command: `$impeccable polish apps/web`

### [P2] Horizontal scrolling is used too often as the responsive fallback

Location: `apps/web/app/styles/home.css:598`, `apps/web/app/styles/home.css:656`, `apps/web/app/styles/shell.css:314`, `apps/web/app/styles/features.css:1386`, `apps/web/app/styles/features.css:1585`, `apps/web/app/styles/features.css:4234`  
Category: Responsive  
Impact: Calendar and product mocks use `min-width` values from 680px to 1080px and rely on `overflow-x: auto`. That preserves detail but creates a fiddly mobile marketing experience where the primary proof object can be partly hidden.  
WCAG/Standard: WCAG 2.2 AA, Reflow, 1.4.10 where content is not a true data table  
Recommendation: Keep horizontal scroll for genuine calendar-table demos, but provide mobile-specific summary compositions for hero/proof sections. Use cropped screenshots, stacked day strips, or a reduced five-day mock instead of forcing full desktop mocks.  
Suggested command: `$impeccable adapt apps/web`

### [P2] Large source images increase optimisation and deployment cost

Location: `apps/web/public/marketing/Image_5.png`, `apps/web/public/marketing/Image_6.png`, `apps/web/public/marketing/week-planning.png`, `apps/web/public/marketing/team-calendar.png`  
Category: Performance  
Impact: Several marketing PNGs are 2.4 MB to 3.1 MB each before Next optimisation. First builds, image optimisation, and cache misses cost more than necessary.  
WCAG/Standard: Core Web Vitals risk  
Recommendation: Convert large photographic/illustrative assets to AVIF or WebP, keep source dimensions aligned to rendered sizes, and reserve PNG only for assets that need lossless transparency.  
Suggested command: `$impeccable optimize apps/web`

### [P2] Scroll-driven motion is ambitious but broad

Location: `apps/web/app/styles/motion.css:248`, `apps/web/app/styles/motion.css:330`, `apps/web/app/styles/motion.css:374`, `apps/web/app/styles/motion.css:449`  
Category: Performance / Motion  
Impact: The page applies many view-timeline animations across sticky sections, cards, panels, and decorative leaves. There is reduced-motion handling, which is good, but the breadth raises paint and compositing risk on lower-power devices.  
WCAG/Standard: WCAG 2.2 AA, Animation from Interactions, 2.3.3 where relevant  
Recommendation: Keep the strongest hero/section choreography and remove repeated per-card parallax where it does not communicate state or improve comprehension.  
Suggested command: `$impeccable animate apps/web`

### [P2] Hard-coded colour values bypass the token system

Location: `apps/web/app/styles/home.css:2088`, `apps/web/app/styles/home.css:2276`, `apps/web/app/features/components/hero-section.tsx:14`, `apps/web/app/features/components/interactive-hero.tsx:254`, `apps/web/app/styles/features.css:530`  
Category: Theming  
Impact: Hard-coded sage, purple, error, white, and rgba values appear in CSS and TSX. This makes dark mode and future token changes unreliable, especially in interactive mocks that should demonstrate the canonical availability model.  
WCAG/Standard: Project design rules  
Recommendation: Move swatches and event tones to semantic CSS variables or typed token maps. Vendor colours can remain explicit only where they identify external brands.  
Suggested command: `$impeccable colorize apps/web`

### [P2] Over-rounded cards and sticky sections break the documented radius system

Location: `apps/web/app/styles/features.css:2501`, `apps/web/app/styles/features.css:3162`, `apps/web/app/styles/features.css:3517`, `apps/web/app/styles/features.css:3725`, `apps/web/app/styles/features.css:4388`  
Category: Anti-Pattern / Theming  
Impact: Several persistent content surfaces use `24px`, `28px`, or larger radii. The repository design rules call for 16px on cards/containers and 12px on inputs/small elements. The result feels softer and more generated than the product brand direction.  
WCAG/Standard: Project design rules  
Recommendation: Standardise persistent marketing cards at 16px unless there is a named art-direction exception. Keep full pills only for badges and compact tags.  
Suggested command: `$impeccable quieter apps/web`

### [P2] Repeated uppercase overlines make the content feel templated

Location: `apps/web/app/security/page.tsx:76`, `apps/web/app/integrations/xero/page.tsx:94`, `apps/web/app/integrations/xero/page.tsx:172`, `apps/web/app/styles/features.css:317`, `apps/web/app/styles/home.css:2112`  
Category: Anti-Pattern / Typography  
Impact: The marketing system leans heavily on small uppercase tracked labels. One strong label can work, but repeated labels across sections are an impeccable brand-register tell and weaken narrative pacing.  
WCAG/Standard: Brand register guidance  
Recommendation: Reserve overlines for real taxonomy. Use section titles, visual rhythm, and lead copy instead of a repeated kicker scaffold.  
Suggested command: `$impeccable typeset apps/web`

### [P3] Skeleton loading animations do not explicitly respect reduced motion

Location: `apps/web/app/(home)/components/calendar-integration-section.tsx:300`, `apps/web/app/(home)/components/calendar-integration-section.tsx:330`, `apps/web/app/(home)/components/calendar-integration-section.tsx:375`  
Category: Accessibility / Motion  
Impact: Inline skeleton styles animate with `pulse 1.5s infinite`. The global reduced-motion CSS may catch broad selectors elsewhere, but these inline styles are harder to govern and audit.  
WCAG/Standard: WCAG 2.2 AA, 2.3.3 where relevant  
Recommendation: Replace inline animated skeleton styles with CSS classes covered by the reduced-motion block, or render static skeletons until hydration completes.  
Suggested command: `$impeccable harden apps/web`

### [P3] Header logo image uses empty alt text beside visible brand text

Location: `apps/web/app/components/header/index.tsx:32`  
Category: Accessibility  
Impact: This is acceptable because the link also contains visible "LeaveSync" text. Keep it intentional and consistent. The footer uses `alt="LeaveSync"`, which may produce redundant announcement if adjacent text repeats the brand.  
WCAG/Standard: WCAG 2.2 AA, Non-text Content, 1.1.1  
Recommendation: Audit decorative versus informative logo use across header and footer so the brand link announces once.  
Suggested command: `$impeccable harden apps/web`

### [P3] `next-env.d.ts` changes between dev and production builds

Location: `apps/web/next-env.d.ts`  
Category: DX / Verification  
Impact: Running `next build` rewrites the route types import from `.next/dev/types/routes.d.ts` to `.next/types/routes.d.ts`. This creates noisy generated diffs during audits and build verification.  
WCAG/Standard: Repository hygiene  
Recommendation: Document the expected generated diff or add a post-build restore/check convention if this is unavoidable with the current Next version.  
Suggested command: `$impeccable harden apps/web`

## Patterns and Systemic Issues

- **Two marketing systems coexist.** `/` and `/features` use a bespoke `fmkt-*` system, while `/security`, `/integrations/xero`, `/contact`, `/blog`, and `/changelog` still use scaffold-style utility layouts.
- **Design-token adoption is partial.** `apps/web/app/styles/tokens.css` is a good start, but home/features CSS and interactive TSX still hard-code many core colours.
- **Calendar mocks are doing too much on mobile.** Multiple views preserve desktop density with horizontal scroll rather than designing a mobile proof state.
- **Motion and surface depth need pruning.** The brand has a strong motion layer, but persistent glass/shadow treatments and wide scroll animation coverage are adding cost without always improving comprehension.
- **Env validation is correctly strict, but URL construction is not defensive.** The public URL envs and Resend token validation fail early, which is good. `robots.ts` and `sitemap.ts` should be just as explicit about canonical URL requirements.

## Positive Findings

- The marketing app has a dedicated token bridge in `apps/web/app/styles/tokens.css`, which keeps most marketing colours tied back to the product design system.
- The home/features work uses real product-context imagery and product mocks rather than purely decorative abstract blocks.
- Reduced-motion handling exists in `apps/web/app/styles/motion.css:686` and `apps/web/app/styles/features.css:4819`.
- The calendar integration tablist includes keyboard arrow handling, which is a good foundation once the ARIA relationship is completed.
- `bun run typecheck` passes for `apps/web`.
- Production build passes with valid required env values, including `VERCEL_PROJECT_PRODUCTION_URL`.

## Verification

- Read `PRODUCT.md` and `DESIGN.md` through the impeccable context script.
- Read impeccable `audit`, `brand`, and `product` references.
- Inspected representative marketing pages, shared shell CSS, marketing tokens, home/features CSS, motion CSS, and contact/security/integration routes.
- Ran static scans with `rg` for ARIA, headings, images, hard-coded colours, shadows, blur, responsive fixed widths, and anti-patterns.
- Ran `node /home/hilton/.agents/skills/impeccable/scripts/detect.mjs --json apps/web/app apps/web/src`: returned `[]`.
- Ran `bun run typecheck` in `apps/web`: passed.
- Ran `bun run build` in `apps/web`: initially failed on invalid local env values, then failed without `VERCEL_PROJECT_PRODUCTION_URL`, then passed with valid local public URLs, a syntactically valid dummy `RESEND_TOKEN`, and `VERCEL_PROJECT_PRODUCTION_URL=localhost:3001`.
- Did not run Lighthouse, Playwright, or axe because no Playwright/axe/Lighthouse dependency is installed in the repo. Browser screenshot verification was not performed.

## Recommended Actions

1. **[P1] `$impeccable harden apps/web`**: Fix production URL handling in `robots.ts` and `sitemap.ts`, complete tab semantics, and correct contact form heading/label structure.
2. **[P1] `$impeccable polish apps/web`**: Bring legacy public routes into the same marketing system as `/` and `/features`.
3. **[P1] `$impeccable quieter apps/web/features`**: Remove repeating stripes, ghost-card treatments, over-rounding, broad glass effects, and repeated overline scaffolding.
4. **[P2] `$impeccable adapt apps/web`**: Replace wide horizontal-scroll marketing mocks with mobile-specific proof compositions where the mock is not a true data table.
5. **[P2] `$impeccable optimize apps/web`**: Convert large PNG marketing assets to lighter production formats and prune non-essential scroll animation work.
6. **[P2] `$impeccable colorize apps/web`**: Move hard-coded event and swatch colours into semantic tokens.
7. **[Final] `$impeccable polish apps/web`**: Final visual, a11y, and responsive pass after the targeted fixes.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `$impeccable audit apps/web` after fixes to see your score improve.
