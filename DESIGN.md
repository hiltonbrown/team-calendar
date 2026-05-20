# DESIGN.md - LeaveSync Design System

## Creative North Star

**"Clarity at a glance."**

A high-legibility operational palette where colour carries meaning: sage for Xero-synced leave, purple for manual entries, red for errors. The buyer's job is knowing who is in, who is out, and why, on sight. The interface earns trust through legibility and restraint: type-led hierarchy, tonal layering instead of borders, intentional whitespace, and asymmetrical balance. Signal leads; surface recedes.

---

## Colour Tokens

### Light Mode

| Token                        | Hex       | Usage                                                    |
|------------------------------|-----------|----------------------------------------------------------|
| `primary`                    | `#336A3B` | High-action touchpoints, CTAs, brand moments             |
| `primary-container`          | `#6DA671` | Signature sage; large surfaces, primary action blocks    |
| `on-primary`                 | `#FFFFFF` | Text/icons on `primary`                                  |
| `on-primary-container`       | `#1B3620` | Text/icons on `primary-container`                        |
| `secondary`                  | `#4B6542` | Supportive green; secondary actions                      |
| `secondary-container`        | `#CAE8BC` | Secondary button fills, chips, tags                      |
| `on-secondary-container`     | `#2A3D24` | Text/icons on `secondary-container`                      |
| `tertiary`                   | `#57624F` | Muted green; tertiary text, metadata                     |
| `accent`                     | `#5E4F99` | Editorial purple; informational icons, manual availability accents, badges |
| `accent-container`           | `#E5DFFF` | Lavender wash; informational banners, manual availability chips, "New"/"Beta" badges |
| `on-accent`                  | `#FFFFFF` | Text/icons on `accent`                                   |
| `on-accent-container`        | `#1F1551` | Text/icons on `accent-container`                         |
| `surface`                    | `#FCF8FF` | Base page background                                     |
| `surface-container-lowest`   | `#FFFFFF` | Elevated cards on darker parents                         |
| `surface-container-low`      | `#F6F1FF` | Sidebars, contextual headers, secondary panels           |
| `surface-container`          | `#F1EBFD` | Primary cards                                            |
| `surface-container-high`     | `#EBE5F7` | Hover states, elevated cards                             |
| `surface-container-highest`  | `#E5E0F1` | Active states, floating modals, input field fills        |
| `surface-variant`            | `#E0DDE6` | Tertiary button hover background                         |
| `on-surface`                 | `#1C1A26` | Primary text colour (never use `#000000`)                |
| `on-surface-variant`         | `#46454E` | Secondary/supporting text                                |
| `inverse-surface`            | `#312F3C` | Deep slate; high-contrast elements, footers, dark accent |
| `inverse-on-surface`         | `#F3EFF8` | Text on `inverse-surface`                                |
| `outline`                    | `#777680` | Disabled states, subtle iconography                      |
| `outline-variant`            | `#C1C9BD` | Ghost borders at 15% opacity only                        |
| `error`                      | `#BA1A1A` | Destructive actions, validation errors                   |
| `error-container`            | `#FFDAD6` | Error banners, inline error backgrounds                  |
| `success`                    | `#6DA671` | Use `primary-container` sage, not bright green           |

### Dark Mode

Dark mode inverts the surface and text layers while preserving the functional colour system. Greens shift to lighter, desaturated tones for comfortable contrast on dark backgrounds. The accent palette follows the same lightening pattern.

| Token                        | Hex       | Notes                                                    |
|------------------------------|-----------|----------------------------------------------------------|
| `primary`                    | `#8FD496` | Lightened sage for legibility on dark surfaces            |
| `primary-container`          | `#1F5226` | Deep green; large surface areas, primary action blocks   |
| `on-primary`                 | `#003912` | Dark text on light primary buttons (rare use)            |
| `on-primary-container`       | `#ABEDB0` | Light text/icons on `primary-container`                  |
| `secondary`                  | `#AECAA1` | Lightened secondary                                      |
| `secondary-container`        | `#374E2E` | Muted dark fill for secondary actions                    |
| `on-secondary-container`     | `#C8E6BB` | Light text on `secondary-container`                      |
| `tertiary`                   | `#B8C9AB` | Lightened muted green                                    |
| `accent`                     | `#C8BFFF` | Lightened editorial purple for legibility on dark        |
| `accent-container`           | `#46398B` | Deep purple; informational banners, manual availability chips |
| `on-accent`                  | `#2D1F6E` | Dark text on light accent buttons (rare use)             |
| `on-accent-container`        | `#E5DFFF` | Light text/icons on `accent-container`                   |
| `surface`                    | `#131218` | Base dark background                                     |
| `surface-container-lowest`   | `#0E0D13` | Deepest layer                                            |
| `surface-container-low`      | `#1C1B22` | Sidebars, contextual headers                             |
| `surface-container`          | `#211F26` | Primary cards                                            |
| `surface-container-high`     | `#2B2931` | Hover states, elevated cards                             |
| `surface-container-highest`  | `#36343C` | Active states, modals, input fills                       |
| `surface-variant`            | `#46454E` | Tertiary button hover background                         |
| `on-surface`                 | `#E6E1EC` | Primary text                                             |
| `on-surface-variant`         | `#C8C5D0` | Secondary/supporting text                                |
| `inverse-surface`            | `#E6E1EC` | Light accent blocks within dark layout                   |
| `inverse-on-surface`         | `#312F3C` | Text on `inverse-surface`                                |
| `outline`                    | `#918F9A` | Disabled states, subtle iconography                      |
| `outline-variant`            | `#46454E` | Ghost borders at 15% opacity only                        |
| `error`                      | `#FFB4AB` | Destructive actions, validation errors                   |
| `error-container`            | `#93000A` | Error banners                                            |
| `success`                    | `#8FD496` | Matches dark `primary`                                   |

### Accent (Purple)

The accent palette is a complementary slate-purple that harmonises with the sage primary and the lavender-tinted surface tokens. It carries two specific meanings and must not drift beyond them.

**Permitted roles:**

1. **Manual availability provenance.** `AvailabilityRecord` rows that originated as manual entries (WFH, travelling, training, client site, conference) use `accent-container` for chip backgrounds and `accent` for icon strokes. Xero-synced leave continues to use the sage primary palette. The colour split makes the source of truth scannable at a glance on team calendars and person profiles.
2. **Informational state.** Notice banners, "New" / "Beta" / "Updated" badges, neutral tips and callouts. Fills the gap where today there is only success (sage) or error (red).

**Default usage pattern.** Most surfaces use `accent-container` as the background and `on-accent-container` as the text colour, producing a low-saturation lavender chip that reads clearly without competing with the sage primary. Saturated `accent` is reserved for icon strokes, focus rings on accent surfaces, and small accent moments.

**Pairing.** `accent-container` (`#E5DFFF`) sits naturally on `surface-container-low` (`#F6F1FF`) or `surface-container` (`#F1EBFD`). It must not sit on `primary-container` sage, which produces an unbalanced hue clash.

**Forbidden uses:**

- Never use `accent` for primary actions, CTAs, or anywhere `primary` is the correct colour.
- Never use `accent-container` for success or growth metrics. That is sage territory.
- Never use accent as a broad background or decorative wash. It is a signal colour, not wallpaper.
- Never use accent to replace `error` for warnings or destructive states.
- Never combine accent with brand green at equal weight in a single composition. Accent is the supporting voice, never the lead.

**Contrast.** All text on `accent-container` uses `on-accent-container`. All text on `accent` uses `on-accent`. Both pairings clear WCAG 2.2 AA at body text size in light and dark mode.

### Mode Switching

Implement via CSS custom properties scoped to `[data-theme="light"]` and `[data-theme="dark"]` on the root element. Default to the user's system preference via `prefers-color-scheme`, with a manual toggle that persists to the database (not localStorage).

---

## Typography

**Font family:** Plus Jakarta Sans (Google Fonts).

| Scale         | Size     | Weight    | Letter-spacing | Line-height | Usage                              |
|---------------|----------|-----------|----------------|-------------|------------------------------------|
| `display-lg`  | 3.5rem   | Semi-Bold | -0.02em        | 1.1         | Hero statements                    |
| `display-md`  | 2.75rem  | Semi-Bold | -0.02em        | 1.15        | Page-level headlines               |
| `display-sm`  | 2.25rem  | Semi-Bold | -0.02em        | 1.2         | Contextual header headline         |
| `headline-lg` | 2rem     | Semi-Bold | 0              | 1.25        | Section headings                   |
| `headline-md` | 1.75rem  | Semi-Bold | 0              | 1.3         | Sub-section headings               |
| `title-lg`    | 1.375rem | Medium    | 0              | 1.35        | Card headers                       |
| `title-md`    | 1rem     | Medium    | 0.01em         | 1.4         | Component titles                   |
| `title-sm`    | 0.875rem | Medium    | 0.01em         | 1.4         | Small titles, nav items            |
| `body-lg`     | 1.125rem | Regular   | 0              | 1.6         | Contextual header summary, lead    |
| `body-md`     | 1rem     | Regular   | 0              | 1.6         | Default body text                  |
| `body-sm`     | 0.875rem | Regular   | 0              | 1.6         | Supporting body text               |
| `label-lg`    | 0.875rem | Medium    | 0.01em         | 1.4         | Button text (standard)             |
| `label-md`    | 0.75rem  | Medium    | 0.05em         | 1.3         | Overlines, categories, ALL-CAPS    |
| `label-sm`    | 0.6875rem| Medium    | 0.05em         | 1.3         | Fine metadata, timestamps          |

---

## Elevation and Depth

Depth on persistent surfaces is achieved through **tonal layering**, not shadows or borders. Shadows, translucency, and backdrop blur are reserved for **elevated surfaces only**: transient or floating UI rendered above the page.

### Rules

1. **No borders on persistent surfaces.** Do not use `1px solid` borders to section content. Boundaries are defined by background colour shifts between surface tiers.
2. **Tonal stacking.** A card at `surface-container` sits on a parent at `surface-container-low`. The tonal shift is the divider.
3. **Elevation shadow ramp (elevated surfaces only).** Use slate-tinted shadows at low opacity. See the ramp in the Elevated Surfaces subsection below. Never pure black in light mode.
4. **Ghost border fallback.** If accessibility demands a visible boundary, use `outline-variant` at **15% opacity**. Never 100% opaque. Frosted surfaces (see below) qualify, since translucency reduces edge definition against varying content beneath.
5. **Corner radius.** `16px` (`border-radius: 1rem`) for all primary cards, containers, and elevated surfaces. `12px` for inputs and small elements. No 4px or 8px radii.

---

## Elevated Surfaces

Elevated surfaces are transient or floating UI rendered above the page. They are the only surfaces permitted to use translucency, backdrop blur, and shadow.

**Permitted on:** modals, dialogs, mobile sheets, popovers, dropdown menus, command palette, sticky app chrome, toasts, snack bars, date pickers.

**Forbidden on:** cards, list rows, table cells, calendar cells, form inputs, dashboard tiles, kanban columns, and any persistent content surface. These continue to use tonal layering only.

The aesthetic goal is clear layering: a soft "layer above the page" cue that feels tactile and refined without becoming decoration. Frost is a structural signal, not a flourish.

### Frosted fill

Light mode:

| Variant   | Value                              | Use                                     |
|-----------|------------------------------------|-----------------------------------------|
| Default   | `rgba(252, 248, 255, 0.72)`        | Popovers, dropdowns, sticky chrome      |
| Strong    | `rgba(252, 248, 255, 0.86)`        | Modals, sheets, toasts                  |
| Opaque    | `surface-container-highest`        | Fallback when blur unsupported or reduced |

Dark mode:

| Variant   | Value                              | Use                                     |
|-----------|------------------------------------|-----------------------------------------|
| Default   | `rgba(19, 18, 24, 0.72)`           | Popovers, dropdowns, sticky chrome      |
| Strong    | `rgba(19, 18, 24, 0.88)`           | Modals, sheets, toasts                  |
| Opaque    | `surface-container-highest`        | Fallback when blur unsupported or reduced |

The fill colour is the `surface` token at varying alpha. This keeps the palette consistent and avoids tinted frosts that would clash with content beneath.

### Backdrop blur

| Step    | Value                          | Use                                      |
|---------|--------------------------------|------------------------------------------|
| Soft    | `blur(12px) saturate(1.3)`     | Sticky app chrome, toasts                |
| Default | `blur(16px) saturate(1.4)`     | Popovers, dropdowns, command palette     |
| Strong  | `blur(24px) saturate(1.4)`     | Modals, dialogs, mobile sheets           |

`saturate(1.3-1.4)` is intentionally conservative. Higher values can over-warm sage tones beneath and reduce contrast for body text.

### Elevation shadow ramp

A single soft shadow per level. Slate-tinted in light mode, black in dark mode, always at low opacity. No multi-stop dramatic shadows.

Light mode:

| Token             | Value                                                                            | Use                              |
|-------------------|----------------------------------------------------------------------------------|----------------------------------|
| `elev-sticky`     | `0 1px 0 rgba(53, 51, 64, 0.04)`                                                 | Sticky app chrome                |
| `elev-popover`    | `0 8px 24px rgba(53, 51, 64, 0.06)`                                              | Popovers, dropdowns, menus       |
| `elev-toast`      | `0 12px 32px rgba(53, 51, 64, 0.06)`                                             | Toasts, snack bars               |
| `elev-modal`      | `0 24px 48px rgba(53, 51, 64, 0.08), 0 4px 12px rgba(53, 51, 64, 0.04)`          | Modals, dialogs, mobile sheets   |

Dark mode:

| Token             | Value                                                                       | Use                              |
|-------------------|-----------------------------------------------------------------------------|----------------------------------|
| `elev-sticky`     | `0 1px 0 rgba(0, 0, 0, 0.20)`                                               | Sticky app chrome                |
| `elev-popover`    | `0 8px 24px rgba(0, 0, 0, 0.25)`                                            | Popovers, dropdowns, menus       |
| `elev-toast`      | `0 12px 32px rgba(0, 0, 0, 0.25)`                                           | Toasts, snack bars               |
| `elev-modal`      | `0 24px 48px rgba(0, 0, 0, 0.32), 0 4px 12px rgba(0, 0, 0, 0.20)`           | Modals, dialogs, mobile sheets   |

### Component to treatment mapping

| Component                       | Fill        | Blur     | Shadow         |
|---------------------------------|-------------|----------|----------------|
| Modal, dialog, mobile sheet     | Strong      | Strong   | `elev-modal`   |
| Popover, dropdown, command palette | Default | Default  | `elev-popover` |
| Toast, snack bar                | Strong      | Soft     | `elev-toast`   |
| Sticky app bar                  | Default     | Soft     | `elev-sticky`  |
| Date picker overlay             | Strong      | Default  | `elev-popover` |
| Tooltip                         | Opaque      | none     | `elev-popover` |

Tooltips intentionally skip blur. They appear over arbitrary content and must remain unconditionally legible at small sizes.

### Implementation pattern

```css
.elevated-surface {
  background-color: rgba(252, 248, 255, 0.72);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  box-shadow: 0 8px 24px rgba(53, 51, 64, 0.06);
  border-radius: 16px;
  /* Ghost border at 15% opacity for edge definition. See Rule 4. */
  border: 1px solid color-mix(in srgb, var(--outline-variant) 15%, transparent);
}

[data-theme="dark"] .elevated-surface {
  background-color: rgba(19, 18, 24, 0.72);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .elevated-surface {
    background-color: var(--surface-container-highest);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .elevated-surface {
    background-color: var(--surface-container-highest);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
```

### Accessibility rules

- Body text and interactive controls inside any frosted surface must clear WCAG 2.2 AA contrast (4.5:1 for body text, 3:1 for large text and UI controls) against the surface fill, tested with both the lightest and darkest plausible content beneath.
- Focus rings on elevated surfaces use `primary` at full opacity, never translucent.
- Status colours (success, warning, error) inside frosted surfaces use opaque container fills, not translucent variants, so their meaning is unambiguous.
- The frosted treatment must not be the only signal that something is elevated. Always pair it with the elevation shadow.
- Test every elevated surface against the `prefers-reduced-transparency: reduce` and `prefers-reduced-motion: reduce` media queries.

### Hero CTA Gradient

```css
background: linear-gradient(135deg, var(--primary), var(--primary-container));
```

---

## Layout Principles

1. **Asymmetrical balance.** Default content/sidebar split is roughly 2:1 (e.g., `grid-template-columns: 1fr 380px`). The wider column holds the primary content; the narrower column holds metadata, actions, or summary cards.
2. **Intentional whitespace.** Minimum `24px` gap between cards. Use `32px` or `48px` vertical spacing between list items instead of divider lines.
3. **Contextual header.** Full-width `surface-container-low` bleed at the top of each view. Contains a `display-sm` headline paired with a `body-lg` summary. This separates the "stage" (navigation context) from the "work area" (content).
4. **Responsive breakpoints.** `640px` (mobile), `1024px` (tablet), `1440px` (desktop). Collapse sidebar below `1024px`.

---

## Components

### Buttons

| Variant   | Background                | Text colour                | Border          | Hover                                      |
|-----------|---------------------------|----------------------------|-----------------|---------------------------------------------|
| Primary   | `primary`                 | `on-primary`               | None            | Darken 8%                                   |
| Secondary | `secondary-container`     | `on-secondary-container`   | None            | Darken 5%                                   |
| Tertiary  | Transparent               | `primary`                  | None            | `surface-variant` background                |
| Danger    | `error`                   | `#FFFFFF`                  | None            | Darken 8%                                   |

All buttons: `border-radius: 16px`, `label-md` uppercase text, `padding: 10px 24px`.

There is no accent button variant. Accent is a signal colour for chips, badges, and informational surfaces, not for action.

### Cards

No divider lines. Separation via whitespace or tonal shifts. Inner (nested) cards use one surface tier higher than their parent. `border-radius: 16px`. Cards are persistent surfaces and must not use frost, blur, or shadow.

### Input Fields

Fill: `surface-container-highest`, no border. On focus: ghost border using `primary` at 20% opacity. Label: `label-md`, positioned above the field (never as placeholder text). `border-radius: 12px`. Inputs are persistent surfaces and must not use frost, blur, or shadow.

### Data/Metric Highlights

Use `primary-container` (sage) for success and growth metrics. Do not use saturated bright green. Negative metrics use `error-container` with `error` text. **Informational** highlights and neutral metadata callouts use `accent-container` with `on-accent-container` text.

### Provenance Chips

A small badge attached to `AvailabilityRecord` rows that signals where the record came from. Two variants:

- **Synced from Xero**: `secondary-container` background, `on-secondary-container` text, sage leaf icon. Used for leave records pulled from Xero Payroll.
- **Manual entry**: `accent-container` background, `on-accent-container` text, pencil icon. Used for manually entered availability (WFH, travelling, training, client site, conference, etc.).

Chip styling: `label-sm`, `border-radius: 12px`, `padding: 2px 10px`, no border.

---

## Hard Rules

1. Never use `#000000` for text. Use `on-surface`.
2. Never use `1px solid` borders to divide content on persistent surfaces.
3. Never use drop shadows with high opacity. The elevation ramp is the ceiling.
4. Never use 4px or 8px border-radius. Use `16px` (cards, elevated surfaces) or `12px` (inputs, small elements).
5. Never use bright green for success states. Use the sage palette.
6. Always use Plus Jakarta Sans. No Inter, Roboto, or system fonts.
7. Always achieve hierarchy through typography scale first, colour second.
8. Always implement colours as CSS custom properties, not hardcoded hex values.
9. Always scope theme tokens to `[data-theme]` for light/dark switching.
10. Never use em dashes in any UI copy or generated text.
11. Never apply `backdrop-filter` or shadow to persistent surfaces (cards, list rows, table cells, calendar cells, form inputs, dashboard tiles, kanban columns). Frosted treatment is reserved for elevated transient UI only.
12. Always provide an opaque fallback for frosted surfaces via `@supports not (backdrop-filter)` and `@media (prefers-reduced-transparency: reduce)`.
13. Never use `accent` purple for primary actions, success states, growth metrics, or as broad background. Reserved for manual availability provenance and informational state only. Sage leads, accent supports, never co-leads.