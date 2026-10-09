---
name: Team Calendar
description: Multi-tenant leave management and availability publishing for teams on Xero Payroll
colors:
  primary: "#46734A"
  on-primary: "#FFFFFF"
  primary-container: "#6DA671"
  on-primary-container: "#1B3620"
  supportive-green: "#4B6542"
  secondary-container: "#CAE8BC"
  on-secondary-container: "#2A3D24"
  tertiary: "#57624F"
  editorial-accent: "#5E4F99"
  on-editorial-accent: "#FFFFFF"
  accent-container: "#E5DFFF"
  on-accent-container: "#1F1551"
  warning: "#7A5900"
  warning-container: "#FFDF91"
  on-warning-container: "#271900"
  surface: "#FBFCFB"
  surface-container-lowest: "#FFFFFF"
  surface-container-low: "#F7F9F8"
  surface-container: "#F3F5F4"
  surface-container-high: "#EDEFEE"
  surface-container-highest: "#E7EAE8"
  surface-variant: "#E1E2E1"
  on-surface: "#1F2120"
  on-surface-variant: "#494A49"
  inverse-surface: "#353635"
  inverse-on-surface: "#F3F4F3"
  outline: "#7A7C7B"
  outline-variant: "#C2C4C3"
  error: "#A83224"
  error-container: "#FBE1DA"
  on-error-container: "#410E06"
  success: "#46734A"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
  title:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  label:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
rounded:
  sm: "12px"
  md: "14px"
  lg: "16px"
  xl: "20px"
spacing:
  compact: "16px"
  card-gap: "24px"
  list-gap: "32px"
  section-gap: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, {colors.primary} 90%, {colors.on-surface})"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface-container-lowest}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: "24px"
    shadow: "var(--elev-card)"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  chip-provenance-xero:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    rounded: "{rounded.sm}"
    padding: "2px 10px"
  chip-provenance-manual:
    backgroundColor: "{colors.accent-container}"
    textColor: "{colors.on-accent-container}"
    rounded: "{rounded.sm}"
    padding: "2px 10px"
  status-warning:
    backgroundColor: "{colors.warning-container}"
    textColor: "{colors.on-warning-container}"
    rounded: "{rounded.sm}"
    padding: "2px 10px"
---

# Design System: Team Calendar

## Overview

Team Calendar shows a small business who is in, who is out, and what needs attention, without checking Xero, email, or messages. Hierarchy comes from type and spacing first, then colour. Persistent surfaces separate by tone, motion is limited to state changes, and every failure offers a way to recover.

The rules below apply to three kinds of surface:

- **App:** the authenticated product. Scanning, standard interaction patterns, predictable state, and finishing the task come before visual expression.
- **Marketing:** the public site. It may use fluid display type, wider composition, and entrance or scroll motion to explain the product.
- **Reading:** help, legal, blog, and documentation pages. Reading order, line length, and task-focused navigation come first.

Sign-in follows the app rules, with one exception: the brand panel beside the form may show the provenance colours before the user enters the product. It must never slow or hide sign-in.

**Summary:**

- Sage and lavender show where a record came from; status uses its own labels.
- Persistent content separates by surface tone; frost marks floating surfaces only.
- Plus Jakarta Sans is the interface font; Lora is limited to short editorial text.
- Density depends on role: compact for managers and admins, more spacious for employees.
- Actions with external effects preview the impact, report progress, keep the user's input, and allow recovery.
- Australian English, WCAG 2.2 AA, reduced motion, reduced transparency, forced colours, and 200% reflow are minimum requirements.

**Scan time.** A manager should be able to find the current date, who is unavailable, what each record means, and any failed or pending state within six seconds. Secondary details belong in a detail view.

**Confirm every external write.** Any action that writes to Xero, changes a feed, or affects another person ends with an explicit result: what changed, where it was sent, and what the user can do next.

## Colors

The palette is sage on near-grey neutrals with a faint green tint. Green marks primary actions and Xero provenance, lavender marks manual records and information, muted ochre marks attention, and red is reserved for destructive or failed states.

### Semantic roles

| Meaning | Token | Required companion |
|---|---|---|
| Primary action and brand | `primary` | Verb-led label |
| Successful outcome or healthy metric | `success` (aliases `primary`) / `primary-container` | Success copy or icon |
| Xero-synced provenance | `secondary-container` | Sync icon (`RefreshCwIcon`) and “Xero” or equivalent label |
| Manual provenance | `accent-container` | Pencil icon and “Manual” or equivalent label |
| Attention, expiry, or partial success | `warning-container` | Warning icon and actionable label |
| Failure or destructive action | `error` / `error-container` | Error icon, problem statement, recovery |
| Editorial emphasis | `editorial-accent` | Small marketing or reading accents only |
| Neutral hover | `surface-container-high` | No semantic meaning |

`editorial-accent` is the product purple. The shadcn-compatible CSS variable `--accent` is not purple; it aliases `surface-container-high` for neutral hover and selected surfaces. Never use the framework name as a product meaning.

### Surface hierarchy

`surface` is the page canvas. `surface-container-low` creates navigation and contextual bands. `surface-container` groups related work. `surface-container-lowest` is the card and opaque floating base. `surface-container-high` is the neutral hover surface. `surface-container-highest` is the opaque fallback for frost and the strongest neutral field fill.

Cards use `surface-container-lowest`. The default card carries the `elev-card` hairline so it stays visible on the near-white page. Use `variant="plain"` only for a card on a parent at least two surface steps darker (`surface-container-high` or below), where the tonal step alone separates it. Never combine the hairline with a border; the only card border is the forced-colours fallback.

### Dark mode

Dark mode keeps each token's meaning rather than inverting light values. The implemented dark values live in `packages/design-system/styles/globals.css` and the design sidecar.

| Token | Dark value | Token | Dark value |
|---|---|---|---|
| `primary` | `#8FD496` | `surface` | `#151515` |
| `primary-container` | `#1F5226` | `surface-container-lowest` | `#101010` |
| `secondary-container` | `#374E2E` | `surface-container-low` | `#1E1F1E` |
| `editorial-accent` | `#C8BFFF` | `surface-container` | `#222322` |
| `accent-container` | `#46398B` | `surface-container-high` | `#2C2E2D` |
| `warning` | `#E8C247` | `warning-container` | `#5C4300` |
| `error` | `#FFB5A6` | `surface-container-highest` | `#373938` |
| `error-container` | `#8C1D0F` | `on-error-container` | `#FFDCD3` |
| `supportive-green` | `#B8C9AB` | `outline` | `#949594` |
| `on-surface` | `#E6E7E6` | `on-surface-variant` | `#CACBCA` |

The theme follows the system preference by default. A manual selection is stored per device by the theme provider. It is not saved to the database.

### Charts

Charts use the sage ramp `chart-1` to `chart-4` (light `#1F3D23`, `#46734A`, `#7FA882`, `#B4D3B3`; dark `#D2ECD3`, `#8FD496`, `#5A9A60`, `#2F5A34`) with `chart-5` aliasing `tertiary`. Colour never identifies a series alone. Every multi-series chart pairs colour with at least one of: a distinct stroke dash, marker shape, direct label, icon, or adjacent data table. The lightest sage is a fill or area colour, not a thin line on a light canvas. Purple is reserved for manual provenance and is not a general chart series colour.

### Colour rules

- **Sage leads.** Sage is the main colour and editorial purple a secondary one; they never carry equal weight in one composition.
- **Provenance needs a label.** Xero and manual source colours always pair with a source icon or visible label. Approval, sync, and publication status use separate words, icons, and semantic containers.
- **No cream.** Neutral surfaces carry a faint green tint and read as near-grey. Warm near-white backgrounds are not used.
- **Name the meaning first.** Framework aliases such as `--accent`, `--secondary`, and `--ring` may map to product tokens, but documentation and product code name the semantic role first.

## Typography

**Display font:** Plus Jakarta Sans, with `sans-serif` fallback

**Body font:** Plus Jakarta Sans

**Accent font:** Lora, through `--font-serif` and `--font-accent`

**Mono font:** the system monospace stack, only for code, tokens, identifiers, URLs, and tabular technical data

Plus Jakarta Sans is clear at small sizes and reads well in dense tables. Lora is used sparingly in editorial text, where it cannot be mistaken for interface hierarchy.

### Hierarchy

- **Display:** `display-lg`, `display-md`, and `display-sm`; semi-bold; 1.1 to 1.2 line height; `-0.02em` tracking. Use for marketing heroes and the occasional app entry page that needs orientation.
- **Headline:** `headline-lg` and `headline-md`; semi-bold; 1.25 to 1.3 line height. Use for major app sections and page titles.
- **Title:** `title-lg`, `title-md`, and `title-sm`; semi-bold; 1.35 to 1.4 line height. Use for cards, components, navigation, and dense section labels.
- **Body:** `body-lg`, `body-md`, and `body-sm`; regular; 1.6 line height. Keep prose to 65 to 75 characters per line where practical.
- **Label:** `label-lg`, `label-md`, and `label-sm`; medium; 1.3 to 1.4 line height; `0.01em` to `0.05em` tracking. Uppercase is limited to short metadata and table categories.

The app uses fixed type steps and fixed breakpoints. Marketing may apply `clamp()` to display and headline sizes. Body text stays at least 1rem on touch-first forms so mobile browsers do not zoom focused controls.

Lora is allowed in short editorial asides, testimonials, hero accent phrases, and onboarding or empty-state copy. It is not allowed in navigation, buttons, labels, tables, forms, calendars, charts, identifiers, or dense dashboards.

Size, weight, line length, and spacing set hierarchy before colour does.

## Layout

App screens follow one order: persistent navigation, a short header naming the current location, then the task. A view may use a 2:1 content and support split when the narrower column holds context or actions for the main task. It is not a default card-grid template.

### Spacing and grouping

- `16px`: compact related controls, dense internal sections, and mobile gaps.
- `24px`: card padding and standard panel gaps.
- `32px`: separation between list groups or adjacent task regions.
- `48px`: major page-section separation.
- Related labels, help, and errors stay within `4px` to `8px` of their control.

Use one primary action and up to two visible secondary actions; move less frequent actions into a labelled overflow menu. More than four choices at once need grouping, a recommended default, or progressive disclosure.

### Density

| Context | Row and control rhythm | Visible information | Action treatment |
|---|---|---|---|
| Employee default | 44 to 48px rows, 24px groups | Task essentials and personal context | One primary action, supporting actions explicit |
| Manager default | 40 to 44px rows, 16 to 24px groups | Person, date, type, status, exception | Batch or keyboard paths may supplement visible actions |
| Admin compact | 36 to 40px rows where pointer precision allows | Operational metadata, timestamps, health, scope | One row action plus labelled overflow |
| Coarse pointer | Minimum 44px hit area | Same information, fewer side-by-side controls | Actions stack or move into sheets |

Density changes spacing and disclosure, never type size below the readable minimum. Large display headers are reserved for entry pages that need orientation; repeat operational pages use headline or title scale.

### Responsive behaviour

- **Below 640px:** one-column task flows, 16px outer padding, stacked actions, and sheets for secondary filters. Day or agenda view is the preferred calendar view. Dense two-dimensional data may scroll horizontally only when the region is labelled, keyboard focusable, and an equivalent detail path exists.
- **640 to 1023px:** two-column summaries where content stays readable. Keep primary actions close to the task and avoid fixed side panels.
- **1024 to 1439px:** persistent or collapsible sidebar, standard density, optional supporting column.
- **1440px and above:** cap long-form line length, widen data views, and keep the same information hierarchy rather than adding more cards.

At 200% zoom, controls wrap without covering content, dialogs stay within the viewport, and no primary task requires scrolling in two directions.

### Marketing and reading pages

Marketing may use fluid display type, generous section spacing, sticky scrolling sections, and different art at different breakpoints. Reading pages use a stable line length and task-focused navigation. Neither changes how app components behave.

## Elevation & Depth

Persistent depth comes from surface tone. Rows, calendar cells, form fields, dashboard tiles, and tables do not use shadows for decoration. Cards carry the `elev-card` hairline by default (light: two soft 10% shadows; dark: a 1px `#494A49` edge, because shadows do not read on near-black); `variant="plain"` removes it on darker parents.

Floating surfaces use elevation to show they sit above the page:

- **Sticky:** a low separator shadow for app or marketing headers.
- **Popover:** an 8px/24px shadow with default neutral frost.
- **Toast:** a 12px/32px shadow with a strong edge.
- **Modal:** a 24px/48px shadow plus a second low shadow, with strong neutral frost.

Default frost uses the neutral `surface` at 72% alpha with 16px blur and limited saturation. Strong frost uses 86% alpha with 24px blur. Tooltips stay opaque because they must be legible over any content.

Frost always has an opaque `surface-container-highest` fallback. `@supports`, `prefers-reduced-transparency`, and forced-colours handling are required. Text, focus, and status containers inside frost are tested over the worst likely content beneath.

App motion is 150 to 250ms, ease-out, and tied to state changes. Marketing may use 400 to 720ms entrance and scroll motion. The sign-in brand panel may use a 500 to 600ms entrance and one seven-second demonstration loop. Longer motion must not block input and must settle to a complete static state under `prefers-reduced-motion`.

- **Separate by tone first.** Persistent boundaries use surface shifts. Grid guides, form boundaries, forced-colour borders, and edges required for accessibility are the exceptions.
- **Frost is for floating surfaces.** Blur never sits behind primary content. A surface that does not float above the task does not get frost.
- **`elev-card` is the strongest persistent shadow.** Anything stronger belongs to a named floating level.

## Shapes

Corners are rounded but restrained:

- `20px`: cards and large persistent task containers.
- `16px`: dialogs, sheets, popovers, and major grouped surfaces.
- `14px`: buttons, fields, and standard controls.
- `12px`: chips, badges, compact rows, and small containers.
- Full pills: short badges, switches, avatars, and status dots only.

Two-pixel chart markers and tooltip arrows, and four-pixel checkbox geometry, are functional exceptions, not surface radii.

Borders are faint and carry meaning. Form fields, grids, focus indicators, forced colours, and selected states may use a visible boundary when it helps recognition. Cards never nest; use spacing or a tonal inset instead.

A component's radius follows its size and role. Do not use 4px or 8px radii on user-facing containers.

## Components

Every interactive component defines default, hover, focus-visible, active, disabled, loading where applicable, error, and success behaviour. Focus uses a solid 3px `ring` outline offset 2px from the control, so it never merges with a filled button and survives forced-colours mode; reset with `outline-hidden`, never `outline-none`. The primary ring reaches at least 4.5:1 on every light surface and 6.6:1 in dark. Error rings and boundaries use the full error colour. Disabled controls use an opaque `surface-container-highest` fill with `muted-foreground` text, never 50% opacity, and explain unavailable actions when the reason is not obvious. A loading button (`aria-busy`) keeps its variant colours and blocks repeat clicks.

Hover moves each button fill 10% away from its own label colour, so label contrast rises: primary and destructive mix toward `on-surface`, secondary mixes toward `background`. Links are underlined at rest and thicken to 2px on hover.

### Buttons

- **Default:** 36px visual height on precise pointers, 44px minimum hit area on coarse pointers; `text-sm`, medium weight, 14px corners.
- **Primary:** `primary` fill and `on-primary` text. Use once per decision region.
- **Secondary:** `secondary-container` fill and `on-secondary-container` text.
- **Outline:** page fill with an `outline` boundary (at least 3:1), no shadow.
- **Ghost:** transparent until hover, then neutral `surface-container-high`.
- **Destructive:** `error` fill and explicit destructive copy.
- **Loading:** keep the button width, show a spinner and an unchanged verb, set `aria-busy`, and prevent duplicate submission.

### Inputs and fields

Labels stay visible above fields and are programmatically associated. Help and error text use `aria-describedby`; errors use `aria-invalid` and `role="alert"` when added dynamically. Input text is 1rem on narrow or touch layouts and may reduce to body-sm on precise desktop layouts. Fields use an `outline` boundary (at least 3:1) and no shadow; an invalid field takes a 2px destructive boundary.

Validation keeps the user's input. Error summaries receive focus only after a failed submission and link back to the affected fields. Dates, numbers, names, and long notes must handle 30% text expansion, emoji, accents, and long unbroken strings.

### Navigation

The sidebar uses `surface-container-low`. Active items use primary text on a light primary tint and set `aria-current`. Every authenticated page has one `main` landmark and a skip link that appears on focus. On mobile, navigation moves into a sheet and returns focus to its trigger when closed.

### Calendar and AvailabilityRecord

The calendar is for scanning, not data entry. Every visible record shows, in order:

1. person or privacy-safe display name;
2. availability or leave type;
3. provenance (sync icon for Xero, pencil for manual);
4. exception state such as pending, draft, failed, or private.

Month cells show up to three records, then a labelled “more” link to the day view. Week and day views keep chronological order. All-day records come before timed records. Public holidays use a labelled warning treatment and never reuse the manual-provenance lavender.

Selecting a record opens a detail popover with source, approval status, date and time, contactability, notes when permitted, and a clear edit or view-only state. Dense calendar controls may be visually compact, but their accessible name includes person, type, source, and exception state.

Calendar structure uses native headings, groups, lists, and buttons unless a complete ARIA grid with roving focus and arrow-key navigation is implemented. Never declare `role="grid"` without that keyboard support. Two-dimensional desktop views offer an equivalent day or detail path on narrow or zoomed layouts.

### Provenance chips and status badges

Xero provenance uses sage, a sync icon (`RefreshCwIcon`), and “Xero” wording. Manual provenance uses lavender, a pencil icon, and “Manual” wording. Provenance never stands in for approval or sync status.

Pending, draft, failed, warning, private, and success badges use their own copy and semantic container. Every tinted chip takes a 1px ring of its own text colour at 30%, because the fills alone sit at about 1.2:1 on neutral surfaces. Status dots must have adjacent text. Informational “New” or “Beta” badges may use lavender because they do not represent record provenance in the calendar.

### Actions with external effects

Approve, decline, withdraw, rotate token, pause feed, archive, reconnect, and manual sync follow this sequence:

1. preview the affected person, dates, balance, feed, or downstream effect;
2. name the external write or notification;
3. block dismissal and duplicate submission while the write is in progress;
4. announce progress politely;
5. show a confirmation, or a precise error with retry and a safe way out;
6. keep entered text and the current filter or organisation on failure.

Destructive actions use an alert dialog with an explicit Cancel and a confirmation button named for the action. Low-risk reversible actions may use inline confirmation or a toast.

### Async and system states

| State | Presentation | Announcement | Recovery |
|---|---|---|---|
| Initial loading | Skeleton matching final structure | `role="status"`, concise label | None |
| Background refresh | Existing content stays visible | Polite, only when relevant to the user | No layout reset |
| Queued or running | Label plus spinner or subtle pulse | Polite status | Disable duplicate action |
| Success | Plain-language confirmation | Polite status | Next action or return path |
| Partial success | Warning container with counts | Alert when the user started the action | Review failed records |
| Validation error | Inline field message plus focused summary | Alert | Keep input |
| Network or API failure | Problem, likely cause, retry | Alert | Retry, reconnect, or support path |
| Permission or read-only | Explanation and safe destination | On navigation | No dead controls |
| Empty | What is missing and why | Normal reading order | One relevant next action |
| Stale data | Last successful update and source | Polite when state changes | Refresh or inspect sync |

Live-update reconnection stays silent unless data freshness is affected. After a short interruption, show “Reconnecting to live updates” in a polite live region and remove it when the stream recovers.

### Tables and charts

Tables keep semantic table markup, labelled columns, tabular numerals, and visible focus for interactive rows. On narrow screens, either reduce to the essential columns in a list or card layout, or provide a labelled focusable scroll region plus a full row-detail action.

Charts include a text title, an accessible summary, a labelled legend, and a series distinction that does not rely on colour. Tooltips supplement the data; they never hold information that is unavailable by keyboard or in the adjacent summary or table.

### Empty states, help, and onboarding

First-use states explain where balances and leave data come from without assuming knowledge of Xero terms. Contextual help appears next to irreversible or privacy-sensitive decisions. Tooltips explain controls, not policy. Help links keep the current organisation and open task-focused guidance.

### Sign-in and marketing exceptions

The sign-in brand panel is the only surface near the app where green may fill a large area. Its gradient, glow, provenance dots, and brand mark stay on the sign-in page and are never reused on data screens.

Marketing may use fluid display type, third-party brand colours, and scroll-driven layout. These belong to marketing pages, not to shared app components.

## Do's and Don'ts

### Do:

- **Do** make the primary task and current state identifiable within seconds.
- **Do** keep record source, approval status, sync health, and action colour visually distinct.
- **Do** pair every status or provenance colour with text or an icon.
- **Do** use full-opacity focus rings that clear 3:1 against adjacent surfaces.
- **Do** keep input, filters, organisation, and a safe way out after a failed change.
- **Do** announce success politely and failures assertively when the user started the action.
- **Do** use surface tone before borders or shadows on persistent content.
- **Do** provide opaque frost fallbacks and static reduced-motion states.
- **Do** use Australian English and specific recovery copy.
- **Do** test empty, loading, long-content, permission, partial-success, dark, mobile, zoomed, keyboard, and coarse-pointer states.

### Don't:

- **Don't** copy Notion's flat document style: undifferentiated text, weak hierarchy, and low-contrast controls.
- **Don't** use warm cream backgrounds, bright generic success green, or purple as a primary action colour.
- **Don't** use colour alone for provenance, status, chart series, or availability.
- **Don't** declare an ARIA interaction pattern without implementing its keyboard support.
- **Don't** dismiss a confirmation or reload the page after a failed change.
- **Don't** show raw provider errors, tokens, or payloads to employees.
- **Don't** nest cards, build grids of large metric cards, or number sections unless the order carries meaning.
- **Don't** put frost or shadows behind primary content.
- **Don't** use Lora in navigation, forms, calendars, tables, charts, or dense app screens.
- **Don't** use em dashes or en dashes in UI copy or generated product text.
