---
name: Team Calendar
description: Multi-tenant leave management and availability publishing for teams on Xero Payroll
colors:
  primary: "#336A3B"
  on-primary: "#FFFFFF"
  primary-container: "#6DA671"
  on-primary-container: "#1B3620"
  secondary: "#4B6542"
  secondary-container: "#CAE8BC"
  on-secondary-container: "#2A3D24"
  tertiary: "#57624F"
  accent: "#EBE5F7"
  on-accent: "#1C1A26"
  accent-container: "#E5DFFF"
  on-accent-container: "#1F1551"
  surface: "#FCF8FF"
  surface-container-lowest: "#FFFFFF"
  surface-container-low: "#F6F1FF"
  surface-container: "#F1EBFD"
  surface-container-high: "#EBE5F7"
  surface-container-highest: "#E5E0F1"
  surface-variant: "#E0DDE6"
  on-surface: "#1C1A26"
  on-surface-variant: "#46454E"
  inverse-surface: "#312F3C"
  inverse-on-surface: "#F3EFF8"
  outline: "#777680"
  outline-variant: "#C1C9BD"
  error: "#BA1A1A"
  error-container: "#FFDAD6"
  success: "#6DA671"
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
    fontWeight: 500
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
    backgroundColor: "#336A3BE6"
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
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface-container-lowest}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: "24px"
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
---

# Design System: Team Calendar

## 1. Overview

**Creative North Star: "Clarity at a glance."**

Team Calendar is a high-legibility operational instrument where colour carries meaning: sage for Xero-synced leave, lavender for manual entries, red for errors. The buyer's job is knowing who is in, who is out, and why, on sight. The interface earns trust through legibility and restraint: type-led hierarchy, tonal layering instead of borders, intentional whitespace, and asymmetrical balance. Signal leads; surface recedes.

The system explicitly rejects the Notion flat document aesthetic (undifferentiated text-heavy layouts, absent hierarchy, low-contrast chrome), generic SaaS-cream palettes, hero-metric card grids, and any composition that decorates before it informs. It is light-first with an equally cared-for dark mode, and it is calm without being sleepy: managers scan and leave in under 30 seconds.

Layout doctrine, applied per screen rather than per component:

- **Asymmetrical balance.** Default content/sidebar split is roughly 2:1 (e.g. `grid-template-columns: 1fr 380px`). The wider column holds primary content; the narrower holds metadata, actions, or summary cards.
- **Intentional whitespace.** Minimum `24px` gap between cards. `32px` or `48px` vertical spacing between list groups instead of divider lines.
- **Contextual header.** Full-width `surface-container-low` bleed at the top of each view, pairing a `display-sm` headline with a `body-lg` summary. It separates the stage (navigation context) from the work area (content).
- **Responsive breakpoints.** `640px` (mobile), `1024px` (tablet), `1440px` (desktop). Collapse the sidebar below `1024px`. Responsive behaviour is structural, not fluid typography.

**Key Characteristics:**

- Colour as provenance: the sage/lavender split is data, not decoration
- Tonal layering over borders and shadows on all persistent surfaces
- Type-led hierarchy on a lavender-tinted neutral surface ramp
- Frost reserved for elevated transient UI, always with opaque fallbacks
- Density scales with role (admin dense, employee airy), never below readability
- Australian English, no em dashes, WCAG 2.2 AA floor

## 2. Colors

A sage-led botanical palette on lavender-tinted neutrals, with an editorial purple reserved for provenance and information. The frontmatter carries the light-mode values; they are normative.

### Primary

- **Forest Sage** (`primary`): high-action touchpoints, CTAs, focus rings, sidebar active state, brand moments. The identity anchor; it earns its place and is never wallpaper.
- **Signature Sage** (`primary-container`): large brand surfaces, primary action blocks, success and growth metrics. This is the product's only success green.

### Secondary

- **Supportive Green** (`secondary`): secondary actions and supporting emphasis.
- **Sage Wash** (`secondary-container`): secondary button fills, tags, and the Xero-synced provenance chip.

### Tertiary

- **Editorial Purple** (`accent`): saturated purple for icon strokes, focus rings on accent surfaces, and small accent moments only.
- **Lavender Wash** (`accent-container`): manual availability provenance chips, informational banners, "New"/"Beta" badges, neutral tips.
- **Muted Green** (`tertiary`): tertiary text and metadata.

### Neutral

- **Lavender White** (`surface`): base page background. Cool-tinted toward the accent hue, never cream.
- **Surface ramp** (`surface-container-lowest` → `surface-container-highest`): the five-step tonal ladder that replaces borders and shadows. Cards sit one step above their parent; hover moves one step up; active and input fills sit at the top.
- **Ink** (`on-surface`): primary text. Never `#000000`.
- **Soft Ink** (`on-surface-variant`): secondary and supporting text.
- **Deep Slate** (`inverse-surface`): high-contrast elements, footers, dark accents within light layouts.
- **Outline pair** (`outline`, `outline-variant`): disabled states and subtle iconography; `outline-variant` appears only as the 15% ghost border.
- **Error pair** (`error`, `error-container`): destructive actions, validation errors, error banners.

### Dark Mode

Dark mode inverts the surface and text layers while preserving the functional colour system. Greens and purples lighten for comfortable contrast. Implemented in `packages/design-system/styles/globals.css` under `.dark, [data-theme="dark"]`.

| Token | Dark value | Token | Dark value |
|---|---|---|---|
| `primary` | `#8FD496` | `surface` | `#131218` |
| `on-primary` | `#003912` | `surface-container-lowest` | `#0E0D13` |
| `primary-container` | `#1F5226` | `surface-container-low` | `#1C1B22` |
| `on-primary-container` | `#ABEDB0` | `surface-container` | `#211F26` |
| `secondary` | `#AECAA1` | `surface-container-high` | `#2B2931` |
| `secondary-container` | `#374E2E` | `surface-container-highest` | `#36343C` |
| `on-secondary-container` | `#C8E6BB` | `surface-variant` | `#46454E` |
| `tertiary` | `#B8C9AB` | `on-surface` | `#E6E1EC` |
| `accent` | `#C8BFFF` | `on-surface-variant` | `#C8C5D0` |
| `accent-container` | `#46398B` | `inverse-surface` | `#E6E1EC` |
| `on-accent` | `#2D1F6E` | `inverse-on-surface` | `#312F3C` |
| `on-accent-container` | `#E5DFFF` | `outline` | `#918F9A` |
| `error` | `#FFB4AB` | `outline-variant` | `#46454E` |
| `error-container` | `#93000A` | `success` | `#8FD496` |

Mode switching: CSS custom properties scoped to `[data-theme="light"]` and `[data-theme="dark"]` (plus the `.dark` class). Default to `prefers-color-scheme`; the manual toggle persists to the database, not localStorage.

### Chart Ramp

Charts use the sage family only: `--chart-1` `#336A3B`, `--chart-2` `#6DA671`, `--chart-3` `#4B6542`, `--chart-4` `#CAE8BC`, `--chart-5` `#57624F` (light mode; lightened equivalents in dark). Purple never appears in charts; it would read as manual-entry provenance.

### CSS Variable Mapping

The semantic tokens above map to shadcn/ui-compatible variables in `packages/design-system/styles/globals.css`:

| Design token | CSS variable | Notes |
|---|---|---|
| `surface` | `--background` | Page background |
| `surface-container-lowest` | `--card` | Card base |
| `on-surface` | `--foreground`, `--card-foreground`, `--on-surface` | Same value |
| `secondary-container` | `--secondary` | shadcn flattens container into base name |
| `on-secondary-container` | `--secondary-foreground` | |
| `surface-container` | `--muted` | Table striping, muted panels |
| `on-surface-variant` | `--muted-foreground` | Supporting text |
| `surface-container-high` | `--accent` | **shadcn's `--accent` is the neutral hover surface, not the purple** |
| `on-surface` | `--accent-foreground` | Text on neutral hover |
| `accent-container` | `--accent-container` | The purple lives here |
| `on-accent-container` | `--on-accent-container` | |
| `error` | `--destructive` | |
| `surface-container-highest` | `--input` | Input field fill (dark mode) |
| `primary` | `--ring` | Focus ring |
| `outline-variant` at 15% | `--border` | Ghost border via `color-mix` |
| `surface-container-low` | `--sidebar` | Sidebar surface |

The saturated `accent` purple (`#5E4F99`) has no direct CSS variable; purple surfaces use `--accent-container` with `--on-accent-container` text.

### Named Rules

**The One Lead Rule.** Sage leads, purple supports, never co-leads. Never combine accent purple with brand green at equal weight in a single composition. Never use purple for primary actions, CTAs, success, growth metrics, warnings, or broad backgrounds.

**The Provenance Rule.** Sage (`secondary-container`) marks Xero-synced records; lavender (`accent-container`) marks manual entries. This split is load-bearing data. Provenance colour always pairs with an icon (leaf / pencil), never colour alone.

**The No-Cream Rule.** Every neutral is tinted toward the accent's cool hue. Warm near-whites are prohibited; they are the generic SaaS default this brand rejects.

## 3. Typography

**Display Font:** Plus Jakarta Sans (with `sans-serif` fallback), via `next/font/google` as `--font-plus-jakarta-sans`
**Body Font:** Plus Jakarta Sans, the single default family for all product UI
**Accent Font:** Lora (`--font-serif`, `--font-accent`), editorial serif accent only
**Mono Font:** system monospace stack (`--font-mono`) for code, tokens, IDs, tabular technical text

**Character:** A humanist geometric sans with editorial warmth carrying the whole product; a quiet serif that appears only when a human voice helps. Hierarchy comes from the scale, not from switching families.

### Hierarchy

The full scale is implemented as `--text-*` tokens in `globals.css`. All steps use Plus Jakarta Sans.

- **Display** (Semi-Bold 600, `display-lg` 3.5rem / `display-md` 2.75rem / `display-sm` 2.25rem, line-height 1.1–1.2, letter-spacing -0.02em): hero statements, page-level headlines, contextual header headlines.
- **Headline** (Semi-Bold 600, `headline-lg` 2rem / `headline-md` 1.75rem, line-height 1.25–1.3): section and sub-section headings.
- **Title** (Medium 500, `title-lg` 1.375rem / `title-md` 1rem / `title-sm` 0.875rem, line-height 1.35–1.4): card headers, component titles, nav items.
- **Body** (Regular 400, `body-lg` 1.125rem / `body-md` 1rem / `body-sm` 0.875rem, line-height 1.6): lead paragraphs, default text, supporting text. Prose caps at 65–75ch; tables and dense UI may run wider.
- **Label** (Medium 500, `label-lg` 0.875rem / `label-md` 0.75rem / `label-sm` 0.6875rem, letter-spacing 0.01–0.05em): button text, overlines and ALL-CAPS categories, fine metadata and timestamps.

### Named Rules

**The Lora Leash Rule.** Lora is approved only for: short editorial asides on marketing pages, pull quotes and testimonials, small accent phrases within a hero, and empty-state or onboarding microcopy where warmth helps. Prefer italic. Lora is prohibited in app navigation, buttons, labels, table cells, form fields, calendar entries, charts, IDs, tokens, code, dense dashboards, and as the default body family. No Inter, Roboto, or any other UI family, ever.

**The Scale-First Rule.** Hierarchy is achieved through the typography scale first, colour second.

## 4. Elevation

Depth on persistent surfaces is achieved through **tonal layering**, not shadows or borders. A card at `surface-container` sits on a parent at `surface-container-low`; the tonal shift is the divider. Shadows, translucency, and backdrop blur are reserved for **elevated surfaces**: transient or floating UI rendered above the page (modals, dialogs, mobile sheets, popovers, dropdowns, command palette, sticky app chrome, toasts, date pickers). They are forbidden on cards, list rows, table cells, calendar cells, form inputs, dashboard tiles, and kanban columns, with one hairline exception noted below.

Frost is a structural signal ("this floats above the page"), not a flourish.

### Shadow Vocabulary

Slate-tinted in light mode, black in dark mode, always low opacity. One soft shadow per level; no multi-stop drama.

Light mode:

- **elev-sticky** (`box-shadow: 0 1px 0 rgba(53, 51, 64, 0.04)`): sticky app chrome.
- **elev-popover** (`box-shadow: 0 8px 24px rgba(53, 51, 64, 0.06)`): popovers, dropdowns, menus, tooltips, date pickers.
- **elev-toast** (`box-shadow: 0 12px 32px rgba(53, 51, 64, 0.06)`): toasts, snack bars, the floating sidebar variant.
- **elev-modal** (`box-shadow: 0 24px 48px rgba(53, 51, 64, 0.08), 0 4px 12px rgba(53, 51, 64, 0.04)`): modals, dialogs, mobile sheets.

Dark mode: same geometry with black at higher opacity (`0.20` sticky, `0.25` popover/toast, `0.32 + 0.20` modal).

### Frosted fill and blur

The fill is the `surface` token at alpha; never a tinted frost.

| Variant | Light | Dark | Blur | Use |
|---|---|---|---|---|
| Default | `rgba(252, 248, 255, 0.72)` | `rgba(19, 18, 24, 0.72)` | `blur(16px) saturate(1.4)` | Popovers, dropdowns, command palette |
| Strong | `rgba(252, 248, 255, 0.86)` | `rgba(19, 18, 24, 0.88)` | `blur(24px) saturate(1.4)` | Modals, sheets; toasts use soft blur `blur(12px) saturate(1.3)` |
| Opaque | `surface-container-highest` | `surface-container-highest` | none | Fallback when blur is unsupported or transparency reduced; tooltips always |

Every frosted surface ships the opaque fallback via `@supports not (backdrop-filter: ...)` and `@media (prefers-reduced-transparency: reduce)`, pairs frost with its elevation shadow (frost is never the only elevation cue), and carries the ghost border for edge definition:

```css
border: 1px solid color-mix(in srgb, var(--outline-variant) 15%, transparent);
```

Tooltips skip blur entirely: they appear over arbitrary content and must be unconditionally legible at small sizes.

Accessibility: text and controls inside frost clear WCAG 2.2 AA against the fill tested over worst-case content beneath; focus rings on elevated surfaces use `primary` at full opacity; status colours inside frost use opaque container fills.

### Named Rules

**The Tonal Layering Rule.** No `1px solid` borders to divide content on persistent surfaces. Boundaries are background colour shifts between surface tiers. If accessibility demands a visible boundary, use `outline-variant` at 15% opacity, never opaque.

**The Hairline Ceiling Rule.** Cards may carry at most the shadcn `shadow-sm` hairline for lift off white-on-white stacking. Anything stronger belongs to the elevation ramp and therefore to transient surfaces only.

**The Corner Rule.** `20px` radius for cards (`rounded-xl`), `16px` for elevated surfaces (`--radius`), `14px` for buttons and inputs (`rounded-md`), `12px` for chips and small elements. Never 4px or 8px.

## 5. Components

Component vocabulary is shadcn/ui themed by the token layer, in `packages/design-system/components/ui/`. Consistent affordances across every screen: same button shape, same form controls, same icon style. Every interactive component defines default, hover, focus-visible, active, disabled, and (where relevant) loading and error states.

### Buttons

Tactile but quiet: solid fills, opacity-shift hovers, a decisive 3px focus ring.

- **Shape:** softly rounded (`14px`, `rounded-md`), height `36px` (`h-9`), `text-sm font-medium`, padding `8px 16px`.
- **Primary:** Forest Sage fill (`primary`) with white text; hover at 90% opacity.
- **Secondary:** Sage Wash fill (`secondary-container`) with `on-secondary-container` text; hover at 80% opacity.
- **Destructive:** `error` fill with white text; hover at 90% opacity.
- **Outline / Ghost:** transparent with `on-surface` text; hover fills with the neutral hover surface (`surface-container-high` via shadcn `--accent`).
- **Link:** `primary` text, underline on hover.
- **Focus:** `focus-visible:ring-[3px]` in `ring` (sage) at 50% opacity. Disabled: 50% opacity, no pointer events.
- There is **no purple button variant**. Accent is signal, not action.

### Chips

- **Provenance chips** (signature pattern): `label-sm`, `12px` radius, `2px 10px` padding, no border. Xero-synced = `secondary-container` fill, `on-secondary-container` text, sage leaf icon. Manual entry = `accent-container` fill, `on-accent-container` text, pencil icon. Attached to every `AvailabilityRecord` row on calendars, lists, and profiles.
- **Badges:** pill (`rounded-full`), `text-xs font-medium`, `2px 8px` padding; variants mirror button fills. Informational badges ("New", "Beta") use `accent-container`.

### Cards / Containers

- **Corner Style:** `20px` (`rounded-xl`).
- **Background:** `card` (white in light, `#0E0D13` in dark), one tonal step above the parent surface.
- **Shadow Strategy:** hairline `shadow-sm` maximum (see The Hairline Ceiling Rule); depth otherwise comes from the tonal ramp.
- **Border:** ghost border only (`--border`, 15% `outline-variant`).
- **Internal Padding:** `24px` (`py-6 px-6`), `24px` gap between cards. No nested cards.

### Inputs / Fields

- **Style:** `border-input` hairline on transparent fill (dark mode adds `bg-input/30`), `14px` radius, height `36px`.
- **Label:** `label-md` above the field, never placeholder-as-label. Placeholder text uses `muted-foreground`.
- **Focus:** border shifts to `ring` plus `ring-[3px]` sage glow at 50% opacity.
- **Error:** `aria-invalid` drives `destructive` border and ring. Disabled: 50% opacity, no cursor.
- Inputs are persistent surfaces: no frost, no blur, no added shadow.

### Navigation

- **Sidebar** on `surface-container-low` (`--sidebar`), collapsible below `1024px`; floating variant carries `elev-toast`.
- **Items:** `title-sm` weight 500. Active state is a sage moment: `sidebar-primary` text on a 10% sage `color-mix` wash, deepening to 15% on hover. Inactive hover uses the neutral hover surface.
- **Contextual header** per view: `surface-container-low` full-bleed band with `display-sm` headline and `body-lg` summary.

### Data / Metric Highlights

Success and growth metrics use Signature Sage (`primary-container`); never bright green. Negative metrics use `error-container` with `error` text. Informational callouts use `accent-container` with `on-accent-container` text. Charts draw exclusively from the sage chart ramp.

### Auth Brand Panel (signature)

The sign-in / sign-up welcome surface is the one screen where green leads as a brand moment. A deep sage gradient panel (`linear-gradient(158deg, #14301B 0%, #21482A 46%, #336A3B 100%)` in light; near-black green in dark) with a soft radial sage glow, light ink text (`#F0F6EE`), and availability dots that preview the product's colour language (sage = in office, lavender = WFH/manual, ghost = away). Its tokens (`--auth-*` in `apps/app/app/styles.css`) are scoped to this surface and never reused on data surfaces.

### Hero CTA Gradient (marketing only)

`background: linear-gradient(135deg, var(--primary), var(--primary-container));`

### Motion

Purposeful and fast: 150–250ms, ease-out, state changes only (accordion `0.2s ease-out`, tooltip pop-in from `scale(0.95)`). No decorative or orchestrated page-load motion. Every animation has a `prefers-reduced-motion: reduce` alternative.

## 6. Do's and Don'ts

### Do:

- **Do** use `on-surface` (`#1C1A26` light / `#E6E1EC` dark) for primary text; never `#000000`.
- **Do** achieve hierarchy through the typography scale first, colour second.
- **Do** divide persistent content with tonal surface shifts; if a visible boundary is unavoidable, use `outline-variant` at 15% opacity.
- **Do** use Signature Sage (`primary-container`, `#6DA671`) for success states and growth metrics.
- **Do** pair every provenance and status colour with an icon or label; colour is never the sole differentiator.
- **Do** implement all colours as CSS custom properties scoped to `[data-theme]`; never hardcoded hex in components.
- **Do** ship the opaque fallback (`surface-container-highest`) for every frosted surface via `@supports` and `prefers-reduced-transparency`.
- **Do** use `16px`/`20px` radii for cards and elevated surfaces, `14px` for buttons and inputs, `12px` for chips.
- **Do** write Australian English in all UI copy (organise, colour, centre).

### Don't:

- **Don't** reproduce the **Notion** anti-reference: flat document aesthetic, undifferentiated text-heavy layout, absent visual hierarchy, low-contrast chrome.
- **Don't** use generic SaaS-cream palettes (warm-tinted near-white backgrounds); every neutral tints cool toward the accent hue.
- **Don't** build hero-metric card grids or numbered section scaffolding (01 / 02 / 03).
- **Don't** use bright "success green" SaaS accents; the sage palette is the only green.
- **Don't** use `1px solid` opaque borders to divide content on persistent surfaces.
- **Don't** apply `backdrop-filter` or ramp shadows to persistent surfaces (cards, list rows, table cells, calendar cells, inputs, dashboard tiles, kanban columns); the card hairline `shadow-sm` is the ceiling.
- **Don't** use accent purple for primary actions, CTAs, success states, growth metrics, warnings, charts, or broad backgrounds; sage leads, purple supports, never co-leads.
- **Don't** place `accent-container` on `primary-container` sage; the hue clash is prohibited.
- **Don't** use 4px or 8px border-radius anywhere.
- **Don't** use Lora outside the approved editorial contexts, and never in navigation, buttons, tables, forms, calendars, or charts. No Inter or Roboto.
- **Don't** use em dashes in any UI copy or generated text.
- **Don't** use drop shadows with high opacity; the elevation ramp is the ceiling.
