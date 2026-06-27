import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import Link from "next/link";
import type { ReactNode } from "react";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { withOrg } from "@/lib/navigation/org-url";
import { DashboardRetryButton } from "./dashboard-retry-button";

interface DashboardCardShellProps {
  children: ReactNode;
  ctaHref?: string;
  ctaLabel?: string;
  description?: string;
  footer?: ReactNode;
  orgQueryValue: string | null;
  title: string;
}

export function DashboardCardShell({
  title,
  description,
  ctaHref,
  ctaLabel,
  children,
  footer,
  orgQueryValue,
}: DashboardCardShellProps) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        {ctaHref && ctaLabel ? (
          <CardAction>
            <Button asChild size="sm" variant="ghost">
              <Link href={withOrg(ctaHref, orgQueryValue)}>{ctaLabel}</Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  );
}

interface DashboardCardErrorProps {
  entityName: string;
}

export function DashboardCardError({ entityName }: DashboardCardErrorProps) {
  return (
    <FetchErrorState
      entityName={entityName}
      retrySlot={<DashboardRetryButton />}
    />
  );
}
