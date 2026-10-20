"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Shared company selection for account-wide calendar, dashboard and people views. */
export function CompanyFilter({
  companies,
  companyIds,
}: {
  companies: readonly { id: string; name: string }[];
  companyIds?: readonly string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  if (companies.length < 2) {
    return null;
  }
  return (
    <Select
      onValueChange={(value) => {
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        for (const key of ["org", "companyIds", "scopeType", "scopeValue"]) {
          params.delete(key);
        }
        if (value !== "all") {
          params.set("companyIds", value);
        }
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
      value={companyIds?.length === 1 ? companyIds[0] : "all"}
    >
      <SelectTrigger aria-label="Company" className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All companies</SelectItem>
        {companies.map((company) => (
          <SelectItem key={company.id} value={company.id}>
            {company.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
