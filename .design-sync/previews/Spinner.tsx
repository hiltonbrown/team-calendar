import { Badge, Button, Spinner } from "@repo/design-system";

export const Sizes = () => (
  <div className="flex items-center gap-4">
    <Spinner />
    <Spinner className="size-6" />
    <Spinner className="size-8 text-primary" />
  </div>
);

export const InButton = () => (
  <div className="flex items-center gap-3">
    <Button disabled>
      <Spinner />
      Approving
    </Button>
    <Button disabled variant="outline">
      <Spinner />
      Syncing with Xero
    </Button>
  </div>
);

export const InlineStatus = () => (
  <div className="flex items-center gap-3">
    <Badge variant="secondary">
      <Spinner className="size-3" />
      Sync running
    </Badge>
    <span className="text-muted-foreground flex items-center gap-2 text-sm">
      <Spinner />
      Loading leave balances
    </span>
  </div>
);
