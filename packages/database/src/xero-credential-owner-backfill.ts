export interface LegacyCredentialBinding {
  active_slot: number | null;
  id: string;
  provider_app_id: string;
  xero_credential_owner_id: string | null;
}

export interface VerifiedLegacyCredentialIdentity {
  tenantId: string;
  xeroUserId: string | null;
}

export interface ExistingCredentialOwner {
  id: string;
  provider_app_id: string;
  xero_user_id: string;
}

/** Identity verification happens in @repo/xero; this planner never inspects tokens. */
export function planXeroCredentialOwnerBackfill(
  rows: readonly LegacyCredentialBinding[],
  identities: readonly VerifiedLegacyCredentialIdentity[],
  providerAppId: string,
  owners: readonly ExistingCredentialOwner[] = []
): {
  attachments: {
    tenantId: string;
    xeroUserId: string;
    ownerId: string | null;
  }[];
  groups: { xeroUserId: string; tenantIds: string[] }[];
  unverifiableTenantIds: string[];
} {
  const identityByTenant = new Map<string, string | null>();
  for (const identity of identities) {
    if (identityByTenant.has(identity.tenantId)) {
      throw new Error("Duplicate legacy credential identity");
    }
    identityByTenant.set(identity.tenantId, identity.xeroUserId);
  }
  const grouped = new Map<string, LegacyCredentialBinding[]>();
  const unverifiableTenantIds: string[] = [];
  for (const row of rows) {
    if (row.active_slot !== 1 || row.provider_app_id !== providerAppId) {
      continue;
    }
    const xeroUserId = identityByTenant.get(row.id);
    if (!xeroUserId) {
      if (!row.xero_credential_owner_id) {
        unverifiableTenantIds.push(row.id);
      }
      continue;
    }
    const group = grouped.get(xeroUserId) ?? [];
    group.push(row);
    grouped.set(xeroUserId, group);
  }
  const attachments: {
    tenantId: string;
    xeroUserId: string;
    ownerId: string | null;
  }[] = [];
  const groups: { xeroUserId: string; tenantIds: string[] }[] = [];
  for (const [xeroUserId, group] of grouped) {
    if (group.length > 1) {
      groups.push({
        tenantIds: group.map((binding) => binding.id).sort(),
        xeroUserId,
      });
      continue;
    }
    const [row] = group;
    if (!row || row.xero_credential_owner_id) {
      continue;
    }
    const owner = owners.find(
      (candidate) =>
        candidate.provider_app_id === providerAppId &&
        candidate.xero_user_id === xeroUserId
    );
    attachments.push({
      ownerId: owner?.id ?? null,
      tenantId: row.id,
      xeroUserId,
    });
  }
  return {
    attachments,
    groups,
    unverifiableTenantIds: unverifiableTenantIds.sort(),
  };
}
