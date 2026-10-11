import { scopedTo } from "@repo/database";

// Feed queries are always scoped to a single feed within a tenant. The id field
// makes this specific to the feeds table, which is why it lives here rather
// than in @repo/database.
export function scopedFeed(input: {
  clerkOrgId: string;
  feedId: string;
  organisationId: string | null;
}) {
  const scope =
    input.organisationId === null
      ? { clerk_org_id: input.clerkOrgId }
      : scopedTo({ ...input, organisationId: input.organisationId });
  return {
    clerk_org_id: scope.clerk_org_id,
    id: input.feedId,
    ...(input.organisationId === null
      ? { organisation_id: null }
      : {
          OR: [
            { organisation_id: input.organisationId },
            { organisation_id: null },
          ],
        }),
  };
}
