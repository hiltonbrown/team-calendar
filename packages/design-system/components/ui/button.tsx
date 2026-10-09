import * as React from "react"
import { Slot as SlotPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@repo/design-system/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all pointer-coarse:min-h-11 pointer-coarse:min-w-11 disabled:pointer-events-none not-aria-busy:disabled:border-transparent not-aria-busy:disabled:bg-surface-container-highest not-aria-busy:disabled:text-muted-foreground aria-busy:pointer-events-none aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-hidden focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--primary)_90%,var(--on-surface))]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[color-mix(in_srgb,var(--destructive)_90%,var(--on-surface))] focus-visible:outline-destructive",
        outline:
          "border border-outline bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary)_90%,var(--background))]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline underline-offset-4 hover:decoration-2",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
