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
    attemptIds: keys("oauth_attempt"),
    ownerIds: keys("credential_owner"),
    providerApps: keys("provider_app"),
    providerConnectionIds: keys("provider_connection"),
  };
}

async function infrastructureExists(
  database: CleanupDatabase
): Promise<boolean> {
  const tables = await database.$queryRawUnsafe<{ present: boolean }[]>(`
    SELECT to_regclass('public.xero_credential_owners') IS NOT NULL AS present
    UNION ALL SELECT to_regclass('public.xero_provider_connections') IS NOT NULL
    UNION ALL SELECT to_regclass('public.xero_refresh_attempts') IS NOT NULL
  `);
  if (tables.every((table) => !table.present)) {
    return false;
  }
  if (tables.length !== 3 || tables.some((table) => !table.present)) {
    throw new Error(
      "Xero infrastructure cleanup requires a complete migration"
    );
  }
  return true;
}

const ownedOwnersSql =
  "SELECT id FROM xero_credential_owners WHERE id::text = ANY($1::text[]) OR provider_app_id = ANY($2::text[])";
const ownedProvidersSql = `SELECT id FROM xero_provider_connections WHERE id::text = ANY($3::text[]) OR provider_app_id = ANY($2::text[]) OR xero_credential_owner_id IN (${ownedOwnersSql})`;
const ownedAttemptsSql = `SELECT id FROM xero_refresh_attempts WHERE id::text = ANY($4::text[]) OR xero_credential_owner_id IN (${ownedOwnersSql})`;
const infrastructureValues = (owned: XeroFixtureOwnership) => {
  const keys = xeroFixtureInfrastructureKeys(owned);
  return [
    keys.ownerIds,
    keys.providerApps,
    keys.providerConnectionIds,
    keys.attemptIds,
  ];
};

export async function assertXeroFixtureInfrastructureOwned(
  database: CleanupDatabase,
  owned: XeroFixtureOwnership
): Promise<void> {
  if (!(await infrastructureExists(database))) {
    return;
  }
  const unsafe = await database.$queryRawUnsafe<{ unsafe: boolean }[]>(
    `
    SELECT EXISTS (
      SELECT 1 FROM xero_tenants
      WHERE (xero_credential_owner_id IN (${ownedOwnersSql}) OR xero_provider_connection_id IN (${ownedProvidersSql}))
      AND NOT (clerk_org_id = ANY($5::text[]) AND organisation_id::text = ANY($6::text[]))
    ) OR EXISTS (
      SELECT 1 FROM xero_provider_connections
      WHERE id IN (${ownedProvidersSql}) AND xero_credential_owner_id IS NOT NULL
      AND xero_credential_owner_id NOT IN (${ownedOwnersSql})
    ) OR EXISTS (
      SELECT 1 FROM xero_provider_connections
      WHERE xero_credential_owner_id IN (${ownedOwnersSql}) AND id NOT IN (${ownedProvidersSql})
    ) OR EXISTS (
      SELECT 1 FROM xero_refresh_attempts
      WHERE id IN (${ownedAttemptsSql}) AND xero_credential_owner_id NOT IN (${ownedOwnersSql})
    ) AS unsafe
  `,
    ...infrastructureValues(owned),
    owned.clerkOrgIds,
    owned.organisationIds
  );
  if (unsafe[0]?.unsafe !== false) {
    throw new Error(
      "Cleanup refused: Xero infrastructure references unowned data"
    );
  }
}

export async function countXeroFixtureInfrastructure(
  database: CleanupDatabase,
  owned: XeroFixtureOwnership
): Promise<Record<string, number>> {
  if (!(await infrastructureExists(database))) {
    return {};
  }
  const counts = await database.$queryRawUnsafe<
    { owners: bigint; providers: bigint; attempts: bigint }[]
  >(
    `
    SELECT (SELECT count(*) FROM xero_credential_owners WHERE id IN (${ownedOwnersSql})) AS owners,
      (SELECT count(*) FROM xero_provider_connections WHERE id IN (${ownedProvidersSql})) AS providers,
      (SELECT count(*) FROM xero_refresh_attempts WHERE id IN (${ownedAttemptsSql})) AS attempts
  `,
    ...infrastructureValues(owned)
  );
  if (!counts[0]) {
    throw new Error("Could not count Xero infrastructure fixtures");
  }
  return {
    xero_credential_owners: Number(counts[0].owners),
    xero_provider_connections: Number(counts[0].providers),
    xero_refresh_attempts: Number(counts[0].attempts),
  };
}

/** Call after owned bindings and sessions are deleted, within the cleanup transaction. */
export async function deleteXeroFixtureInfrastructure(
  database: CleanupDatabase,
  owned: XeroFixtureOwnership
): Promise<void> {
  if (!(await infrastructureExists(database))) {
    return;
  }
  const keys = xeroFixtureInfrastructureKeys(owned);
  await database.$executeRawUnsafe(
    `
    DELETE FROM xero_refresh_attempts WHERE id::text = ANY($1::text[])
    OR xero_credential_owner_id IN (
      SELECT id FROM xero_credential_owners WHERE id::text = ANY($2::text[])
      OR provider_app_id = ANY($3::text[])
    )
  `,
    keys.attemptIds,
    keys.ownerIds,
    keys.providerApps
  );
  await database.$executeRawUnsafe(
    `
    DELETE FROM xero_provider_connections WHERE id::text = ANY($1::text[])
    OR provider_app_id = ANY($2::text[]) OR xero_credential_owner_id IN (
      SELECT id FROM xero_credential_owners WHERE id::text = ANY($3::text[])
      OR provider_app_id = ANY($2::text[])
    )
  `,
    keys.providerConnectionIds,
    keys.providerApps,
    keys.ownerIds
  );
  await database.$executeRawUnsafe(
    `
    DELETE FROM xero_credential_owners WHERE id::text = ANY($1::text[])
    OR provider_app_id = ANY($2::text[])
  `,
    keys.ownerIds,
    keys.providerApps
  );
}

export async function lockXeroFixtureInfrastructure(
  database: CleanupDatabase
): Promise<void> {
  if (await infrastructureExists(database)) {
    await database.$executeRawUnsafe("SET LOCAL lock_timeout = '5000ms'");
    await database.$executeRawUnsafe(
      "LOCK TABLE xero_tenants, xero_credential_owners, xero_provider_connections, xero_refresh_attempts IN SHARE ROW EXCLUSIVE MODE"
    );
  }
}
