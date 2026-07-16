import { Spinner } from "@repo/design-system/components/ui/spinner";

export const Default = () => (
  <div className="text-primary">
    <Spinner className="size-6" />
  </div>
);

export const InlineWithLabel = () => (
  <div className="flex items-center gap-2 text-muted-foreground text-sm">
    <Spinner className="size-4 text-primary" />
    Syncing with Xero&hellip;
  </div>
);
