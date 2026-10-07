interface CleanupDatabase {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => Promise<T>;
}
export interface XeroFixtureOwnership {
  clerkOrgIds: string[];
  globalKeys: string[];
  organisationIds: string[];
}
export function xeroFixtureInfrastructureKeys(owned: XeroFixtureOwnership) {
  const keys = (kind: string) =>
    owned.globalKeys
      .filter((key) => key.startsWith(`${kind}:`))
      .map((key) => key.slice(kind.length + 1));
  return {
    authorisationIds: keys("authorisation"),
    providerApps: keys("provider_app"),
  };
}
async function assertCanonicalSchema(database: CleanupDatabase): Promise<void> {
  const tables = await database.$queryRawUnsafe<{ present: boolean }[]>(
    "SELECT to_regclass('public.xero_authorisations') IS NOT NULL AS present"
  );
  if (tables.length !== 1 || tables[0]?.present !== true) {
    throw new Error("Cleanup requires canonical Xero schema evidence");
  }
}
const ownedAuthorisationsSql =
  "SELECT id FROM xero_authorisations WHERE id::text = ANY($1::text[]) OR provider_app_id = ANY($2::text[])";
const infrastructureValues = (owned: XeroFixtureOwnership) => {
  const keys = xeroFixtureInfrastructureKeys(owned);
  return [keys.authorisationIds, keys.providerApps];
};
export async function assertXeroFixtureInfrastructureOwned(
  database: CleanupDatabase,
  owned: XeroFixtureOwnership
): Promise<void> {
  await assertCanonicalSchema(database);
  const unsafe = await database.$queryRawUnsafe<{ unsafe: boolean }[]>(
    `
    SELECT EXISTS (SELECT 1 FROM xero_connections WHERE xero_authorisation_id IN (${ownedAuthorisationsSql})
      AND NOT (clerk_org_id = ANY($3::text[]) AND organisation_id::text = ANY($4::text[])))
    OR EXISTS (SELECT 1 FROM xero_oauth_sessions WHERE xero_authorisation_id IN (${ownedAuthorisationsSql})
      AND NOT (clerk_org_id = ANY($3::text[]) AND organisation_id::text = ANY($4::text[]))) AS unsafe
  `,
    ...infrastructureValues(owned),
    owned.clerkOrgIds,
    owned.organisationIds
  );
  if (unsafe[0]?.unsafe !== false) {
    throw new Error(
      "Cleanup refused: Xero authorisations reference unowned data"
    );
  }
}
export async function countXeroFixtureInfrastructure(
  database: CleanupDatabase,
  owned: XeroFixtureOwnership
): Promise<Record<string, number>> {
  await assertCanonicalSchema(database);
  const counts = await database.$queryRawUnsafe<{ authorisations: bigint }[]>(
    `SELECT count(*) AS authorisations FROM xero_authorisations WHERE id IN (${ownedAuthorisationsSql})`,
    ...infrastructureValues(owned)
  );
  if (!counts[0]) {
    throw new Error("Could not count Xero authorisation fixtures");
  }
  return { xero_authorisations: Number(counts[0].authorisations) };
}
/** Delete after owned connections and sessions within the protected cleanup transaction. */
export async function deleteXeroFixtureInfrastructure(
  database: CleanupDatabase,
  owned: XeroFixtureOwnership
): Promise<void> {
  await assertXeroFixtureInfrastructureOwned(database, owned);
  await database.$executeRawUnsafe(
    "DELETE FROM xero_authorisations WHERE id::text = ANY($1::text[]) OR provider_app_id = ANY($2::text[])",
    ...infrastructureValues(owned)
  );
}
export async function lockXeroFixtureInfrastructure(
  database: CleanupDatabase
): Promise<void> {
  await assertCanonicalSchema(database);
  await database.$executeRawUnsafe("SET LOCAL lock_timeout = '5000ms'");
  await database.$executeRawUnsafe(
    "LOCK TABLE xero_connections, xero_oauth_sessions, xero_authorisations IN SHARE ROW EXCLUSIVE MODE"
  );
}
