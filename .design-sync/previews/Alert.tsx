import { Alert, AlertDescription, AlertTitle } from "@repo/design-system";
import { CircleAlert, Info, RefreshCw } from "lucide-react";

export const Default = () => (
  <Alert className="w-[420px]">
    <Info />
    <AlertTitle>Leave balances update nightly</AlertTitle>
    <AlertDescription>
      Balances are read from Xero Payroll and may not include requests approved today.
    </AlertDescription>
  </Alert>
);

export const Destructive = () => (
  <Alert className="w-[420px]" variant="destructive">
    <CircleAlert />
    <AlertTitle>Xero connection needs attention</AlertTitle>
    <AlertDescription>
      Access to Acme Restaurants Pty Ltd has expired. Reconnect Xero to resume syncing.
    </AlertDescription>
  </Alert>
);

export const RecoveryNotice = () => (
  <Alert className="bg-surface-container w-[420px] rounded-[20px] border-0" role="status">
    <RefreshCw />
    <AlertDescription>
      Xero is limiting requests. Sync will retry automatically in about 2 minutes.
    </AlertDescription>
  </Alert>
);
