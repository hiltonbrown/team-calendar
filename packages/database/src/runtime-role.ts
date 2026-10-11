import { createStandaloneDatabaseClient } from "./standalone-client";

export const assertRestrictedDatabaseRole = async (
  connectionString: string
): Promise<void> => {
  const client = createStandaloneDatabaseClient(connectionString);
  try {
    const [role] = await client.$queryRaw<Array<{ unsafe: boolean }>>`
      SELECT (r.rolsuper OR r.rolbypassrls OR
        EXISTS (SELECT 1 FROM pg_roles elevated WHERE (elevated.rolsuper OR elevated.rolbypassrls OR elevated.rolname = 'neon_superuser') AND pg_has_role(r.oid, elevated.oid, 'MEMBER')) OR
        EXISTS (SELECT 1 FROM pg_class c WHERE pg_has_role(r.oid, c.relowner, 'MEMBER') AND c.relkind IN ('r', 'p'))) AS unsafe
      FROM pg_roles r WHERE r.rolname = current_user
    `;
    if (!role || role.unsafe) {
      throw new Error(
        "DATABASE_APP_URL must use a non-owner role without superuser or RLS bypass privileges"
      );
    }
  } finally {
    await client.$disconnect();
  }
};
