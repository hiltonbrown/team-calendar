# Plan 001: Make calendar, contact, notification, and motion interactions accessible and responsive

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update this plan's status row in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat eb2cff0..HEAD -- apps/app/components/calendar apps/app/components/people/alternative-contacts-panel.tsx apps/app/components/notifications/bell.tsx apps/app/app/(authenticated)/notifications/notifications-client.tsx apps/app/app/(authenticated)/leave-approvals/leave-approvals-client.tsx apps/app/app/(authenticated)/settings/members/members-client.tsx`
>
> Also run `git status --short` before editing. The calendar route and related
> calendar components were already modified in the advisor's working tree
> when this plan was written. Do not combine this plan with unreviewed local
> work. The acceptable result is a clean in-scope worktree, or explicit
> operator attribution for every changed in-scope path. Use a clean branch or
> dedicated worktree when that attribution is unavailable.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug, tests, tech-debt
- **Planned at**: commit `eb2cff0`, 2026-07-21

## Why this matters

The calendar currently represents an entire day as a keyboard-operable
`role="button"` while that day may contain event buttons and a navigation
link. This creates nested interactive controls, which is unreliable for
assistive technology. Alternative-contact drag rows similarly announce
themselves as buttons but provide no button action or keyboard reordering.

On phones, the month calendar compresses seven interactive days into the
viewport with `overflow-hidden`, while several frequent icon controls are
smaller than the product's 44px touch-target standard. The notification menu
uses ARIA menu roles without the matching keyboard model. Fixing these issues
will make the high-frequency manager workflow reliable on keyboard, screen
reader, and touch input without changing leave or Xero domain behaviour.

## Current state

### Product and design constraints

- `PRODUCT.md` defines WCAG 2.2 AA as the floor, requires visible 3px focus
  rings, and requires status/provenance to use an icon or label as well as
  colour.
- `DESIGN.md:314` requires default, hover, focus-visible, active, disabled,
  loading, and error states for interactive components.
- `DESIGN.md:352` makes the sidebar collapse below 1024px. `DESIGN.md:370`
  permits only purposeful 150–250ms state motion and requires a
  `prefers-reduced-motion` alternative.
- The app uses strict TypeScript, named exports, Tailwind v4 utility classes,
  Vitest tests co-located with components, and shared primitives from
  `@repo/design-system/components/ui/*`. Reuse those primitives instead of
  creating new base controls.

### Relevant implementation facts

- `apps/app/components/calendar/calendar-create-launcher.tsx` wraps calendar
  day content in a focusable `div` with `role="button"`; both Enter and Space
  navigate to the create-record route:

  ```tsx
  // calendar-create-launcher.tsx:33-48
  <div
    className={cn("text-left", className)}
    onClick={navigate}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigate();
      }
    }}
    role="button"
    tabIndex={0}
  >
    {children}
  </div>
  ```

- `calendar-week-view.tsx:68-93` and `calendar-month-view.tsx:57-110` put
  `CalendarEventChip` buttons inside that launcher. Month view also adds the
  `+N more` link inside it. Event chips already stop click propagation, but
  this does not make nested interactive semantics valid.

- `calendar-month-view.tsx:40-51` renders a seven-column month grid inside
  `overflow-hidden`; unlike `calendar-week-view.tsx:25-26`, it has neither a
  horizontal overflow strategy nor an alternative compact layout.

  ```tsx
  <div className="overflow-hidden rounded-2xl bg-muted p-1">
    <div className="grid grid-cols-7 gap-1">...</div>
    <div className="grid grid-cols-7 gap-1">...</div>
  </div>
  ```

- `apps/app/components/people/alternative-contacts-panel.tsx:280-294` makes
  each draggable contact a focusable button, but its keydown handler only
  clears drag state on Escape. It contains separate Edit and Delete buttons.

  ```tsx
  <div
    draggable={canManage}
    onDragStart={() => setDraggedId(contact.id)}
    onDrop={() => persistDrop(contact.id)}
    onKeyDown={(event) => {
      if (event.key === "Escape") setDraggedId(null);
    }}
    role={canManage ? "button" : "listitem"}
    tabIndex={canManage ? 0 : undefined}
  >
  ```

- `apps/app/components/notifications/bell.tsx:175-199` declares a plain
  `div` as `role="menu"` and native buttons as `role="menuitem"`. It does not
  implement the expected menu arrow-key and roving-focus behaviour. These
  notifications are navigational content with an asynchronous read state, not
  a command menu, so the plan below deliberately replaces the ARIA menu with
  a semantic list of native buttons.

- Small frequent controls include the 36px notification trigger
  (`bell.tsx:150-161`), 36px calendar scan link
  (`calendar-scan-panel.tsx:49-55`), and 28px member role/removal controls
  (`members-client.tsx:287-323`). WCAG 2.5.8 AA's minimum is 24px, but this
  product's mobile standard for primary touch controls is 44px.

- `notifications-client.tsx:157` always calls
  `scrollIntoView({ behavior: "smooth" })`. `leave-approvals-client.tsx:210`
  applies `transition-all duration-500 ease-in-out`. Both are outside the
  documented motion rule. `notifications-client.tsx:341-346` marks unread
  items with `border-l-2`, a prohibited side-stripe treatment; retain the
  `Unread` badge and tonal surface instead.

### Existing test patterns

- `calendar-create-launcher.test.tsx` mocks `next/navigation` and asserts the
  generated route. Extend it when changing calendar creation behaviour.
- `calendar-month-view.test.tsx` and `calendar-week-view.test.tsx` build typed
  calendar fixtures locally and render with Testing Library.
- `bell.test.tsx` mocks the notification provider and server actions, then
  opens the popover with `fireEvent.click`.
- `alternative-contacts-panel.tsx` has no dedicated test file. Create
  `alternative-contacts-panel.test.tsx` alongside it. Mock only the server
  action/router dependencies that the component imports, following the nearby
  component-test pattern above.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bunx vitest run apps/app/components/calendar/calendar-create-launcher.test.tsx apps/app/components/calendar/calendar-month-view.test.tsx apps/app/components/calendar/calendar-week-view.test.tsx apps/app/components/people/alternative-contacts-panel.test.tsx apps/app/components/notifications/bell.test.tsx` | Exit 0; all listed tests pass. |
| App tests | `bun --cwd apps/app test` | Exit 0; all app test files pass. |
| App typecheck | `bun --cwd apps/app typecheck` | Exit 0; no TypeScript errors. |
| Repository checks | `bun run check` | Exit 0; no new Ultracite diagnostics. |
| Baseline technical audit | `$impeccable audit apps/app` | A report with scores for accessibility, performance, responsive design, theming, and anti-patterns, plus prioritised findings. |
| Pre-ship refinement | `$impeccable polish apps/app` | A documented design-system-aligned final pass across the changed flows, including responsive and interaction-state evidence. |

## Suggested executor toolkit

- Before code changes, invoke **`$impeccable audit apps/app`**. Capture the
  health score, severity counts, and only the findings relevant to this plan.
  Treat that report as fresh evidence, not as permission to expand scope.
- After all functional tests pass, invoke **`$impeccable polish apps/app`** for
  the focused pre-ship refinement pass. It must inspect the real interaction
  paths, align all changed controls to `DESIGN.md`, and check default, hover,
  focus-visible, active, disabled, loading, error, and success states where
  applicable.
- If browser automation is available, use it during both Impeccable passes at
  320px, 768px, and 1440px. Check keyboard traversal, visible focus, rendered
  control bounds, and overflow at each width, then record screenshots or
  concrete observations. A real browser or device pass is mandatory for this
  plan's Done criteria. If no browser is available, stop and report the
  missing verification capability rather than claiming visual completion.

## Scope

**In scope**:

- `apps/app/components/calendar/calendar-create-launcher.tsx`
- `apps/app/components/calendar/calendar-month-view.tsx`
- `apps/app/components/calendar/calendar-week-view.tsx`
- `apps/app/components/calendar/calendar-create-launcher.test.tsx`
- `apps/app/components/calendar/calendar-month-view.test.tsx`
- `apps/app/components/calendar/calendar-week-view.test.tsx`
- `apps/app/components/people/alternative-contacts-panel.tsx`
- `apps/app/components/people/alternative-contacts-panel.test.tsx` (new)
- `apps/app/components/notifications/bell.tsx`
- `apps/app/components/notifications/bell.test.tsx`
- `apps/app/app/(authenticated)/notifications/notifications-client.tsx`
- `apps/app/app/(authenticated)/leave-approvals/leave-approvals-client.tsx`
- `apps/app/app/(authenticated)/settings/members/members-client.tsx`
- `apps/app/components/calendar/calendar-scan-panel.tsx`

**Out of scope**:

- `packages/design-system/**`: shared overlay motion and generic primitive
  touch sizing need a separately reviewed cross-app plan.
- Leave, approval, notification, people, and Xero server actions: this plan
  changes only client interaction semantics and presentation.
- Calendar data loading, filter schemas, URL contracts, and route names.
- Any broad visual overhaul, new animation system, or changes to auth screens.

## Git workflow

- Branch: `advisor/001-accessible-responsive-interactions`.
- Make small logical commits using conventional commits, for example
  `fix(app): make calendar creation controls accessible`.
- Do not push or open a pull request unless instructed by the operator.

## Steps

### Step 0: Establish the current quality baseline with Impeccable audit

Before editing, invoke **`$impeccable audit apps/app`**. Its scope is the
authenticated product app and must explicitly assess accessibility, responsive
behaviour, and component states, as well as the command's other dimensions.

Record the audit health-score table and P0–P3 counts in the execution notes.
Reconcile the report against this plan's existing findings: nested calendar
controls, alternative-contact reorder semantics, narrow month calendar,
notification menu semantics, touch targets, reduced motion, and unread state.
Do not create a second plan for duplicates. A newly discovered P0 or a P1 that
cannot be addressed within this plan's file scope is a STOP condition.

**Verify**: the audit report includes all five scored dimensions and concrete
evidence for keyboard, focus, labels, touch-target sizing, narrow-width
behaviour, and component states. It is not sufficient to report only a clean
static scan. Record a baseline for the focused tests, app tests, typecheck,
and repository check before changing code.

### Step 1: Replace the calendar's interactive wrapper with non-nested controls

Refactor `CalendarCreateLauncher` so it no longer advertises a parent button
around arbitrary children. Preserve its route construction, organisation query
parameter, and date/person prefill behaviour.

Choose one accessible structure and apply it consistently in month and week
views: render one dedicated, labelled native create button in every day cell,
as a sibling of event chips and the overflow link. Do not make the rest of the
day cell clickable. The control must remain present for both empty and
populated days, so creation is discoverable and behaves consistently.

The selected control must have an accessible name that includes the date and
the action, for example `Add availability for 15 April 2026`. It must support
keyboard activation through native button semantics and retain a visible 3px
focus treatment. Do not use a `div` with `role="button"` as a substitute.

Update the create-launcher test to assert the accessible name, click route,
and keyboard activation. Add calendar month and week tests that render an
event and confirm there is no focusable interactive descendant of the create
control. Assert this directly against the control's DOM subtree using
`querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')`, not
only Testing Library role queries. If the component becomes too small to
justify its own abstraction, remove it and move the small, shared route helper
into the two views rather than retaining a misleading wrapper.

**Verify**: run the focused calendar test command. It exits 0, and the new
tests prove that a calendar event and creation control are independent,
keyboard-operable controls.

### Step 2: Make the month calendar usable at narrow widths

Update `calendar-month-view.tsx` after Step 1 so that seven day columns do not
compress below a usable size. Match the established week-view pattern unless a
more appropriate responsive layout is demonstrably simpler:

- wrap the month grid in an `overflow-x-auto` scroll region;
- give the grid a minimum width that keeps a day cell and its explicit create
  action usable; and
- provide a programmatic label for the scrollable calendar region and make it
  keyboard-focusable only when native browser behaviour requires it.

Do not apply `overflow-hidden` to content that needs to scroll. Preserve the
existing event truncation and `+N more` route. Ensure the explicit creation
control from Step 1 remains reachable without activating an event or the
overflow link.

Extend `calendar-month-view.test.tsx` to assert the scroll container's label,
the grid's minimum-width class, and the independent overflow link. Keep the
week-view test aligned if shared naming or markup changes.

**Verify**: rerun the focused calendar tests. They exit 0 and existing holiday,
today, truncation, and overflow assertions still pass.

### Step 3: Make alternative-contact reordering truthful and keyboard-operable

Refactor `alternative-contacts-panel.tsx` so a contact row is a list item or
plain container, not a false button. Preserve mouse drag-and-drop for users
who use it, but add explicit Move up and Move down buttons for users with a
keyboard or touch input. Disable or omit Move up for the first contact and
Move down for the last contact. Each action must have an accessible name that
includes the contact name and must call the existing
`reorderAlternativeContactsAction({ orderedContactIds, organisationId, personId })`
path, not duplicate business logic.

Extract the smallest local helper required to calculate an adjacent move from
the current `contacts` order and submit the complete resulting
`orderedContactIds` array. Do not optimistically change the rendered order,
because this component receives canonical ordering through its `contacts`
prop. Disable every reorder and drag affordance while the mutation is pending,
clear stale drag state before the request, and leave the previous order visible
on failure. Keep the current error display and add one polite live region:
after persistence succeeds, announce `{name} moved to position {n}`; after a
failure, announce that the order was not changed. Do not add custom ARIA drag
roles unless the implementation also provides the complete keyboard drag
model.

Create `alternative-contacts-panel.test.tsx` covering:

- rows are not announced as buttons;
- first/last move controls are unavailable in the invalid direction;
- activating Move down invokes the existing mutation path with the expected
  full `orderedContactIds` array;
- every reorder control is disabled while pending and a second request cannot
  start;
- success announces the moved contact's new one-based position; and
- failure announces that ordering was retained and leaves the original rows in
  their prior order.

**Verify**: run the focused test command. The new contact tests pass without
changing the server-action contract.

### Step 4: Use correct notification semantics and improve touch affordances

In `bell.tsx`, remove the manual `role="menu"` and `role="menuitem"`
semantics. Render unread notifications as a semantic `ul` with `li` children
containing native buttons, so ordinary Tab and Shift+Tab navigation is correct
for this navigational feed. Preserve the popover's existing async mark-as-read
logic, empty state, and View all link. Do not introduce arrow-key menu
behaviour, because this is explicitly not a command menu. Update `bell.test.tsx`
to prove that the trigger opens the list, each notification has its native
button role, keyboard activation marks it read/navigates as appropriate, and
Mark all is disabled during a pending request.

Raise the notification trigger, calendar scan link, and member-management
action hit areas to at least 44 by 44 CSS pixels. The visual glyph may remain
small and compact inside the larger hit area. Do not enlarge non-interactive
avatars or decorative status icons. Keep member-table density with explicit,
non-overlapping 44px interactive controls, not invisible hit areas that cover
adjacent controls or rows.

**Verify**: run the focused bell test, then `bun --cwd apps/app typecheck`.
Both exit 0.

### Step 5: Remove motion and unread-state regressions

Replace `transition-all duration-500 ease-in-out` in
`leave-approvals-client.tsx` with the smallest explicit state transition, or
remove it when it does not communicate a state change. Any retained transition
must be 150–250ms and use `motion-safe:` utilities, with a stable default
state.

For the focused-notification scroll in `notifications-client.tsx`, select
instant scrolling when `prefers-reduced-motion: reduce` matches. Use a small
client-side media-query hook or local effect that updates correctly if the
preference changes and removes its listener on unmount. Do not call
`window.matchMedia` during server rendering. Test initial reduced and
non-reduced preferences, a preference change, and listener cleanup.

Remove `border-l-2` from unread notification articles. Retain the `Unread`
badge and primary tonal background so unread state remains differentiated by
text and colour. Do not introduce a replacement side stripe.

Add or extend tests only where deterministic under jsdom, including a reduced
motion test if the hook is locally testable. Visual styling can be verified by
the repository check and optional browser pass.

**Verify**: `bun --cwd apps/app test` exits 0, followed by `bun run check`
with no new diagnostics.

### Step 6: Run the focused pre-ship refinement pass with Impeccable polish

Only after Steps 1–5 have passed their focused tests, invoke
**`$impeccable polish apps/app`**. Treat it as a focused refinement pass for
the changed calendar, people, notification, leave-approval, and member-action
surfaces, not a licence to redesign unrelated pages.

Follow the polish workflow in full:

1. Confirm the changed controls use the documented shared primitives and
   Team Calendar tokens. Classify any detected drift as a missing token,
   one-off implementation, or conceptual misalignment before changing it.
2. Exercise the create-record, event-detail, overflow, contact-reorder,
   notification, approval, and member-action paths. Check default, hover,
   focus-visible, active, disabled, loading, error, and success states that
   each path actually supports. Complete and record a keyboard walkthrough:
   Tab and Shift+Tab through each changed path, Enter and Space on native
   buttons, Escape on the popover and any active drag state, and accessible
   names/states in the browser accessibility tree.
3. At 320px, 768px, and 1440px, verify no horizontal page overflow, 44px
   touch targets for the named frequent actions, readable text, logical
   reflow, visible focus, and reduced-motion behaviour. Preserve intentional
   horizontal scrolling inside the labelled month calendar region. Use browser
   DevTools or equivalent computed-layout inspection to record non-overlapping
   44 by 44 bounding boxes for the notification trigger, calendar scan action,
   member-role trigger, and member-removal action.
4. Correct only defects in this plan's scope. For a discovered P0/P1 outside
   scope, record the evidence and stop for operator direction. Do not claim a
   clean detector or passing test suite proves polish; the hand-off must carry
   the rendered interaction evidence or the explicit lack of browser access.

Rerun the affected focused tests, app tests, typecheck, and repository check
after any polish change.

**Verify**: `$impeccable polish apps/app` reports that the changed flows are
aligned to the design system, all applicable component states have been
examined, and no newly introduced P0/P1 remains within scope. The required
automated commands also exit 0.

## Test plan

- Calendar: creation action is natively operable and named by date; event chips
  and the `+N more` link are not descendants of a button-like day control;
  the narrow-screen scroll region is labelled and retains its overflow link.
- Alternative contacts: adjacent reordering works through explicit controls,
  invalid moves are unavailable, pending/error/success states are exposed, and
  mutation payloads contain the complete deterministic order.
- Notifications: trigger and unread items remain reachable; the selected menu
  pattern supplies valid keyboard semantics; async disabled state is preserved.
- Responsive controls: assert the 44px utility classes on the three named
  interactive controls, without asserting decorative icon sizes; browser
  evidence confirms their computed boxes do not overlap.
- Motion: test initial reduced/non-reduced behaviour, preference change, and
  media-query listener cleanup for focused notification scrolling.
- Regression: full app tests, app typecheck, and root Ultracite checks pass.

## Done criteria

- [ ] Calendar day containers contain no nested interactive controls.
- [ ] Every calendar creation action is a named native button and preserves
  the existing route parameters.
- [ ] The month calendar offers labelled horizontal scrolling or an equivalent
  tested compact layout at narrow widths.
- [ ] Alternative contact rows are not announced as buttons; adjacent reorder
  controls work by keyboard and communicate their result.
- [ ] Notification items use a complete menu implementation or ordinary list
  semantics, never partial ARIA menu roles. This plan uses ordinary list
  semantics with native buttons.
- [ ] The notification trigger, calendar scan action, and member actions have
  44px minimum touch targets.
- [ ] Focused motion respects reduced-motion preference; no unread side stripe
  remains in `apps/app`.
- [ ] `$impeccable audit apps/app` has been run before implementation, with
  findings reconciled against this plan and no unaddressed in-scope P0/P1.
- [ ] `$impeccable polish apps/app` has been run after implementation, with
  mandatory browser evidence for responsive behaviour, computed target bounds,
  and all applicable interaction states.
- [ ] The focused test command, `bun --cwd apps/app test`,
  `bun --cwd apps/app typecheck`, and `bun run check` all exit 0.
- [ ] No files outside the listed scope are modified, except
  `advisor-plans/README.md` for the status update.

## STOP conditions

- Any in-scope file has uncommitted changes when execution begins, unless the
  operator explicitly confirms they belong to this plan or supplies a clean
  worktree.
- The current calendar creation flow has already been replaced by the
  in-progress calendar changes, so the excerpts in this plan no longer match.
- Supporting explicit keyboard reordering requires a server-action API change
  or changes to the database schema.
- The chosen shared menu primitive cannot preserve the notification list's
  async mark-as-read behaviour without changes outside scope. (This plan
  deliberately uses an ordinary semantic list instead; do not substitute a
  menu without revising the plan.)
- The Impeccable audit reports a new P0, or an in-scope P1 not covered by the
  plan's steps, that would make further work unsafe without reprioritisation.
- The Impeccable polish pass finds a P0/P1 outside the listed scope. Record
  the evidence and request a separate plan or explicit scope expansion.
- Browser or real-device verification at 320px, 768px, and 1440px cannot be
  performed. Do not mark this plan complete without rendered evidence.
- A focused test, app test, typecheck, or repository check introduces a new
  failure compared with the pre-edit baseline and still fails after two
  reasonable scoped correction attempts. Record the baseline and failure
  output before stopping.

## Maintenance notes

- Future calendar interaction work must retain independent controls for create,
  event detail, and overflow navigation. Do not reintroduce a clickable day
  wrapper around them.
- If calendar views gain drag-to-create, design a complete keyboard alternative
  before introducing ARIA drag semantics.
- If notification actions expand beyond mark-as-read and navigation, retain
  the shared menu primitive rather than rebuilding focus management.
- A follow-up design-system plan should address reduced-motion behaviour in
  shared overlays and the default touch-target scale across all applications.
