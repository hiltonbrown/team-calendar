import type { AccountId, OrganisationId } from "@repo/core";

/**
 * Creates a scoped query filter that ensures all database queries
 * are filtered by both accountId and organisationId.
 *
 * Usage:
 *   where: { ...scopedQuery(accountId, organisationId), status: "active" }
 */
export const scopedQuery = (
  accountId: AccountId,
  organisationId: OrganisationId
) => ({
  account_id: accountId,
  organisation_id: organisationId,
});

/**
 * Type helper for spreading scoped query results into where clauses.
 */
export type ScopedQueryResult = ReturnType<typeof scopedQuery>;

/**
 * Object-argument form of scopedQuery, for the common case where the caller
 * already holds a context object with accountId and organisationId.
 *
 * Parameters are plain strings by design. Every caller in this repository holds
 * plain strings at this point and would otherwise have to cast to the branded
 * AccountId and OrganisationId types, which provides no safety and violates
 * the repo's no-unjustified-cast rule. Use scopedQuery where branded values are
 * genuinely in hand.
 *
 * Usage:
 *   where: { ...scopedTo(input), id: recordId }
 */
export const scopedTo = (input: {
  accountId: string;
  organisationId: string;
}) => ({
  account_id: input.accountId,
  organisation_id: input.organisationId,
});
