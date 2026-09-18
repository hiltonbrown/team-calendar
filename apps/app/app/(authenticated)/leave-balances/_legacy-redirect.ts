import { z } from "zod";
import { withOrg } from "@/lib/navigation/org-url";

type QueryValue = string | string[] | undefined;

const IdentifierSchema = z.uuid();

export function buildLegacyLeaveBalancesRedirect(
  searchParams: Record<string, QueryValue>
): string {
  const { org, personId, ...forwardedParams } = searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(forwardedParams)) {
    if (value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      query.append(key, item);
    }
  }

  const validPersonId = firstValidIdentifier(personId);
  if (validPersonId) {
    query.set("tab", "balances");
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const pathname = validPersonId ? `/people/${validPersonId}` : "/people";
  return withOrg(`${pathname}${suffix}`, firstValidIdentifier(org));
}

function firstValidIdentifier(value: QueryValue): string | null {
  if (value === undefined) {
    return null;
  }
  for (const candidate of Array.isArray(value) ? value : [value]) {
    const parsed = IdentifierSchema.safeParse(candidate.trim());
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}
