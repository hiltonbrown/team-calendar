import {
  type XeroConnectionDisplayState,
  xeroRecoveryMessage,
} from "@repo/core";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";

interface XeroDisconnectedBannerProps {
  connectHref: string;
  orgQueryValue: string | null;
  xeroConnectionState?: XeroConnectionDisplayState;
}
export function XeroDisconnectedBanner({
  connectHref,
  orgQueryValue,
  xeroConnectionState = "not_connected",
}: XeroDisconnectedBannerProps) {
  return (
    <div className="rounded-2xl bg-muted px-5 py-4 text-body-sm text-muted-foreground">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p>
          {xeroConnectionState === "not_connected"
            ? "Xero is not connected. Team Calendar works without Xero, and leave records save locally. Connect Xero to enable leave submission for approval and automatic balance sync."
            : xeroRecoveryMessage(xeroConnectionState)}
        </p>
        {xeroConnectionState === "not_connected" ||
        xeroConnectionState === "reauthorisation_required" ? (
          <Link
            className="font-medium text-primary"
            href={withOrg(connectHref, orgQueryValue)}
          >
            {xeroConnectionState === "reauthorisation_required"
              ? "Renew Xero access"
              : "Connect Xero"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
