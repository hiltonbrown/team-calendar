"use client";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const COMPANY_SCOPED_PAGES = new Set([
  "/",
  "/people",
  "/people/new",
  "/plans",
  "/plans/new",
  "/leave-approvals",
  "/public-holidays",
  "/public-holidays/holidays/new",
  "/notifications",
  "/sync",
  "/settings/general",
  "/settings/holidays",
  "/settings/leave-approval",
  "/settings/getting-started",
  "/settings/integrations/xero/matches",
  "/analytics/leave-reports",
  "/analytics/out-of-office",
]);
export function CompanySelector({
  companies,
  organisationId,
}: {
  companies: Array<{ id: string; name: string }>;
  organisationId?: string | null;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  if (companies.length < 2 || !COMPANY_SCOPED_PAGES.has(pathname)) {
    return null;
  }
  const requested = params.get("org") ?? organisationId;
  const selected =
    companies.find((company) => company.id === requested)?.id ??
    companies[0]?.id;
  return (
    <div className="flex items-center gap-2">
      <Label
        className="text-label-md text-muted-foreground"
        htmlFor="company-selector"
      >
        Company
      </Label>
      <Select
        onValueChange={(id) => {
          if (!companies.some((company) => company.id === id)) {
            return;
          }
          const query = new URLSearchParams(params.toString());
          query.set("org", id);
          router.push(`${pathname}?${query.toString()}`);
        }}
        value={selected}
      >
        <SelectTrigger className="h-9 w-44" id="company-selector">
          <SelectValue placeholder="Select company" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
