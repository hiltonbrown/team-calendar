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

**Creative North Star: "Clarity at a glance."**

Team Calendar is a high-legibility operational instrument. It helps a small business see who is in, who is out, and what needs attention without hunting through Xero, email, or messages. The interface earns trust through type-led hierarchy, purposeful colour, tonal depth, restrained motion, and explicit recovery paths. Signal leads; surface recedes.

The system has three surface modes:

- **Operate:** the authenticated app. Scanability, native interaction expectations, predictable state, and task completion outrank expression.
- **Persuade:** the marketing site. The same identity may use fluid display type, richer composition, and authored entrance or scroll motion to explain the product.
- **Read:** help, legal, blog, and documentation surfaces. Reading order, measure, and task-focused navigation lead.

Authentication is an Operate threshold with one scoped brand-panel exception. Its artwork may demonstrate the provenance language before the user enters the product, but it must never slow or obscure sign-in.

**Key Characteristics:**

- Sage and lavender communicate record provenance; status remains a separate labelled channel.
- Tonal layering separates persistent content; frost signals transient elevation only.
- Plus Jakarta Sans carries the interface; Lora appears only where a human editorial voice helps.
- Density is measurable and role-appropriate, with compact manager/admin patterns and calmer employee flows.
- High-stakes actions preview impact, announce progress, preserve work, and provide recovery.
- Australian English, WCAG 2.2 AA, reduced-motion, reduced-transparency, forced-colours, and 200% reflow are the floor.

**The Six-Second Scan Rule.** A manager should identify the current date, people unavailable, record meaning, and any failed or pending state within six seconds. Secondary metadata belongs in a detail surface.

**The Receipt Rule.** Any action that writes to Xero, changes a feed, or affects another person ends with an explicit result: what changed, where it was sent, and what the user can do next.

## Colors

The palette is sage-led on near-grey neutrals with a faint green tint. Green is a scarce action and provenance signal, lavender marks manual records and information, muted ochre marks attention, and red is reserved for destructive or failed states.

### Semantic roles

| Meaning | Token | Required companion |
|---|---|---|
| Primary action and brand anchor | `primary` | Verb-led label |
| Successful outcome or healthy metric | `success` (aliases `primary`) / `primary-container` | Success copy or icon |
| Xero-synced provenance | `secondary-container` | Sync icon (`RefreshCwIcon`) and “Xero” or equivalent label |
| Manual provenance | `accent-container` | Pencil icon and “Manual” or equivalent label |
| Attention, expiry, or partial success | `warning-container` | Warning icon and actionable label |
| Failure or destructive action | `error` / `error-container` | Error icon, problem statement, recovery |
| Editorial emphasis | `editorial-accent` | Small Persuade or Read accents only |
| Neutral hover adapter | `surface-container-high` | No semantic meaning |

`editorial-accent` is the product purple. The shadcn-compatible CSS variable `--accent` is not purple; it aliases `surface-container-high` for neutral hover and selected surfaces. Never use the adapter name as a product semantic.

### Surface hierarchy

`surface` is the page canvas. `surface-container-low` creates navigation and contextual bands. `surface-container` groups related work. `surface-container-lowest` is the card and elevated opaque base. `surface-container-high` is the neutral hover surface. `surface-container-highest` is the opaque fallback for frost and the strongest neutral field fill.

Cards use `surface-container-lowest`. The default card carries the `elev-card` hairline so it stays visible on the near-white page. Use `variant="plain"` only for a card on a parent at least two surface steps darker (`surface-container-high` or below), where the tonal step alone separates it. Never combine the hairline with a border; the only card border is the forced-colours fallback.

### Dark mode

Dark mode preserves semantic roles rather than mechanically inverting light values. The implemented dark values live in `packages/design-system/styles/globals.css` and the design sidecar.

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

Theme resolution defaults to the system preference. A manual selection is stored per device by the theme provider. Database persistence is not part of the current product contract.

### Charts

Charts use the sage ramp `chart-1` to `chart-4` (light `#1F3D23`, `#46734A`, `#7FA882`, `#B4D3B3`; dark `#D2ECD3`, `#8FD496`, `#5A9A60`, `#2F5A34`) with `chart-5` aliasing `tertiary`. Colour never identifies a series alone. Every multi-series chart pairs colour with at least one of: a distinct stroke dash, marker shape, direct label, icon, or adjacent data table. The lightest sage is a fill or area colour, not a thin line on a light canvas. Purple remains reserved for manual provenance and is not a generic chart series colour.

### Named rules

**The One Lead Rule.** Sage leads, editorial purple supports, and they never carry equal visual weight in one composition.

**The Provenance Rule.** Xero and manual source colours always pair with a source icon or visible label. Approval, sync, and publication status use separate words, icons, and semantic containers.

**The No-Cream Rule.** Neutral surfaces carry a faint green tint and read as near-grey. Warm near-white backgrounds are outside the visual world.

**The Adapter Rule.** Framework aliases such as `--accent`, `--secondary`, and `--ring` may map to product tokens, but documentation and product code name the semantic role first.

## Typography

**Display Font:** Plus Jakarta Sans, with `sans-serif` fallback

**Body Font:** Plus Jakarta Sans

**Accent Font:** Lora, through `--font-serif` and `--font-accent`

**Mono Font:** the system monospace stack, only for code, tokens, identifiers, URLs, and tabular technical data

**Character:** A humanist geometric sans gives the operational product precision without sterility. A quiet serif adds warmth only in editorial moments where it cannot be mistaken for interface hierarchy.

### Hierarchy

- **Display:** `display-lg`, `display-md`, and `display-sm`; semi-bold; 1.1–1.2 line height; `-0.02em` tracking. Use for Persuade heroes and occasional orientation-heavy app entry points.
- **Headline:** `headline-lg` and `headline-md`; semi-bold; 1.25–1.3 line height. Use for major app sections and page titles.
- **Title:** `title-lg`, `title-md`, and `title-sm`; semi-bold; 1.35–1.4 line height. Use for cards, components, navigation, and dense section labels.
- **Body:** `body-lg`, `body-md`, and `body-sm`; regular; 1.6 line height. Prose measure stays between 65 and 75 characters where practical.
- **Label:** `label-lg`, `label-md`, and `label-sm`; medium; 1.3–1.4 line height; `0.01em` to `0.05em` tracking. Uppercase is limited to short metadata and table categories.

Operate uses fixed type steps and structural breakpoints. Persuade may scope `clamp()` to display and headline sizes. Body text remains at least 1rem on touch-first forms so mobile browsers do not zoom focused controls unexpectedly.

**The Lora Leash Rule.** Lora is approved for short editorial asides, testimonials, hero accent phrases, and warm onboarding or empty-state copy. It is prohibited in navigation, buttons, labels, tables, forms, calendars, charts, identifiers, and dense dashboards.

**The Scale-First Rule.** Size, weight, measure, and spacing establish hierarchy before colour does.

## Layout

Operate screens follow a clear stage-to-work sequence: persistent navigation, concise current-location header, then the task surface. A view may use a 2:1 content/support split when the narrower region carries scan context or actions that genuinely support the primary task. It is not a default card-grid template.

### Spacing and grouping

- `16px`: compact related controls, dense internal sections, and mobile gaps.
- `24px`: card padding and standard panel gaps.
- `32px`: separation between list groups or adjacent task regions.
- `48px`: major page-section separation.
- Related labels, help, and errors remain within `4px` to `8px` of their control.

Use one primary action, up to two visible secondary actions, and move lower-frequency actions into a labelled overflow menu. More than four simultaneous choices require grouping, a recommended default, or progressive disclosure.

### Density

| Context | Row/control rhythm | Visible information | Action treatment |
|---|---|---|---|
| Employee default | 44–48px rows, 24px groups | Task essentials and personal context | One primary action, supporting actions explicit |
| Manager default | 40–44px rows, 16–24px groups | Person, date, type, status, exception | Batch or keyboard paths may supplement visible actions |
| Admin compact | 36–40px rows where pointer precision allows | Operational metadata, timestamps, health, scope | One row action plus labelled overflow |
| Coarse pointer | Minimum 44px hit area | Same information, fewer side-by-side controls | Actions stack or move into sheets |

Density changes spacing and disclosure, not type below the readable floor. Large contextual display headers are reserved for orientation-heavy entry surfaces; repeat operational pages use headline or title scale.

### Responsive behaviour

- **Below 640px:** use one-column task flows, 16px outer padding, stacked actions, and sheets for secondary filters. Day or agenda presentation is the preferred calendar task view. Dense two-dimensional data may remain horizontally scrollable only when the region is labelled, keyboard focusable, and an equivalent detail path exists.
- **640–1023px:** allow two-column summaries where content remains readable. Keep primary actions close to the task and avoid fixed side panels.
- **1024–1439px:** persistent or collapsible sidebar, standard density, optional supporting column.
- **1440px and above:** cap long-form measure, expand data canvases, and retain the same information hierarchy rather than filling space with more cards.

At 200% zoom, controls wrap without covering content, dialogs remain within the viewport, and no primary task requires two-dimensional panning.

### Surface modes

Persuade may use fluid display type, generous section spacing, sticky narrative composition, and richer responsive art direction. Read uses a stable prose measure and task-focused navigation. These scoped choices never redefine Operate component behaviour.

## Elevation & Depth

Persistent depth comes from tonal layering. Rows, calendar cells, form fields, dashboard tiles, and tables do not use ramp shadows as decoration. Cards carry the `elev-card` hairline by default (light: two soft 10% shadows; dark: a 1px `#494A49` edge, because shadows do not read on near-black); `variant="plain"` removes it on darker parents.

Transient surfaces use elevation as a structural signal:

- **Sticky:** a low separator shadow for app or marketing chrome.
- **Popover:** a soft 8px/24px shadow with default neutral frost.
- **Toast:** a soft 12px/32px shadow with strong edge definition.
- **Modal:** a 24px/48px shadow plus a low secondary lift with strong neutral frost.

Default frost uses the neutral `surface` at 72% alpha with 16px blur and restrained saturation. Strong frost uses 86% alpha with 24px blur. Tooltips remain opaque because they must be legible over arbitrary content.

Frost always has an opaque `surface-container-highest` fallback. `@supports`, `prefers-reduced-transparency`, and forced-colours handling are required. Text, focus, and status containers inside frost are tested over the worst plausible content beneath.

Operate motion is 150–250ms, ease-out, and tied to state changes. Persuade may use scoped 400–720ms entrance and scroll motion. The auth brand panel may use a 500–600ms entrance and one quiet seven-second demonstration loop. Longer motion must be non-blocking and settle to a complete static state under `prefers-reduced-motion`.

**The Tonal Layering Rule.** Persistent boundaries use surface shifts first. Ghost grid guides, form boundaries, forced-colour borders, and accessibility-required edges are functional exceptions.

**The Frost Means Floating Rule.** Blur is never a background treatment beneath primary content. If a surface does not float above the task, it does not receive frost.

**The Hairline Ceiling Rule.** `elev-card` is the strongest persistent card shadow. Everything stronger belongs to named transient elevation.

## Shapes

The form language is softly rectangular, not bubbly:

- `20px`: cards and large persistent task containers.
- `16px`: dialogs, sheets, popovers, and major grouped surfaces.
- `14px`: buttons, fields, and standard controls.
- `12px`: chips, badges, compact rows, and small containers.
- Full pills: short badges, switches, avatars, and status dots only.

Two-pixel chart markers and tooltip arrows, plus four-pixel checkbox micro-geometry, are permitted functional exceptions. They are not surface radii.

Borders are ghosted and semantic. Form fields, grids, focus indicators, forced-colours, and selected states may use a visible boundary when it improves recognition. Nested cards remain prohibited; use spacing or a tonal inset instead.

**The Corner Rule.** A component’s radius follows its interaction scale. Do not introduce arbitrary 4px or 8px radii on user-facing containers.

## Components

Every interactive component defines default, hover, focus-visible, active, disabled, loading where applicable, error, and success behaviour. Focus uses a solid 3px `ring` outline offset 2px from the control, so it never merges with a filled button and survives forced-colours mode; reset with `outline-hidden`, never `outline-none`. The primary ring reaches at least 4.5:1 on every light surface and 6.6:1 in dark. Error rings and boundaries use the full error colour. Disabled controls use an opaque `surface-container-highest` fill with `muted-foreground` text, never 50% opacity, and explain unavailable actions when the reason is not obvious. A loading button (`aria-busy`) keeps its variant colours and blocks repeat clicks.

Hover moves each button fill 10% away from its own label colour, so label contrast rises: primary and destructive mix toward `on-surface`, secondary mixes toward `background`. Links are underlined at rest and thicken to 2px on hover.

### Buttons

- **Default:** 36px visual height on precise pointers, 44px minimum hit area on coarse pointers; `text-sm`, medium weight, 14px corners.
- **Primary:** `primary` fill and `on-primary` text. Use once per decision region.
- **Secondary:** `secondary-container` fill and `on-secondary-container` text.
- **Outline:** page fill with an `outline` boundary (at least 3:1), no decorative shadow.
- **Ghost:** transparent until hover, then neutral `surface-container-high`.
- **Destructive:** `error` fill and explicit destructive copy.
- **Loading:** preserve the button width, show a spinner plus a stable verb, set `aria-busy`, and prevent duplicate submission.

### Inputs and fields

Labels remain visible above fields and are programmatically associated. Help and error text use `aria-describedby`; errors use `aria-invalid` and `role="alert"` when introduced dynamically. Input text is 1rem on narrow/touch layouts and may reduce to body-sm on precise desktop layouts. Fields use an `outline` boundary (at least 3:1) and no shadow; an invalid field takes a 2px destructive boundary.

Validation preserves the user’s input. Error summaries receive focus only after a failed submission and link back to affected fields. Dates, numbers, names, and long notes must tolerate 30% text expansion, emoji, accents, and long unbroken content.

### Navigation

The sidebar uses `surface-container-low`. Active items use primary text on a light primary wash and expose `aria-current`. Every authenticated page has one `main` landmark and a visible-on-focus skip link. Mobile navigation moves into a sheet and returns focus to its trigger when closed.

### Calendar and AvailabilityRecord

The calendar is a scan surface, not a form grid. Every visible record communicates, in order:

1. person or privacy-safe display name;
2. availability or leave type;
3. provenance through sync/Xero or pencil/manual cue;
4. exception state such as pending, draft, failed, or private.

Month cells show up to three records, then a labelled “more” path to day detail. Week and day views preserve chronological order. All-day records precede timed records. Public holidays occupy a labelled warning treatment and never reuse manual-provenance lavender.

The compact record control opens a detail popover containing source, approval status, date/time, contactability, notes when permitted, and a clear edit or view-only state. Dense calendar controls may use compact visual height, but their accessible name includes person, type, source, and exception state.

Calendar structure uses native headings, groups, lists, and buttons unless a complete ARIA grid model with roving focus and arrow-key navigation is implemented. Never declare `role="grid"` without that keyboard contract. Two-dimensional desktop views expose an equivalent day/detail path on narrow or zoomed layouts.

### Provenance chips and status badges

Xero provenance uses sage, a sync icon (`RefreshCwIcon`), and “Xero” language. Manual provenance uses lavender, a pencil icon, and “Manual” language. Provenance never substitutes for approval or sync status.

Pending, draft, failed, warning, private, and success badges use their own copy and semantic container. Every tinted chip takes a 1px ring of its own text colour at 30%, because the fills alone sit at about 1.2:1 on neutral surfaces. Status dots must have adjacent text. Informational “New” or “Beta” badges may use lavender because they do not represent record provenance inside the operational calendar.

### High-stakes actions

Approve, decline, withdraw, rotate token, pause feed, archive, reconnect, and manual sync flows follow this sequence:

1. preview affected person, dates, balance, feed, or downstream consequence;
2. name the external write or notification;
3. disable dismissal and duplicate submission while the write is in flight;
4. announce progress politely;
5. show a success receipt or a precise error with retry and safe exit;
6. preserve entered text and current filter or organisation context on failure.

Destructive actions use an alert dialog with explicit Cancel and a verb-specific confirmation. Low-risk reversible actions may use inline confirmation or a toast.

### Async and system states

| State | Presentation | Announcement | Recovery |
|---|---|---|---|
| Initial loading | Skeleton matching final structure | `role="status"`, concise label | None |
| Background refresh | Existing content remains visible | Polite only when user-relevant | No layout reset |
| Queued or running | Label plus spinner or restrained pulse | Polite status | Disable duplicate action |
| Success | Plain-language receipt | Polite status | Next action or return path |
| Partial success | Warning container with counts | Alert when action initiated by user | Review failed records |
| Validation error | Inline field plus focused summary | Alert | Preserve input |
| Network/API failure | Problem, likely cause, retry | Alert | Retry, reconnect, or support path |
| Permission/read-only | Explanation and safe destination | On navigation | No dead controls |
| Empty | What is absent and why | Normal reading order | One relevant next action |
| Stale data | Last successful update and source | Polite when state changes | Refresh or inspect sync |

SSE reconnection stays quiet unless data freshness is affected. After a short interruption, show “Reconnecting to live updates” with a polite live region and remove it when the stream recovers.

### Tables and charts

Tables retain semantic table markup, labelled columns, tabular numerals, and visible focus for interactive rows. On narrow screens, either prioritise essential columns into a list/card treatment or provide a labelled focusable scroll region plus a complete row-detail action.

Charts include a textual title, accessible summary, labelled legend, and non-colour series distinction. Tooltips supplement the data; they never contain information unavailable by keyboard or in the adjacent summary/table.

### Empty, help, and onboarding

First-use states explain the source of balances and leave data without requiring Xero terminology knowledge. Contextual help appears beside irreversible or privacy-sensitive decisions. Tooltips explain controls, not domain policy. Help links keep the current organisation context and open task-focused guidance.

### Signature surfaces

The auth brand panel is the single Operate-adjacent surface where green may lead as a broad brand moment. Its gradient, glow, provenance dots, and geometric glyph (the brand mark, unchanged) are scoped to authentication and never reused on data surfaces.

Marketing may use fluid display type, vendor colours, and authored scroll composition. Those are Persuade tools, not shared app-component defaults.

## Do's and Don'ts

### Do:

- **Do** make the primary task and current state identifiable within seconds.
- **Do** separate record source, approval status, sync health, and action colour semantically.
- **Do** pair every status or provenance colour with text or an icon.
- **Do** use full-opacity focus rings that clear 3:1 against adjacent surfaces.
- **Do** preserve input, filters, organisation context, and safe exits across failed mutations.
- **Do** announce user-triggered success politely and failures assertively.
- **Do** use tonal hierarchy before borders or shadows on persistent content.
- **Do** ship opaque frost fallbacks and reduced-motion static states.
- **Do** keep Australian English and direct, specific recovery copy.
- **Do** test empty, loading, long-content, permission, partial-success, dark, mobile, zoomed, keyboard, and coarse-pointer states.

### Don't:

- **Don't** reproduce the Notion anti-reference: undifferentiated text, flat hierarchy, and low-contrast chrome.
- **Don't** use warm SaaS cream, bright generic success green, or purple as a primary action colour.
- **Don't** use colour alone for provenance, status, chart series, or availability meaning.
- **Don't** declare an ARIA interaction pattern without implementing its keyboard model.
- **Don't** dismiss a confirmation or refresh the page after a failed mutation.
- **Don't** show raw provider errors, tokens, or payloads to employees.
- **Don't** nest cards, build hero-metric card grids, or use numbered section scaffolding unless the sequence is real information.
- **Don't** apply frost or ramp shadows beneath primary content.
- **Don't** use Lora in navigation, forms, calendars, tables, charts, or dense app UI.
- **Don't** use em dashes in UI copy or generated product text.
