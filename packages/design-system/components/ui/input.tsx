import * as React from "react"

import { cn } from "@repo/design-system/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-outline h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base transition-[color,box-shadow] outline-hidden file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-container-highest disabled:text-muted-foreground md:pointer-fine:text-sm",
        "focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2",
        "aria-invalid:border-destructive aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)] aria-invalid:focus-visible:outline-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
