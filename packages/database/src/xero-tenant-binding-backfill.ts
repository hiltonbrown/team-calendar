type ConnectionStatus =
  | "pending"
  | "pending_tenant_selection"
  | "active"
  | "stale"
  | "disconnected";

interface BindingRow {
  active_slot: number | null;
  connection_status: ConnectionStatus;
  id: string;
  organisation_id: string;
  provider_app_id: string | null;
  xero_tenant_id: string;
}

export function planXeroTenantBindingBackfill(
  rows: readonly BindingRow[],
  providerAppId: string
): {
  updates: { id: string; provider_app_id: string; active_slot: 1 | null }[];
  collisions: { xero_tenant_id: string; organisation_ids: string[] }[];
} {
  const reserved = new Map<string, BindingRow[]>();
  for (const row of rows) {
    if (row.connection_status === "disconnected") {
      continue;
    }
    const key = `${row.provider_app_id ?? providerAppId}\0${row.xero_tenant_id}`;
    const matchingRows = reserved.get(key) ?? [];
    matchingRows.push(row);
    reserved.set(key, matchingRows);
  }

  const collisions = [...reserved.entries()]
    .filter(([, matchingRows]) => matchingRows.length > 1)
    .map(([, matchingRows]) => ({
      organisation_ids: matchingRows.map((row) => row.organisation_id),
      xero_tenant_id: matchingRows[0]?.xero_tenant_id ?? "",
    }));
  const collidedKeys = new Set(
    [...reserved.entries()]
      .filter(([, matchingRows]) => matchingRows.length > 1)
      .map(([key]) => key)
  );
  const updates = rows.flatMap((row) => {
    const effectiveProviderAppId = row.provider_app_id ?? providerAppId;
    if (collidedKeys.has(`${effectiveProviderAppId}\0${row.xero_tenant_id}`)) {
      return [];
    }
    const active_slot: 1 | null =
      row.connection_status === "disconnected" ? null : 1;
    if (
      row.provider_app_id === effectiveProviderAppId &&
      row.active_slot === active_slot
    ) {
      return [];
    }
    return [
      { active_slot, id: row.id, provider_app_id: effectiveProviderAppId },
    ];
  });

  return { collisions, updates };
}
