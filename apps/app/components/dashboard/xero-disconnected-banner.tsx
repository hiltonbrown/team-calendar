import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";

interface XeroDisconnectedBannerProps {
  connectHref: string;
  orgQueryValue: string | null;
}

export function XeroDisconnectedBanner({
  connectHref,
  orgQueryValue,
}: XeroDisconnectedBannerProps) {
  return (
    <div className="rounded-2xl bg-muted px-5 py-4 text-body-sm text-muted-foreground">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p>
          Xero is not connected. Team Calendar works without Xero, and leave
          records save locally. Connect Xero to enable leave submission for
          approval and automatic balance sync.
        </p>
        <Link
          className="font-medium text-primary"
          href={withOrg(connectHref, orgQueryValue)}
        >
          Connect Xero
        </Link>
      </div>
    </div>
  );
}
