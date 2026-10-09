# Calendar Feeds Page Design

Status: approved in discussion on 9 October 2026; awaiting written-spec review.
Inspected base: `402af6f`. Screens affected: S-13 `/feeds`, S-14 `/feeds/[feedId]`, S-21 `/settings/feeds`.

## 1. Job and audience

- **Every role** opens `/feeds` to get Team Calendar availability into Outlook, Google Calendar or Apple Calendar. Most visits are once or twice per person: subscribe, leave. Visitor mode: Operate.
- **Admins and owners** oversee and manage all feeds from `/settings/feeds`: what exists, what is actually being fetched, and what needs attention.
- **Feed owners** (anyone who created a personal or team feed) manage their own feed from its detail page.

## 2. Outcome and proof

- **Success (member):** from opening `/feeds`, a person subscribes the right feed in their calendar app with one click and no reading.
- **Success (admin):** from `/settings/feeds`, an admin can tell within seconds which feeds are in use and which have never been fetched or have gone stale.
- **Product truth:** feed URLs are shown in full and never masked; `last_used_at` records the last fetch of a token, not who is subscribed, so the product never claims a subscriber count; privacy transforms apply at publication.

## 3. Selected direction

- **Visual authority:** existing `DESIGN.md` and `.impeccable.md`; no new visual world.
- **Structural thesis:** `/feeds` stops being a management table and becomes a subscribe page. One recommended feed leads; everything else is secondary. Management moves to the places that already own it: lifecycle actions on the detail page, oversight and creation of arbitrary feeds in settings.
- **Focal moment:** the "Your calendar" block, with three provider buttons that subscribe in one action.

## 4. Scope and boundaries

In scope: `/feeds` restructure; provider deep links; personal and manager team feed self-service; owner rights on the detail page; `/settings/feeds` oversight list; `packages/feeds` permission changes.

Unchanged:

- ICS rendering, UID strategy, SEQUENCE, caching, token signing and the `GET /ical/:token.ics` endpoint.
- Admin creation of org, team and person feeds at `/feeds/new` (admin only).
- Organisation feed defaults (privacy mode, public holidays) on `/settings/feeds`.
- Confirmation dialogs for rotate and archive.

Anti-goals:

- No subscriber counts or implied subscriber identities.
- No masking, truncating or hint-replacing of feed URLs anywhere.
- No row action menus on any list.
- No metric card grids on `/settings/feeds`.
- No automatic creation of personal feeds.

## 5. `/feeds`: subscribe page

Access: every signed-in role (`requirePageRole("org:viewer")`, unchanged).

### Layout, top to bottom

1. **Header band.** Title "Calendar feeds". One line: "Add Team Calendar to the calendar app you already use. Feeds update automatically." Admins and owners see a text link "Manage all feeds" to `/settings/feeds`. No "New feed" button.
2. **Your calendar.** The recommended feed (rules below) in one block:
   - Feed name, a one-line plain description of what it shows (scope summary plus privacy, for example "Your leave and availability, with names").
   - Three primary-weight buttons: "Add to Apple Calendar", "Add to Google Calendar", "Add to Outlook".
   - The full subscribe URL in a read-only field with "Copy URL".
   - A disclosure "Other calendar apps" with the existing manual instructions (Apple, Google, Outlook, other).
3. **Create actions** (only when applicable, compact row under the block):
   - "Create my calendar feed" when the acting user has a linked person and no personal feed.
   - "Create my team feed" when the acting user has direct reports and no team feed.
4. **Other feeds you can use.** Every other visible, non-archived feed as compact rows: name, scope summary, privacy label, status (paused feeds show "Paused, not updating"), an "Add" button opening the same provider choices in a popover, and the row name linking to `/feeds/[feedId]`. No URL on rows.

### Recommended feed rules

First match wins among visible feeds with status `active`:

1. The acting user's personal feed (scope `self`, `created_by_user_id` = acting user).
2. The acting user's team feed (scope `manager_team`, created by them).
3. An organisation-wide feed (scope `org`); if several, the oldest.
4. The first remaining visible feed by name.

If none qualify, the block shows the empty state (section 9).

### Provider deep links

| Button | Target |
|---|---|
| Add to Apple Calendar | `webcal://` form of the subscribe URL |
| Add to Google Calendar | `https://calendar.google.com/calendar/r?cid=<webcal URL, encoded>` |
| Add to Outlook | Outlook on the web subscribe link: `https://outlook.office.com/calendar/addfromweb?url=<https URL, encoded>&name=<feed name, encoded>`; a secondary "Outlook desktop" item uses `webcal://` |

- Buttons open in a new tab (web providers) or hand off to the OS (webcal). After each click, a polite status message reads "If nothing opened, copy the URL and follow the steps under Other calendar apps."
- Deep links carry only the subscribe URL the user is already authorised to see. The executor verifies each URL format against current provider behaviour (Context7 or provider docs) before shipping; if a provider format no longer works, that button falls back to copy and open.

## 6. Personal and team feeds

- **Personal feed:** scope `self`, one per person. Name defaults to "<First name>'s calendar". Privacy and public holidays come from organisation defaults.
- **Team feed:** scope `manager_team`, one per manager, available only when the acting person has at least one active direct report (`manager_person_id`). Name defaults to "<First name>'s team".
- Creation is idempotent: if the feed already exists (including paused), the action returns it rather than creating another. An archived personal or team feed does not block creating a new one.
- A user without a linked person cannot create either; `/feeds` explains "Your account is not linked to a person yet. Ask an administrator to link it."
- On creation, the new feed becomes the recommended feed and the page focuses its block.

## 7. `/feeds/[feedId]`: detail

- Remains the only place for pause, resume, rotate and archive, behind the existing confirmations.
- **Owner rights:** for an owned feed (scope `self` or `manager_team` and `created_by_user_id` = acting user), the owner may rename, change privacy mode, toggle public holidays, pause, resume, rotate and archive. Admins and owners of the organisation retain full control over every feed.
- Org-wide, team and person feeds created by an admin are not "owned" by that admin for the purpose of these rules; admin rights already cover them.
- The detail page gains the same three provider buttons beside the subscribe URL.
- Restore of archived feeds stays admin only (archived feeds are not visible to non-admins).

## 8. `/settings/feeds`: admin oversight

Access: admin and owner (unchanged). Order:

1. Existing defaults: privacy mode, public holidays.
2. **All feeds** section:
   - Header line: total feeds and "<n> personal feeds" as plain text, plus "New feed" linking to `/feeds/new`.
   - Filters: search (name), status (active, paused, archived; default active and paused), type (organisation, team, person, personal, manager team). Filters round-trip through URL params using the existing filter parsing.
   - Rows: name, type, created by (person name, or "Administrator" when no person is linked), status, last fetched. Row opens `/feeds/[feedId]`.
   - **Last fetched** is the latest `last_used_at` across the feed's active tokens, shown as relative time with the exact date on hover and to screen readers. Flags, each pairing icon and text:
     - "Never fetched": no token has a `last_used_at`.
     - "Not fetched in 30 days": latest fetch older than 30 days.
     - Paused and archived feeds show status only, without stale flags.
   - Personal-feed filter is the type filter set to "personal".
   - Pagination at 50 rows using the existing cursor pattern.

## 9. States and ranges

- **Visible feeds per member:** typically one to five; admins on `/feeds` see the same member view.
- **Org feed count:** one to about 100 for the target market; settings list paginates beyond 50.
- **No active feed visible:** "Your calendar" shows "No calendar feed is available yet." plus "Create my calendar feed" when allowed, otherwise "Ask an administrator to set one up."
- **Recommended feed paused:** skipped by the rules; if it is the person's own feed, a line under create actions reads "Your calendar feed is paused" with a link to its detail page.
- **Load failure:** existing `FetchErrorState` for the list; the "Your calendar" block shows the existing subscription-unavailable message with "Try again".
- **Clipboard unavailable:** "Copy URL" falls back to selecting the field text with "Press Ctrl+C or Cmd+C to copy."
- **Permission failures** on owner actions return the existing not-authorised result with plain copy; out-of-scope detail pages keep the generic 404.

## 10. Interaction and layout

- One primary area per page; on `/feeds` the provider buttons are the only primary-weight buttons.
- Provider buttons stack full width on mobile; the URL field wraps rather than truncating.
- Compact rows are single-line on desktop, two-line on mobile; whole-row hit targets of at least 44px.
- Status and staleness never rely on colour alone.
- Motion limited to existing state transitions; respects `prefers-reduced-motion`.

## 11. Service and permission changes (`packages/feeds`)

- `isFeedOwner(feed, actingUserId)`: true when every scope is `self` or `manager_team` and `created_by_user_id` equals the acting user.
- `createFeed`: allow non-admins only for a single `self` scope, or a single `manager_team` scope when the acting person has direct reports; enforce one active or paused feed of that kind per creator.
- `updateFeed`, `pauseFeed`, `resumeFeed`, `archiveFeed`, token rotation: allow admin/owner or `isFeedOwner`.
- `restoreFeed`: unchanged (admin only).
- `listFeeds`: return `scopeTypes: FeedScopeType[]`, `createdByUserId`, `createdByName`, `lastFetchedAt` (max `last_used_at` across active tokens) and accept a `type` filter.
- All queries keep `clerk_org_id` and `organisation_id` filters. Each permission decision is audited as today.

## 12. Constraints

- Australian English; no em or en dashes; no hype.
- WCAG 2.2 AA; 3px focus ring; keyboard-complete.
- Radii per `DESIGN.md`; tonal layering, no borders for separation; frost only on the provider popover.
- Analytics through `@repo/analytics`: `Feed Subscribe Clicked` (provider), `Feed URL Copied`, `Personal Feed Created` (personal or team).

## 13. Related work

The onboarding plan's member welcome step 3 (`docs/superpowers/plans/2026-10-09-onboarding.md`, Task 8) reuses the personal feed creation in section 6 instead of a separate action. Implement this feeds work first, or implement the shared service change from this plan's Task 1 before onboarding Task 8.

## 14. Decisions a builder must not reinvent

- `/feeds` has no filters, row menus or "New feed" button.
- Lifecycle actions live only on the detail page.
- Personal feeds are created on request, never automatically.
- Owners have full control of their own personal or team feed; restore stays admin only.
- No subscriber counts.
