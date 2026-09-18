import { z } from "zod";
import { withOrg } from "@/lib/navigation/org-url";

type QueryValue = string | string[] | undefined;

const OrganisationIdSchema = z.uuid();

export function buildLegacySetupRedirect(
  searchParams: Record<string, QueryValue>
): string {
  const { org, ...forwardedParams } = searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(forwardedParams)) {
    if (value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      query.append(key, item);
    }
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return withOrg(
    `/settings/getting-started${suffix}`,
    firstValidOrganisationId(org)
  );
}

function firstValidOrganisationId(value: QueryValue): string | null {
  if (value === undefined) {
    return null;
  }
  for (const candidate of Array.isArray(value) ? value : [value]) {
    const parsed = OrganisationIdSchema.safeParse(candidate.trim());
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}
