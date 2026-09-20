# Marketing homepage technical audit

**Remediation update, 20 September 2026:** All eight findings below have now
been addressed. The original audit is retained as the before-state record.
Verification details are appended at the end.

20 September 2026. Scope: current working-tree homepage `/`, its imported features components, header, footer and styles. Persuade mode. Audit only; no UI fixes applied.

## Implementation integrity verdict

**PASS, with isolated defects.** The implementation has a coherent, product-specific system: Xero write-back, calendar publication and provenance are represented consistently through shared tokens and components. The bundled detector returned **0 anti-patterns and 12 advisory notes**. This does not constitute accessibility clearance. The final CTA contains a contradictory promise, and hard-coded white foregrounds undermine dark-theme tokens.

## Health score

| Dimension | Score | Key finding |
|---|---:|---|
| Accessibility | 2/4 | Invalid timeline semantics, focus loss and unpausable motion |
| Performance | 3/4 | No obvious source-level bottleneck; production metrics not measured |
| Responsive design | 2/4 | Narrow touch controls and enlarged-text overflow |
| Theming | 2/4 | Dark final CTA fails text contrast |
| Implementation integrity | 3/4 | Coherent system with an inaccurate refresh promise |
| **Total** | **12/20** | **Acceptable: significant work needed** |

Scores are audit judgements, not conformance certification. **8 issues: P0 0, P1 3, P2 5, P3 0.** Prioritise CTA contrast, timeline semantics and motion controls, then focus and responsive behaviour.

## Findings

### 1. P1: Dark final CTA has insufficient contrast

- Location: `apps/web/app/styles/features.css:3153–3178`.
- Category: Accessibility / Theming.
- Evidence: after the theme transition, the primary sign-up link computes to `rgb(143, 212, 150)` on `rgb(255, 255, 255)`, approximately **1.7:1**. The heading, body and secondary link also retain white foregrounds on a light green gradient in dark mode; the screenshot visibly confirms their loss of contrast.
- Impact: visitors cannot comfortably read the final conversion section or its primary action.
- Standard: WCAG 1.4.3, 4.5:1 for normal text and 3:1 for large text.
- Recommendation: use semantic foreground/background pairs designed for this CTA in both themes; measure all gradient positions behind text.
- Suggested command: `$impeccable harden`.

### 2. P1: Timeline declares an invalid accessible table

- Location: `apps/web/app/(home)/components/team-timeline-section.tsx:748–835`.
- Category: Accessibility.
- Evidence: the Team column header and staff row headers are direct children of `role="table"`, rather than children of rows. Track rows contain buttons without cells.
- Impact: assistive technology cannot reliably associate entries with people and dates. Descriptive button labels help but do not repair the table structure.
- Standard: WCAG 1.3.1, information and relationships; ARIA table ownership requirements.
- Recommendation: provide valid row/header/cell ownership, or replace table semantics with a deliberate accessible list representation.
- Suggested command: `$impeccable harden`.

### 3. P1: Automatically moving diagram has no pause mechanism

- Location: `apps/web/app/features/components/sync-pathway-strip.tsx:116–132`.
- Category: Accessibility.
- Evidence: SVG particles use `repeatCount="indefinite"` beside the hero copy, without a pause control. Reduced-motion mode hides the particles, which is a useful separate accommodation.
- Impact: persistent movement competes with reading for visitors who have not enabled the OS preference.
- Standard: WCAG 2.2.2, moving content lasting over five seconds alongside other content needs a pause, stop or hide mechanism unless essential.
- Recommendation: finish the illustration within five seconds, or provide a keyboard-accessible pause control; retain the static reduced-motion alternative.
- Suggested command: `$impeccable animate`.

### 4. P2: Closing timeline details loses keyboard focus

- Location: `apps/web/app/(home)/components/team-timeline-section.tsx:368–408,844`.
- Category: Accessibility.
- Evidence: selecting an entry updates a plain detail div with no explicit relationship or announcement. Focusing Close details and pressing Enter leaves `document.activeElement` as `BODY`.
- Impact: keyboard users lose their place; screen-reader users must discover the newly populated details.
- Standard: focus-management and dynamic-content usability; this observation alone is not a complete WCAG failure determination.
- Recommendation: restore focus to the selected entry on close and associate or announce the detail update without unnecessarily moving focus on every selection.
- Suggested command: `$impeccable harden`.

### 5. P2: Week-navigation targets shrink below the intended touch size

- Location: `apps/web/app/styles/home.css:32–49,489–492`.
- Category: Responsive design.
- Evidence: actual coarse-pointer browser context at 320px produces approximately **26.2 × 44px** previous/next buttons. Flex shrinking defeats the declared 44px width. At 390px they are approximately 36.7px wide. Footer links are approximately 25.6px high.
- Impact: small targets are harder to tap accurately.
- Standard: the audit's 44px target criterion; dimensions alone do not prove failure of WCAG 2.5.8's 24px minimum with its spacing exceptions.
- Recommendation: prevent navigation-button shrinking, wrap the toolbar metadata, and increase footer link hit areas.
- Suggested command: `$impeccable adapt`.

### 6. P2: Enlarged text causes narrow-screen overflow

- Location: `apps/web/app/styles/features.css:3149–3156` (`.fmkt-cta__heading`).
- Category: Responsive design.
- Evidence: at 320px with root font size set to 200%, document overflow becomes true and the CTA heading extends to x=330.2px. At the normal font size, none of the eight viewport/theme combinations overflowed.
- Impact: enlarged text exceeds the narrow layout and risks clipping inside the CTA's overflow-hidden container.
- Standard: text-resizing/reflow robustness; this root-font stress test is not equivalent to a complete browser zoom conformance test.
- Recommendation: allow flex content to shrink and long words to wrap safely; verify real 200% text resizing and 400% browser zoom after the change.
- Suggested command: `$impeccable adapt`.

### 7. P2: Reduced-motion mode leaves smooth anchor scrolling enabled

- Location: `apps/web/app/layout.tsx:16`; reduced-motion overrides in `apps/web/app/styles/shell.css:122`.
- Category: Accessibility.
- Evidence: computed root `scroll-behavior` remains `smooth` with `prefers-reduced-motion: reduce`. The global `scroll-smooth` class is outside the descendant animation override.
- Impact: the skip link and See how it works anchor can still produce viewport motion for people requesting less motion.
- Standard: reduced-motion best practice; related to WCAG 2.3.3 (AAA), not an automatic AA failure.
- Recommendation: apply smooth scrolling only under no-preference, or set root scrolling to auto under reduced motion.
- Suggested command: `$impeccable animate`.

### 8. P2: Final CTA promises immediate consistency the page does not support

- Location: `apps/web/app/features/components/final-cta-section.tsx:16`.
- Category: Implementation integrity.
- Evidence: “The calendar and Xero never disagree” conflicts with the feature/process explanation that calendar apps refresh subscriptions on their own schedules.
- Impact: sets an incorrect expectation about when approved changes appear in external calendars.
- Standard: product-truth consistency.
- Recommendation: describe publication of approved changes accurately while retaining the calendar-client refresh qualification. Any replacement claim should preserve established product truth.
- Suggested command: `$impeccable clarify`.

## Detector interpretation and recurring patterns

The 12 advisories are not 12 additional defects. They include a 5px legend-swatch radius, 9px hint-icon radius, several literal text sizes, and a translucent black scroll-overlay colour. Tiny illustrative shapes and authored marketing typography need contextual assessment, not automatic replacement. Feature-only selectors in the broader shared-component scan are not homepage findings. The overlay is a deliberate scroll treatment, not evidence of hard-coded body text colour.

The actionable recurring patterns are incomplete keyboard/semantic handling in a bespoke demonstration, motion preferences split between SVG/CSS/root scrolling, and mixing fixed CTA whites with theme-varying greens. None warrants a redesign.

## Positive findings

- One H1, coherent heading hierarchy, named navigation, skip link and focusable main landmark.
- Mobile navigation opens; Escape closes it and restores focus to its trigger.
- No page-level horizontal overflow at 320, 390, 768 or 1440px in either theme at normal text size.
- Timeline entries are native buttons with descriptive names and selected state.
- Provenance combines colour with icons/text; decorative diagrams are hidden from assistive technology.
- Reduced-motion mode hides diagram particles; sampled CSS animations were absent in that mode.
- Most content is server-rendered and uses shared theme tokens.
- No JavaScript page errors were captured during the browser pass.

## Verification and limits

**PASS:** source review; bundled detector execution; eight viewport/theme captures; mobile Escape/focus behaviour; normal-size overflow checks; targeted timeline focus, CTA colour, coarse-pointer sizing and root-font stress checks.

**FAIL:** the concrete checks described in findings 1, 2, 4, 5, 6 and 7. Finding 3 is verified in source and the rendered moving diagram; finding 8 is a direct copy contradiction.

**NOT VERIFIED:** production Core Web Vitals, transfer/bundle budgets, CPU-throttled frame rates, a full automated accessibility scan, actual screen-reader traversal, full-page contrast coverage, Safari/Firefox and real browser zoom. Performance 3/4 is provisional, based on source inspection, not a measured speed result. No repository test gates ran because this was a read-only UI audit with documentation output.

The requested agent-browser executable was unavailable; installed Playwright supplied browser verification. An existing marketing dev server was used and left running. No server started for this audit remained running. Existing source edits were preserved.

Evidence: `/tmp/home-audit-browser.json`, `/tmp/home-audit-detector.txt`, `/tmp/home-audit-{light,dark}-{1440,768,390,320}.png`, `/tmp/home-audit-hero.png`. Full-page captures can show scroll-linked animation states; the dedicated hero capture confirms the desktop diagram renders.

## Recommended actions

1. `$impeccable harden`: CTA contrast, valid timeline semantics and focus restoration.
2. `$impeccable animate`: finite or pausable diagram motion and reduced-motion anchor scrolling.
3. `$impeccable adapt`: touch-target shrinking and enlarged-text overflow.
4. `$impeccable clarify`: replace the absolute calendar-consistency claim with accurate copy.
5. `$impeccable polish`: final consistency pass after functional fixes.

You can ask me to run these one at a time, all at once, or in any order you prefer. Re-run `$impeccable audit` after fixes to see your score improve.


## Remediation verification

All eight findings addressed in the working tree:

1. CTA uses semantic foreground/background pairs, including heading, copy,
   badge and both actions. Primary action contrast: 6.43:1 light, 7.54:1 dark.
2. Replaced invalid table ARIA with named timeline/person groups and complete
   entry labels including full dates and provenance. Visual grid preserved.
3. Diagram sequence runs once, finishing within 4.5 seconds, with static paths
   and labels retained afterwards.
4. Detail updates use an associated polite live region. Closing details returns
   focus to the originating entry. Regression interaction tests added.
5. Week buttons stay 44px square; toolbar wraps; footer links have 44px hit heights.
6. CTA and homepage text wrap safely. Final 320px/200% root-font stress check
   reports document width 320px and no horizontal page overflow.
7. Smooth anchor scrolling only applies when reduced motion is not requested.
8. CTA explains approved write-back/publication and independent calendar refresh.

**PASS:** final lint (`bun run check`), typecheck, unit tests, eight browser
viewport/theme combinations, targeted keyboard interactions, coarse-pointer
button sizing, finite animation and reduced-motion checks. No browser page errors.

**NOT VERIFIED:** integration tests. `bun run test:integration` exits unsuccessfully
because the configured database is non-local and the local-database safety guard
rejects it. No guard bypassed. Production performance, full screen-reader testing
and full browser-zoom conformance retain the original audit's verification limits.
The original score has not been replaced with a new conformance claim.

Final evidence: `/tmp/home-fixed-results.json`, `/tmp/home-fixed-*.png`.
No new dependencies. Existing unrelated edits and the pre-existing dev server
were preserved; the verification browsers were closed.
