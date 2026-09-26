import { createHash } from "node:crypto";
import { z } from "zod";

export interface XeroCredentialEnvelopeSnapshot {
  access_token_auth_tag: string | null;
  access_token_encrypted: string;
  access_token_iv: string | null;
  expires_at: Date;
  refresh_token_auth_tag: string | null;
  refresh_token_encrypted: string;
  refresh_token_iv: string | null;
  token_key_version: number;
}
export interface XeroCredentialBindingSnapshot {
  binding_generation: number;
  clerk_org_id: string;
  id: string;
  organisation_id: string;
  provider_app_id: string;
  xero_connection: XeroCredentialEnvelopeSnapshot;
  xero_connection_id: string;
}
export const xeroCredentialIdentitySnapshotSchema = z.strictObject({
  bindingGeneration: z.number().int().nonnegative(),
  clerkOrgId: z.string().min(1),
  connectionId: z.uuid(),
  credentialFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  organisationId: z.uuid(),
  providerAppId: z.string().min(1),
  tenantId: z.uuid(),
  xeroUserId: z.string().min(1).nullable(),
});
export type XeroCredentialIdentitySnapshot = z.infer<
  typeof xeroCredentialIdentitySnapshotSchema
>;
export const xeroCredentialIdentityArtifactSchema = z
  .strictObject({
    entries: z.array(xeroCredentialIdentitySnapshotSchema),
    providerAppId: z.string().min(1),
    version: z.literal(1),
  })
  .superRefine((artifact, context) => {
    const seen = new Set<string>();
    for (const entry of artifact.entries) {
      if (
        entry.providerAppId !== artifact.providerAppId ||
        seen.has(entry.tenantId)
      ) {
        context.addIssue({
          code: "custom",
          message: "Identity artefact scope is inconsistent.",
        });
      }
      seen.add(entry.tenantId);
    }
  });

export function xeroCredentialEnvelopeFingerprint(
  connection: XeroCredentialEnvelopeSnapshot
): string {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify([
        connection.access_token_encrypted,
        connection.access_token_iv,
        connection.access_token_auth_tag,
        connection.refresh_token_encrypted,
        connection.refresh_token_iv,
        connection.refresh_token_auth_tag,
        connection.token_key_version,
        connection.expires_at.toISOString(),
      ])
    )
    .digest("hex")}`;
}

/** Identity still comes from verified JWT claims. The digest only binds that proof to a snapshot. */
export function captureXeroCredentialIdentitySnapshot(
  binding: XeroCredentialBindingSnapshot,
  xeroUserId: string | null
): XeroCredentialIdentitySnapshot {
  return xeroCredentialIdentitySnapshotSchema.parse({
    bindingGeneration: binding.binding_generation,
    clerkOrgId: binding.clerk_org_id,
    connectionId: binding.xero_connection_id,
    credentialFingerprint: xeroCredentialEnvelopeFingerprint(
      binding.xero_connection
    ),
    organisationId: binding.organisation_id,
    providerAppId: binding.provider_app_id,
    tenantId: binding.id,
    xeroUserId,
  });
}

export function matchesXeroCredentialIdentitySnapshot(
  identity: XeroCredentialIdentitySnapshot,
  binding: XeroCredentialBindingSnapshot
): boolean {
  return (
    identity.tenantId === binding.id &&
    identity.providerAppId === binding.provider_app_id &&
    identity.clerkOrgId === binding.clerk_org_id &&
    identity.organisationId === binding.organisation_id &&
    identity.bindingGeneration === binding.binding_generation &&
    identity.connectionId === binding.xero_connection_id &&
    identity.credentialFingerprint ===
      xeroCredentialEnvelopeFingerprint(binding.xero_connection)
  );
}
