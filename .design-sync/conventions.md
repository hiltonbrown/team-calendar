## Using the Team Calendar design system

This is a shadcn/ui-based component library for **Team Calendar**, a leave-management SaaS synced with Xero Payroll. It ships as real, runnable React components — build every screen from these, not generic HTML.

### Wrapping and setup

No root provider is required for these components to render correctly. Light theme is the CSS default (`:root`), so no `ThemeProvider` wrapper is needed. The one component that needs its own context — `Sidebar`/`SidebarProvider` — must be composed locally: wrap any `Sidebar`, `SidebarHeader`, `SidebarGroup`, etc. in `<SidebarProvider>` at the point of use, inside a container with an explicit height (the sidebar fills its parent's height via flex). `Tooltip` wraps its own internal provider — no setup needed. `Form` is `react-hook-form`'s `FormProvider`; call `useForm()` and pass its return value as props to `<Form {...form}>`.

### Styling idiom: Tailwind utility classes over CSS custom properties

Never write raw hex colours or inline styles for brand colour/spacing/radius/type — always use the mapped Tailwind utility classes below. The palette is a sage-green, botanical light/dark theme (`--primary: #336a3b`).

**Color family** (each has a working `bg-*` / `text-*` / `border-*` Tailwind utility):
`background`, `foreground`, `card` / `card-foreground`, `popover` / `popover-foreground`, `primary` / `primary-foreground`, `secondary` / `secondary-foreground`, `muted` / `muted-foreground`, `accent` / `accent-foreground`, `destructive` (background only — pair with `text-white` for destructive button/badge text, matching the real `button.tsx` destructive variant), `border`, `input`, `sidebar` / `sidebar-foreground` / `sidebar-border`.

Example: `className="bg-primary text-primary-foreground"`, `className="border-border bg-card"`, `className="text-muted-foreground"`.

**Radius**: `rounded-sm` / `rounded-md` / `rounded-lg` / `rounded-xl` map to the theme's `--radius` scale (base radius is a soft `1rem` — this system reads rounded, not sharp).

**Typography**: use Tailwind's default scale — `text-xs` / `text-sm` / `text-base` / `text-lg` — with `font-normal` / `font-medium` / `font-semibold` for weight. `font-sans` (Plus Jakarta Sans, the only body/heading family — Lora is a rare editorial serif accent, not for UI chrome) is the default; you don't need to set it explicitly. Note: `globals.css` also defines a Material-influenced scale (`--text-display-lg`, `--text-headline-md`, `--text-title-sm`, `--text-body-md`, `--text-label-sm`, etc.) but this synced bundle only compiles the utility classes actually referenced by the design system's own component source, and none of the base components use that scale directly — those tokens are available as CSS custom properties (e.g. `style={{ fontSize: "var(--text-headline-md)" }}` or Tailwind arbitrary-value syntax `text-[length:var(--text-headline-md)]`) but not as ready-made class names in this bundle.

**Status colour convention** (seen across badges/tables in real usage): approved/success states use `bg-secondary text-secondary-foreground` (soft sage), declined/error/failed states use `bg-destructive text-white`, pending/neutral states are plain muted text with no background pill.

### Where the truth lives

Read `styles.css` (the root stylesheet, transitively imports the full token set + component CSS) before styling anything non-obvious — it's the actual compiled Tailwind output, not a summary. Each component's `<Name>.d.ts` is the authoritative prop contract; read it before assuming a prop exists. `<Name>.prompt.md` alongside it has real usage guidance per component.

### One idiomatic build snippet

```tsx
import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from "@repo/design-system/components/ui/card";

<Card className="w-96">
  <CardHeader>
    <CardTitle>Annual leave</CardTitle>
    <CardDescription>12 Jan 2026 – 16 Jan 2026 · 5 days</CardDescription>
    <CardAction>
      <Button size="sm" variant="outline">Edit</Button>
    </CardAction>
  </CardHeader>
  <CardContent>
    <p className="text-muted-foreground text-body-sm">
      Requested by Priya Nair. Awaiting approval from your manager.
    </p>
  </CardContent>
  <CardFooter className="gap-2">
    <Button size="sm">Approve</Button>
    <Button size="sm" variant="outline">Decline</Button>
  </CardFooter>
</Card>
```
