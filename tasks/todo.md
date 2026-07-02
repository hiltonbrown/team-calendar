# Design System Consistency Review

## Plan
- [x] Review `DESIGN.md` rules for tokens, typography, elevation, components, and hard constraints.
- [x] Inspect `packages/design-system` styles, font setup, component classes, and package conventions.
- [x] Compare implementation against the documented design system and prioritise findings.
- [x] Run relevant checks where useful for review confidence.
- [x] Document review outcome.

## Review
- Finding 1: theme provider defaults conflict with `DESIGN.md` mode-switching contract. It uses `next-themes` with `attribute="class"`, `defaultTheme="light"`, and `enableSystem={false}` instead of `[data-theme]`, system preference, and database-backed persistence.
- Finding 2: elevated surfaces still use opaque shadcn defaults rather than the documented frosted elevated treatment, including missing backdrop blur, reduced-transparency fallback, specific elevation shadows, and 16px radius.
- Finding 3: many primitives still use 4px-ish radii (`rounded-sm`, `rounded-xs`, `rounded-[4px]`) despite the hard rule that small elements use 12px and 4px/8px radii are forbidden.
- Finding 4: several primitives hardcode white or black utility colours (`text-white`, `bg-white`, `bg-black/50`) where `DESIGN.md` says colours should be custom-property tokens.
- Finding 5: persistent/data surfaces still use borders and shadows in ways that conflict with the hard rules, especially cards, table rows, inputs, and form-like controls.
- Verification passed: `bun run check` and `git diff --check`.
