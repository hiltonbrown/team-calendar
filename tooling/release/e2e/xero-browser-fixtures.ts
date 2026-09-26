import { z } from "zod";
import type { ReleaseManifest } from "../database-guard.js";

const recoveryReasons = [
  "update_permissions",
  "reauthorise",
  "access_denied",
  "retry_later",
  "outcome_unknown",
  "operational_incident",
  "unavailable",
  "disconnect_pending",
  "reauthorisation_required",
  "not_connected",
] as const;
const recipeSchema = z.strictObject({
  clerkOrgId: z.string().min(1),
  connectionId: z.uuid().nullable(),
  organisationId: z.uuid(),
  organisationName: z.string().min(1),
  reason: z.enum(recoveryReasons),
  remoteStatus: z.enum(["left_in_place", "pending", "unknown"]).nullable(),
  surface: z.enum(["plans", "calendar", "settings/integrations/xero"]),
});
export type XeroBrowserFixtureRecipe = z.infer<typeof recipeSchema>;
export interface XeroControlledFixtureStore {
  assertOwnedControl: (
    recipe: XeroBrowserFixtureRecipe,
    runId: string
  ) => Promise<void>;
  readBack: (recipe: XeroBrowserFixtureRecipe) => Promise<{
    reason: string;
    remoteStatus: string | null;
    clerkOrgId: string;
    organisationId: string;
  }>;
  // Controlled application/job producer must persist the stated status/receipt,
  // without real provider transport. This is deliberately distinct from LIVE.
  seedControlledState: (recipe: XeroBrowserFixtureRecipe) => Promise<void>;
}
export async function produceXeroControlledBrowserFixtures(
  manifest: ReleaseManifest,
  values: unknown,
  store: XeroControlledFixtureStore
) {
  const recipes = z.array(recipeSchema).length(10).parse(values);
  if (
    new Set(recipes.map((entry) => entry.reason)).size !== 10 ||
    new Set(recipes.map((entry) => entry.organisationId)).size !== 10
  ) {
    throw new Error("Controlled recovery fixture catalogue is incomplete");
  }
  for (const recipe of recipes) {
    if (
      !(
        manifest.owned.clerkOrgIds.includes(recipe.clerkOrgId) &&
        manifest.owned.organisationIds.includes(recipe.organisationId)
      )
    ) {
      throw new Error(
        "Controlled browser fixture is outside protected ownership"
      );
    }
    await store.assertOwnedControl(recipe, manifest.runId);
    await store.seedControlledState(recipe);
    const readBack = await store.readBack(recipe);
    if (
      readBack.clerkOrgId !== recipe.clerkOrgId ||
      readBack.organisationId !== recipe.organisationId ||
      readBack.reason !== recipe.reason ||
      readBack.remoteStatus !== recipe.remoteStatus
    ) {
      throw new Error(
        "Controlled browser fixture persistence disagrees with its recipe"
      );
    }
  }
  const receipts = recipes.filter((entry) => entry.remoteStatus !== null);
  if (
    receipts.length !== 3 ||
    new Set(receipts.map((entry) => entry.remoteStatus)).size !== 3
  ) {
    throw new Error("Controlled disconnect receipt fixtures are incomplete");
  }
  return {
    TC_E2E_XERO_RECEIPT_FIXTURES_JSON: JSON.stringify(
      receipts.map((entry) => ({
        organisationId: entry.organisationId,
        organisationName: entry.organisationName,
        remoteStatus: entry.remoteStatus,
      }))
    ),
    TC_E2E_XERO_RECOVERY_FIXTURES_JSON: JSON.stringify(
      recipes.map((entry) => ({
        organisationId: entry.organisationId,
        reason: entry.reason,
        surface: entry.surface,
      }))
    ),
  };
}
// Deployment currently has no controlled provider/worker injection contract.
// No SQL status label can prove a real handler ran. The default CLI refuses
// fixture creation until that exact producer is supplied and verified.
export function currentControlledBrowserFixtureCapability() {
  return {
    available: false as const,
    required:
      "Protected owned Clerk role identities plus a deployed controlled-handler fixture producer with persistence read-back",
  };
}
