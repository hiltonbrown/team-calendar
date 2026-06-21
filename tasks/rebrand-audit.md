# Rebrand audit: LeaveSync to Team Calendar

Scope: marketing site (`apps/web`) plus packages it imports for branding,
copy, or metadata (`packages/seo`, `packages/design-system`). Display name
"Team Calendar", slug "teamcalendar", primary domain
https://teamcalendar.online.

Out of scope this pass: `apps/app`, `apps/api`, `apps/email`, `apps/docs`,
all domain packages, the database, ICS UID derivation (including the
`@ical.leavesync.app` suffix in `packages/feeds`), repo and `@repo/*`
package names.

Status legend: Done, Flagged (needs a separate decision or external action).

## Branding source of truth (Step 2)

| File | Change | Status |
|---|---|---|
| `packages/seo/branding.ts` (new) | Export `brandNameDisplay = "Team Calendar"`, `brandNameSlug = "teamcalendar"`, `primaryDomain = "https://teamcalendar.online"`. Placed at package root because `packages/seo` has a flat layout (no `src/`); proposed `src/branding.ts` would not match the convention. | Done |

## In-scope text, metadata, and assets (Step 3)

| File | Line | Current | Replacement | Status |
|---|---|---|---|---|
| `packages/seo/metadata.ts` | 11-17 | `applicationName = "next-forge"`, author/publisher/creator "Vercel" | brand name + author/publisher from `branding.ts` | Done |
| `apps/web/app/(home)/page.tsx` | 11,13 | "LeaveSync: ...", "LeaveSync gives employees..." | "Team Calendar ..." | Done |
| `apps/web/app/components/header/index.tsx` | 54 | `<span>LeaveSync</span>` | `<span>{brandNameDisplay}</span>` | Done |
| `apps/web/app/components/footer.tsx` | 39,61 | alt="LeaveSync", "© 2026 LeaveSync." | brand name | Done |
| `apps/web/app/(home)/components/image-showcase.tsx` | 7 | "LeaveSync updates calendars..." | brand name | Done |
| `apps/web/app/(home)/components/workflow-section.tsx` | 37 | "LeaveSync keeps the operational loop..." | brand name | Done |
| `apps/web/app/(home)/components/calendar-integration-section.tsx` | 162 | `https://leavesync.app/feeds/...` mock URL | `https://teamcalendar.online/feeds/...` | Done |
| `apps/web/app/blog/page.tsx` | 10,44 | "LeaveSync team" | "Team Calendar team" | Done |
| `apps/web/app/contact/page.tsx` | 8 | "...connecting LeaveSync to your Xero..." | brand name | Done |
| `apps/web/app/contact/components/contact-form.tsx` | 20 | "...connecting LeaveSync to your Xero..." | brand name | Done |
| `apps/web/app/integrations/xero/page.tsx` | multiple | "LeaveSync ..." prose | brand name | Done |
| `apps/web/app/pricing/page.tsx` | 8 | "LeaveSync pricing for Xero..." | brand name | Done |
| `apps/web/app/pricing/components/pricing-experience.tsx` | 110,115 | "...appear in LeaveSync availability..." | brand name | Done |
| `apps/web/app/features/page.tsx` | multiple | "LeaveSync ..." prose, "Added in LeaveSync", `<span>LeaveSync</span>` | brand name | Done |
| `apps/web/app/features/components/interactive-hero.tsx` | 711,821 | `api.leavesync.com` mock URL, "LeaveSync pulls..." | `api.teamcalendar.online`, brand name | Done |
| `apps/web/app/features/components/sync-pathway-strip.tsx` | 82,144 | "Submitted once in LeaveSync.", "LeaveSync" node | brand name | Done |
| `apps/web/app/changelog/page.tsx` | 8,26 | "LeaveSync product updates..." | brand name | Done |
| `apps/web/app/security/page.tsx` | multiple | "LeaveSync ..." prose, `security@leavesync.com` | brand name, `security@teamcalendar.online` | Done |
| `apps/web/src/data/changelog.ts` | 66,95 | "LeaveSync now publishes...", "LeaveSync connects..." | brand name | Done |
| `apps/web/app/styles/home.css` | 1561 | `.is-leavesync` class | `.is-teamcalendar` (+ TSX usage) | Done |
| `apps/web/src/content/blog/introducing-leavesync.mdx` | title/body | "Introducing LeaveSync", body prose | "Introducing Team Calendar"; file renamed (slug form) to `introducing-teamcalendar.mdx` | Done |
| `apps/web/src/content/blog/ics-feeds-explained.mdx` | 3,5,14,16 | "LeaveSync ..." prose | brand name | Done |
| `apps/web/app/icon.svg` | aria-label | "LeaveSync" | "Team Calendar" (App Router favicon convention file; missed in first pass, caught by Step 5 re-search) | Done |
| `apps/web/app/apple-icon.svg` | aria-label | "LeaveSync" | "Team Calendar" (App Router apple-touch-icon convention file) | Done |
| `apps/web/public/marketing/brand-mark.svg` | aria-label | "LeaveSync" | "Team Calendar" | Done |
| `apps/web/public/marketing/brand-wordmark-inverse.svg` | aria-label + `<text>` | "LeaveSync" | "Team Calendar" (viewBox widened for longer wordmark) | Done |
| `apps/web/public/marketing/features-favicon.svg` | aria-label | "LeaveSync" | "Team Calendar" | Done |
| `apps/web/public/marketing/features-logo-dark.svg` | aria-label | "LeaveSync" | "Team Calendar" | Done |
| `apps/web/public/marketing/README.md` | 7,17 | "LeaveSync mark", "docs/LeaveSync Marketing.html" | brand name (the source HTML filename left as a historical reference) | Done |
| `packages/design-system/styles/globals.css` | 12,71 | `/* LeaveSync light/dark mode */` comments | brand name | Done |

## Config (Step 4)

| File | Change | Status |
|---|---|---|
| `apps/web/.env.example` | Header comment "LeaveSync web" to "Team Calendar web" | Done |

## Out of scope, flagged for separate initiative

| Item | Reason |
|---|---|
| Shared metadata propagation | `createMetadata` (packages/seo) is also imported by `apps/app/(unauthenticated)/sign-in` and `sign-up`. Setting `applicationName` to "Team Calendar" changes those two out-of-scope pages' title suffix (previously the scaffold default "next-forge", never "LeaveSync"). Accepted as a net improvement; noted here because it touches apps/app output. |
| Twitter/X handle | `packages/seo/metadata.ts` `twitterHandle` was `@vercel`. No verified Team Calendar handle exists; left as a TODO marker rather than inventing one. Must be set before launch. |
| Production domain env | `NEXT_PUBLIC_WEB_URL` / `VERCEL_PROJECT_PRODUCTION_URL` resolve the canonical URL at runtime. Setting these to `teamcalendar.online` in deployed environments is a Vercel/infra change, not a code change. |
| `security@teamcalendar.online` mailbox | Copy now points at this address; the mailbox must actually be provisioned. |
| Secondary domains (`.au`, `.com.au`, `.uk`, `.nz`, `.digital`) | 301 redirects to primary, configured at DNS/Vercel level. No code. |
| Logo / wordmark assets | Current marks are abstract bars plus a styled text wordmark; only embedded brand text was swapped. A purpose-designed Team Calendar logo is still needed. |
| `apps/web/apps/web/.env.local` | Stray nested `.env.local` (gitignored). Looks accidental; left untouched, flagged for cleanup. |
| ICS UID `@ical.leavesync.app` suffix | Persisted/published identifier in `packages/feeds`. Higher-risk, separate decision. Not changed. |
| Old brand in non-web code | ~280 `leavesync` references remain across `apps/app`, `apps/api`, domain packages, docs (`PRODUCT.md`, `DESIGN.md`, etc.), and `@repo/*` identifiers. Out of scope this pass. |
