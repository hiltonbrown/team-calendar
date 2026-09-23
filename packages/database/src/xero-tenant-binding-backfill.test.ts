import { describe, expect, it } from "vitest";
import { planXeroTenantBindingBackfill } from "./xero-tenant-binding-backfill";

const baseRow = {
  active_slot: null,
  connection_status: "active" as const,
  id: "tenant-1",
  organisation_id: "organisation-1",
  provider_app_id: null,
  xero_tenant_id: "xero-file-1",
};

describe("planXeroTenantBindingBackfill", () => {
  it("is idempotent after the first pass", () => {
    const first = planXeroTenantBindingBackfill([baseRow], "app-1");
    expect(first).toEqual({
      collisions: [],
      updates: [{ active_slot: 1, id: "tenant-1", provider_app_id: "app-1" }],
    });

    expect(
      planXeroTenantBindingBackfill(
        [{ ...baseRow, active_slot: 1, provider_app_id: "app-1" }],
        "app-1"
      ).updates
    ).toEqual([]);
  });

  it("retires disconnected rows", () => {
    expect(
      planXeroTenantBindingBackfill(
        [{ ...baseRow, active_slot: 1, connection_status: "disconnected" }],
        "app-1"
      ).updates
    ).toEqual([
      { active_slot: null, id: "tenant-1", provider_app_id: "app-1" },
    ]);
  });

  it("reports a reservation collision without updates to affected rows", () => {
    const second = {
      ...baseRow,
      id: "tenant-2",
      organisation_id: "organisation-2",
    };
    expect(planXeroTenantBindingBackfill([baseRow, second], "app-1")).toEqual({
      collisions: [
        {
          organisation_ids: ["organisation-1", "organisation-2"],
          xero_tenant_id: "xero-file-1",
        },
      ],
      updates: [],
    });
  });

  it("preserves a binding owned by another provider app", () => {
    const otherAppRow = {
      ...baseRow,
      active_slot: 1,
      id: "tenant-2",
      organisation_id: "organisation-2",
      provider_app_id: "app-2",
    };
    expect(
      planXeroTenantBindingBackfill([baseRow, otherAppRow], "app-1")
    ).toEqual({
      collisions: [],
      updates: [{ active_slot: 1, id: "tenant-1", provider_app_id: "app-1" }],
    });
  });
});
