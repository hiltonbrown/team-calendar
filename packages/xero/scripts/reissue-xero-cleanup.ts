import { parseArgs } from "node:util";
import { z } from "zod";

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "attempt-id": { type: "string" },
      "clerk-org-id": { type: "string" },
      "confirm-reissue": { type: "boolean" },
      "expected-binding-generation": { type: "string" },
      "expected-provider-app-id": { type: "string" },
      "expected-remote-connection-id": { type: "string" },
      "operator-user-id": { type: "string" },
      "organisation-id": { type: "string" },
    },
    strict: true,
  });
  const input = z
    .object({
      attemptId: z.uuid(),
      clerkOrgId: z.string().min(1),
      confirmReissue: z.literal(true),
      expectedBindingGeneration: z.coerce.number().int().nonnegative(),
      expectedProviderAppId: z.string().min(1),
      expectedRemoteConnectionId: z.uuid(),
      operatorUserId: z.string().min(1),
      organisationId: z.uuid(),
    })
    .safeParse({
      attemptId: values["attempt-id"],
      clerkOrgId: values["clerk-org-id"],
      confirmReissue: values["confirm-reissue"],
      expectedBindingGeneration: values["expected-binding-generation"],
      expectedProviderAppId: values["expected-provider-app-id"],
      expectedRemoteConnectionId: values["expected-remote-connection-id"],
      operatorUserId: values["operator-user-id"],
      organisationId: values["organisation-id"],
    });
  if (!input.success) {
    process.stderr.write(
      "Explicit scope, operator, frozen app, remote UUID, generation and --confirm-reissue are required.\n"
    );
    process.exitCode = 1;
    return;
  }
  const { keys } = await import("../keys.js");
  if (keys().XERO_REMOTE_CLEANUP_MODE !== "enabled") {
    process.stderr.write(
      "Targeted Xero cleanup reissue rejected: remote cleanup is report-only.\n"
    );
    process.exitCode = 1;
    return;
  }
  const [{ database }, { reissueXeroCleanupAttempt }] = await Promise.all([
    import("@repo/database"),
    import("../src/oauth/connection-cleanup.js"),
  ]);
  try {
    const result = await reissueXeroCleanupAttempt(input.data);
    if (!result.ok) {
      process.stderr.write("Targeted Xero cleanup reissue rejected.\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Targeted cleanup receipt: ${result.value.remoteStatus}\n`
    );
  } finally {
    await database.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write(
    "Targeted Xero cleanup reissue failed. Check the explicit frozen target and scope.\n"
  );
  process.exitCode = 1;
});
