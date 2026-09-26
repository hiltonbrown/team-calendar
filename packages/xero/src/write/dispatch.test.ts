import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../adapter/auth-recovery", () => ({
  executeWithXeroAuthRecovery: (
    tenant: unknown,
    operation: (currentTenant: unknown) => unknown
  ) => operation(tenant),
}));

import {
  approveLeaveApplicationForRegion,
  declineLeaveApplicationForRegion,
  submitLeaveApplicationForRegion,
  withdrawLeaveApplicationForRegion,
} from "./dispatch";

const baseTenant = {
  accessToken: "access-token",
  bindingGeneration: 1,
  clerk_org_id: "org_1",
  deadline: { expiresAtMs: Date.now() + 120_000 },
  id: "tenant_1",
  organisation_id: "00000000-0000-4000-8000-000000000001",
  tokenVersion: 1,
  xero_tenant_id: "xero-tenant-1",
};

const submitInput = {
  endsAt: new Date("2026-05-05T00:00:00.000Z"),
  startsAt: new Date("2026-05-04T00:00:00.000Z"),
  units: 2,
  xeroEmployeeId: "employee-1",
  xeroLeaveTypeId: "type-1",
  xeroTenant: { ...baseTenant, payroll_region: "NZ" as const },
};

const approveInput = {
  xeroEmployeeId: "employee-1",
  xeroLeaveApplicationId: "app-1",
  xeroTenant: { ...baseTenant, payroll_region: "NZ" as const },
};

const declineInput = {
  reason: "reason",
  xeroEmployeeId: "employee-1",
  xeroLeaveApplicationId: "app-1",
  xeroTenant: { ...baseTenant, payroll_region: "NZ" as const },
};

const withdrawInput = {
  xeroEmployeeId: "employee-1",
  xeroLeaveApplicationId: "app-1",
  xeroTenant: { ...baseTenant, payroll_region: "NZ" as const },
};

describe("write dispatch", () => {
  describe("NZ region", () => {
    it("routes submit to the NZ write-back stub", async () => {
      const result = await submitLeaveApplicationForRegion("NZ", submitInput);
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "NZ payroll write-back is not yet available.",
        },
        ok: false,
      });
    });

    it("routes approve to the NZ write-back stub", async () => {
      const result = await approveLeaveApplicationForRegion("NZ", approveInput);
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "NZ payroll approval is not yet available.",
        },
        ok: false,
      });
    });

    it("routes decline to the NZ write-back stub", async () => {
      const result = await declineLeaveApplicationForRegion("NZ", declineInput);
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "NZ payroll approval is not yet available.",
        },
        ok: false,
      });
    });

    it("routes withdraw to the NZ write-back stub", async () => {
      const result = await withdrawLeaveApplicationForRegion(
        "NZ",
        withdrawInput
      );
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "NZ payroll write-back is not yet available.",
        },
        ok: false,
      });
    });
  });

  describe("UK region", () => {
    const ukSubmit = {
      ...submitInput,
      xeroTenant: { ...submitInput.xeroTenant, payroll_region: "UK" as const },
    };
    const ukApprove = {
      ...approveInput,
      xeroTenant: { ...approveInput.xeroTenant, payroll_region: "UK" as const },
    };
    const ukDecline = {
      ...declineInput,
      xeroTenant: { ...declineInput.xeroTenant, payroll_region: "UK" as const },
    };
    const ukWithdraw = {
      ...withdrawInput,
      xeroTenant: {
        ...withdrawInput.xeroTenant,
        payroll_region: "UK" as const,
      },
    };

    it("routes submit to the UK write-back stub", async () => {
      const result = await submitLeaveApplicationForRegion("UK", ukSubmit);
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "UK payroll write-back is not yet available.",
        },
        ok: false,
      });
    });

    it("routes approve to the UK write-back stub", async () => {
      const result = await approveLeaveApplicationForRegion("UK", ukApprove);
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "UK payroll approval is not yet available.",
        },
        ok: false,
      });
    });

    it("routes decline to the UK write-back stub", async () => {
      const result = await declineLeaveApplicationForRegion("UK", ukDecline);
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "UK payroll approval is not yet available.",
        },
        ok: false,
      });
    });

    it("routes withdraw to the UK write-back stub", async () => {
      const result = await withdrawLeaveApplicationForRegion("UK", ukWithdraw);
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "UK payroll write-back is not yet available.",
        },
        ok: false,
      });
    });
  });

  describe("unsupported regions", () => {
    it("returns region_not_supported_error for unsupported regions on submit", async () => {
      const result = await submitLeaveApplicationForRegion("US", submitInput);
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "Unsupported payroll region.",
        },
        ok: false,
      });
    });

    it("returns region_not_supported_error for unsupported regions on approve", async () => {
      const result = await approveLeaveApplicationForRegion("US", approveInput);
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "Unsupported payroll region.",
        },
        ok: false,
      });
    });

    it("returns region_not_supported_error for unsupported regions on decline", async () => {
      const result = await declineLeaveApplicationForRegion("US", declineInput);
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "Unsupported payroll region.",
        },
        ok: false,
      });
    });

    it("returns region_not_supported_error for unsupported regions on withdraw", async () => {
      const result = await withdrawLeaveApplicationForRegion(
        "US",
        withdrawInput
      );
      expect(result).toEqual({
        error: {
          code: "region_not_supported_error",
          message: "Unsupported payroll region.",
        },
        ok: false,
      });
    });
  });
});
