# design-sync notes for Team Calendar

## Package shape, no build step

`packages/design-system` ships no `dist/`, no `main`/`module`/`exports`, and
no build script (`typecheck` only runs `tsc --noEmit`). Apps import each
component's `.tsx` source directly, e.g. `@repo/design-system/components/ui/button`.
Confirmed with the user (2026-07-07): synth-from-source mode is intentional,
not a workaround.

`--node-modules` points at `apps/app/node_modules`, not the design-system
package's own `node_modules` or the repo root: `apps/app/node_modules/@repo/design-system`
is a real workspace symlink to `packages/design-system`, and `apps/app/node_modules`
also has `react`/`react-dom` resolvable. The repo root has no `node_modules/@repo/design-system`
entry at all (bun doesn't create one), and the package's own `node_modules`
has `react` but not a self-reference to `@repo/design-system`.

`cfg.tsconfig` points at `.design-sync/tsconfig.json` (a design-sync-owned
file, not the package's own `tsconfig.json`) for the `@repo/design-system/*`
and `@repo/*` path aliases used throughout `components/ui/*.tsx` (e.g.
`@repo/design-system/lib/utils`) to resolve — see "Sentry import blocks
browser bundling" below for why a dedicated tsconfig was needed instead of
reusing the package's own. `cfg.tsconfig`/`cfg.extraFonts` are resolved
relative to `PKG_DIR` (`apps/app/node_modules/@repo/design-system`, a
symlink into `packages/design-system` — lexical string resolution, not
realpath'd), which is 5 path segments below the repo root, hence both fields
use `"../../../../../.design-sync/..."` (5 levels of `../`) to reach
`.design-sync/`.

**`cfg.readmeHeader` is the exception — it resolves relative to the repo
root directly** ("the config home", per its field docs), not `PKG_DIR`. A
first attempt reused the `../../../../../` prefix by analogy with
tsconfig/extraFonts and silently failed
(`! readmeHeader: ... not found at the config home — skipped`, easy to miss
in a long build log). Correct value: `".design-sync/conventions.md"` — no
leading `../` at all.

## Tailwind v4 CSS needed compiling, not just copying

`styles/globals.css` is Tailwind v4 source (`@import "tailwindcss"`, `@plugin`,
`@source "../**/*.{ts,tsx}"`) — not usable as-is in a browser. Compiled it
with `postcss` + `@tailwindcss/postcss` (both already devDependencies of the
design-system package) into `packages/design-system/styles/compiled.css`,
scanning the package's own source tree for utility classes. `cfg.cssEntry`
points at the compiled file. **Re-sync risk**: `compiled.css` is
machine-generated and gitignored-adjacent (not part of the converter's own
output) — re-run the compile step before every build if `globals.css`
changes:

```bash
cd packages/design-system
node -e '
import("postcss").then(async ({default:postcss}) => {
  const tailwindcss = (await import("@tailwindcss/postcss")).default;
  const fs = await import("node:fs");
  const css = fs.readFileSync("styles/globals.css","utf8");
  const result = await postcss([tailwindcss()]).process(css, {from:"styles/globals.css", to:"styles/compiled.css"});
  fs.writeFileSync("styles/compiled.css", result.css);
});'
```

(Written as a temp `.mjs` file and run with plain `node` in this session,
since it must execute from inside `packages/design-system` for its
`node_modules` to resolve `postcss`/`@tailwindcss/postcss` and for the
`@source` glob to scan the right tree.)

Light theme is the CSS default (`:root`), so no `ThemeProvider`/`next-themes`
wrapper is needed for previews to render correctly in light mode.

## Fonts are Google Fonts loaded via next/font, not shipped as files

`lib/fonts.ts` loads Plus Jakarta Sans and Lora via `next/font/google`, which
self-hosts at Next.js build time — no static font files exist anywhere in the
repo for design-sync to copy. Fetched substitute woff2 files directly from
`fonts.gstatic.com` (latin subset, weights 400-700, Lora normal+italic) and
wrote `.design-sync/fonts/design-system-fonts.css` + the three `.woff2`
files, wired via `cfg.extraFonts`. This is a **substitute**, not the exact
files Next.js would generate (those are subset/hashed per build) — visually
equivalent for the families and weights actually used. User has not been
asked to confirm this substitution explicitly beyond the general "fonts
fetched as substitute" note in the scope-approval question; flag again if
brand fidelity on fonts becomes a concern.

**Follow-up bug found at the final validate gate**: shipping the `@font-face`
rules alone wasn't enough — the compiled `globals.css` references
`var(--font-plus-jakarta-sans)` (for `--default-font-family`) but never
*defines* that custom property; in the real app it's set by `next/font`'s
`variable` option via a className on `<html>`, which this bundle has no
equivalent of. Without it, every preview was silently falling back to the
generic sans-serif stack — never actually rendering Plus Jakarta Sans,
despite the font files being present and correctly `@font-face`-declared.
`package-validate.mjs` flagged this as `[TOKENS_MISSING]`.

**The fix belongs in `cfg.cssEntry` (`packages/design-system/styles/compiled.css`),
not `cfg.extraFonts`.** `extractFonts` (`.ds-sync/lib/css.mjs`) regex-matches
only `@font-face {...}` blocks from the `extraFonts` source file and
discards everything else — a `:root { --font-plus-jakarta-sans: ...; }`
block added to `.design-sync/fonts/design-system-fonts.css` is silently
dropped, never reaches the bundle. `cfg.cssEntry`, by contrast, is copied
verbatim. Appended the `:root` variable definitions
(`--font-plus-jakarta-sans`, `--font-lora`) directly to the bottom of
`compiled.css` after the Tailwind compile step. **Re-sync risk**: since
`compiled.css` is regenerated from scratch by the Tailwind compile command
each time (see above), this appended block must be re-added after every
recompile — it does not survive a fresh `postcss`/`@tailwindcss/postcss`
run. Fold it into the compile step itself on the next re-sync (e.g. a
second `fs.appendFileSync` call right after the `postcss` write) rather
than a manual step.

## No provider needed

`DesignSystemProvider` (the package's `index.tsx`) wraps `ThemeProvider` +
`TooltipProvider` + `Toaster`, optionally `AuthProvider` (Clerk — needs real
Clerk env/keys, not viable for previews). Not set as `cfg.provider`:
- `Tooltip` already wraps itself in its own internal `TooltipProvider`
  (components/ui/tooltip.tsx) — no global provider needed.
- `Sidebar`/`Form` read from `React.createContext` (`SidebarProvider`,
  react-hook-form's `FormProvider`) but are composed within their own preview
  per component, per the skill's "compose context-required pieces inside
  their parent" rule — not global.
- Light theme is CSS-default (see above), so `ThemeProvider` isn't required
  for correct rendering either.

## No docs directory

No `docs/`/`documentation/` under the package, no `.mdx` files. Previews for
all 53 components are authored from real composition examples across
`apps/app` and `apps/web` (grep for `@repo/design-system/components/ui/<name>`
to find real usage) plus the component source + `.d.ts`, per the skill's
curate-before-invent order.

## Sentry import blocks browser bundling

`lib/utils.ts` exports both `cn()` (used by every single component) and
`handleError()`/`parseError` in the same file, and `parseError` is imported
from `@repo/observability/error`, which does `import * as Sentry from
"@sentry/nextjs"`. That bare import's client entry re-exports
`client/routing/pagesRouterRoutingInstrumentation.js`, which imports the
legacy `next/router` — Next.js's Pages Router client module, which pulls in
`next/dist/shared/lib/router/router.js` → `bloom-filter.js` → `gzip-size` →
Node builtins (`fs`, `stream`, `zlib`). Plain esbuild with `platform:
'browser'` (what design-sync's `bundle.mjs` uses, and cannot be forked per
its own Troubleshooting section) can't resolve those, so bundling ANY
component that imports `lib/utils.ts` — i.e. all of them — failed outright.

Fixed via the sanctioned `cfg.tsconfig` path-alias mechanism (never touched
the real repo's source): `.design-sync/tsconfig.json` adds an exact-match
`paths` entry redirecting the specifier `@repo/observability/error` to
`.design-sync/stubs/observability-error.ts`, a trivial local stub exporting
a Sentry-free `parseError`. This tsconfig also carries the `@repo/design-system/*`
and `@repo/*` aliases (replacing a plan to reuse the package's own
`tsconfig.json`, which doesn't need this override and lives inside the
package). The exact-match rule must be listed BEFORE the `@repo/*` wildcard
in the `paths` object — `tsconfigPathsPlugin` checks rules in insertion
order and returns on first resolved match, so a wildcard listed first would
shadow the override.

**Re-sync risk**: if `lib/utils.ts` changes what it imports from
`@repo/observability`, or a new shared util file introduces a similar
Node-only transitive dependency, this stub won't cover it — re-check for
`[UNRESOLVED_IMPORT]`/esbuild `Could not resolve` failures on rebuild.

## Preview scope

User confirmed (2026-07-07) authoring scope is the 53 top-level widgets
(Button, Card, Dialog, Accordion, etc.), each preview composing its
sub-parts naturally (e.g. the Card story includes CardHeader/CardTitle/
CardContent/CardFooter together) — not the full 277 individual exports the
converter discovers (every compound sub-part like CardHeader, AlertDialogAction,
BreadcrumbItem is its own PascalCase export and therefore its own "component"
in design-sync's model).

**Important nuance discovered during the render check**: an unauthored
component only gets the honest "not yet authored" typographic floor card
(`fallbackCard: true`, exempt from the `bad` gate) when its default
crash-prevention render comes up **literally empty** (`rootEmpty`). Many
structural sub-parts (`CardHeader`, `SidebarFooter`, `TableCell`,
`BreadcrumbItem`, etc.) mount a real but visually-blank box with default
props — non-empty, so `fallbackCard` stays `false` and the render check's
<5KB-PNG heuristic flags them `bad`, which DOES block the upload gate. So in
practice ~40 additional sub-parts beyond the 53 top-level needed at least a
minimal one-cell `Default` preview (composed inside a realistic parent) to
clear the gate — not the full 2-6-cell rich treatment, just enough to not be
blank. Total authored: **93 of 277** components. The remaining ~184
sub-parts genuinely do render `rootEmpty` and ship as honest floor cards,
authorable incrementally on any later re-sync.

## Capture-pipeline gotchas found while authoring previews

- **Low-opacity token backgrounds (`bg-primary/10` etc.) read as blank in
  the graded screenshot.** A placeholder box using an opacity-suffixed
  utility class can be correctly sized and painted in a real browser at
  full brightness but still fail the render check's blank heuristic against
  the capture harness's white background. Prefer a solid token pairing
  (e.g. `bg-primary text-primary-foreground`) for anything that needs to
  visibly register in a screenshot.
- **Sonner toasts (`Toaster`/`sonner.tsx`) need `duration:
  Number.POSITIVE_INFINITY`** on the imperative `toast(...)` call, plus
  `position="top-center"` and `richColors` on `<Toaster />`. The library's
  default 4s duration expires during Playwright's `networkidle`/settle wait,
  so the toast is gone before the screenshot fires and the cell looks like a
  collapsed empty sliver. Same root cause likely applies to any other
  transient/auto-dismissing UI (timed tooltips, auto-advancing carousels)
  captured by this pipeline.
- **Recharts `<Line>`/`<Bar>` need `isAnimationActive={false}`.** Recharts
  animates chart entry by default; a screenshot taken mid-animation shows a
  partially-drawn line (a broken path with only some points connected,
  isolated dots) or under-height bars. Set `isAnimationActive={false}` on
  every recharts primitive used in a preview.
- **Overlay components (Dialog/AlertDialog/Sheet/Drawer/Popover/HoverCard/
  Tooltip) do NOT need a `cardMode`/`viewport` config override**, despite
  being portal-rendered with `position: fixed`. Grading always screenshots
  via `<Name>.html?story=<Export>`, which mounts the single story inside a
  `.ds-single` div with `transform: translateZ(0)` — that transform becomes
  the CSS containing block for `position: fixed` descendants, so the overlay
  renders anchored within the div rather than escaping to the real viewport.
  `cardMode` only affects the untested default multi-export grid render. The
  only thing that actually matters for these components is getting them
  into an **open** state without simulated interaction: pass `defaultOpen`
  (`openDelay={0}` too for HoverCard) on the Radix/vaul Root component.
  ContextMenu is the exception — it has no `defaultOpen`-equivalent prop
  since it's purely right-click-triggered; render it with the trigger area
  and content composed to at least show the intended structure, or accept a
  `needs-work` grade with a clear note if it can't be forced open.

## Re-sync risks

- `styles/compiled.css` must be regenerated before every rebuild if
  `styles/globals.css` changes — it's not tracked by the converter's own
  staleness checks.
- Font substitution (see above) should be re-verified if `lib/fonts.ts`
  changes which families/weights are loaded.
- No provider wiring exists globally; if a future component needs app-level
  context (e.g. a new package export that reads Clerk auth state), it likely
  can't render in this shape and should get a floor card + NOTES.md entry
  rather than a forced `cfg.provider`.
