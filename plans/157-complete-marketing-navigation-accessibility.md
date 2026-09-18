# Plan 157: Complete marketing navigation accessibility

## Status

- Priority: P1
- Effort: S
- Risk: LOW
- Confidence: HIGH
- Category: accessibility, web
- Depends on: Impeccable final audit
- Planned at: `2d0e04b`, 2026-09-18
- Status: DONE

Implemented in `8b4be8c` and locally integrated as `da58f96`. The executor
passed 104 web tests, web typecheck, scoped Biome, Impeccable detector and diff
checks. The integrated web production build passed; it truthfully warned that
launch mode and production observability values remain unconfigured locally.

## Why this matters

The shared marketing header renders a skip link only for a subset of routes;
home, features, integrations, pricing, security, status and legal pages omit a
bypass mechanism. This fails WCAG 2.4.1 for repeated navigation. The mobile menu
also closes on Escape without returning focus to its trigger.

## Scope

- `apps/web/app/components/header/index.tsx`
- Header tests and route layouts/pages only where a consistent main target is
  missing

Use Impeccable Operate/audit guidance. Do not redesign the header or navigation.

## Implementation

1. Render one consistent, visually hidden-until-focused skip link for every
   public route and ensure its target is the page's primary main landmark.
2. Remove tests that encode deliberate skip-link absence and cover the shared
   bypass behaviour on representative routes.
3. Retain a ref to the mobile menu trigger and return focus after Escape closes
   the menu. Preserve click/outside/navigation close behaviour.
4. Add keyboard/focus regression tests.

## Verification

- Focused web header tests
- Web typecheck, scoped check and production build
- Browser keyboard check at mobile and desktop widths

## STOP conditions

Stop if public routes intentionally use multiple competing main landmarks; fix
the landmark contract rather than pointing the skip link at an arbitrary node.
