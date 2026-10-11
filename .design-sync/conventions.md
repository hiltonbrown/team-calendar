# Team Calendar design system: how to build with it

Team Calendar is a leave and availability product (Australian Xero Payroll). UI is shadcn/ui (Radix) styled with Tailwind v4 utility classes over Team Calendar tokens. Copy is Australian English, direct and plain; never use em dashes.

## Setup

- Every component and subpart is on `window.TeamCalendar` (e.g. `Card`, `CardHeader`, `DialogContent`). Each root component's `.prompt.md` lists its subparts under "## Parts".
- No provider is required for light mode. Components accept all native element props (`onClick`, `disabled`, `type`, `href` via `asChild`) on top of their `.d.ts` props.
- Dark mode: put `className="dark"` on a wrapper (or use `ThemeProvider` with `defaultTheme="dark"`); every token switches.
- `Sidebar` must sit inside `SidebarProvider`. `Tooltip` provides itself. Mount `Toaster` once and call `toast.success("...")` (both on the global).
- Icons: lucide-react icons are on the global. Use the `*Icon` names (`CalendarIcon`, `PlusIcon`, `CheckIcon`) because `Calendar`, `Badge`, `Sheet`, `Command`, `Form` and `Sidebar` are components.
- Charts: recharts primitives (`BarChart`, `Bar`, `AreaChart`, `Area`, `XAxis`, `CartesianGrid`) are on the global. Wrap them in `ChartContainer` with a config using `var(--chart-1)` to `var(--chart-5)` and give it a height (`h-64`). Use `ChartTooltip`/`ChartTooltipContent` and `ChartLegend`/`ChartLegendContent`, not recharts' `Tooltip`/`Legend`.

## Styling: Tailwind utilities on Team Calendar tokens

Classes are precompiled (no runtime Tailwind). Use the default spacing scale (`p-4`, `gap-6`, `w-64`, `max-w-3xl`), flex/grid utilities (`grid-cols-3`, `md:grid-cols-2`, `items-center`, `justify-between`), and these token classes. Avoid arbitrary values like `w-[437px]`; use the scale or an inline `style`.

| Family | Classes |
|---|---|
| Surfaces | `bg-background`, `bg-card`, `bg-surface-container-lowest`, `-low`, `bg-surface-container`, `-high`, `-highest`, `bg-muted`, `bg-accent` |
| Text | `text-foreground`, `text-on-surface`, `text-on-surface-variant`, `text-muted-foreground` |
| Brand | `bg-primary text-primary-foreground` (primary actions only), `bg-primary-container text-on-primary-container`, `bg-secondary text-secondary-foreground`, `text-editorial-accent`, `bg-accent-container` |
| Status | `bg-destructive`, `bg-error-container text-on-error-container`, `bg-warning-container text-on-warning-container`, `text-warning`, `text-success` |
| Lines | `border-outline`, `border-outline-variant`, `border-border` |
| Type scale | `text-display-lg/md/sm`, `text-headline-lg/md`, `text-title-lg/md/sm`, `text-body-lg/md/sm`, `text-label-lg/md/sm`; weights `font-medium`, `font-semibold` |
| Radius | `rounded-xl` (cards, 20px), `rounded-lg` (dialogs/popovers), `rounded-md` (buttons/inputs), `rounded-sm` (chips) |
| Elevation | `shadow-(--elev-card)` (default Card already has it), `elevation-popover`, `elevation-modal`, `elevation-tooltip` |

Design rules: separate content with tonal surface shifts (a `bg-surface-container` band, a `Card` on `bg-background`), not borders. No pure black text, no drop shadows except the card hairline and floating elements. Forest green (`primary`) marks primary actions and brand moments, not decoration. Font is Plus Jakarta Sans (already applied to `html`).

## Where the truth lives

- `styles.css` imports `_ds_bundle.css`: the compiled stylesheet with every token (`:root` and `.dark`) and class. Read it before inventing a class.
- `guidelines/DESIGN.md`: the full colour, type, spacing and component rules.
- `components/<group>/<Name>/<Name>.prompt.md` and `<Name>.d.ts`: usage, subparts and props per component.

## Example

```tsx
const { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, Badge, Button, PlusIcon } = window.TeamCalendar;

<div className="bg-background min-h-screen p-8">
  <div className="mx-auto flex max-w-3xl flex-col gap-6">
    <div className="flex items-center justify-between">
      <h1 className="text-headline-md font-semibold text-on-surface">Leave requests</h1>
      <Button><PlusIcon /> New request</Button>
    </div>
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Priya Shah</CardTitle>
          <CardDescription>Annual leave, 14 to 18 Oct</CardDescription>
        </div>
        <CardAction><Badge variant="secondary">Approved</Badge></CardAction>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button variant="outline" size="sm">View</Button>
        <Button variant="ghost" size="sm">Withdraw</Button>
      </CardContent>
    </Card>
  </div>
</div>
```
