import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), queryRaw: vi.fn() }));
vi.mock("../system-client", () => ({
  systemDatabase: { xeroConnection: { findFirst: mocks.findFirst } },
}));

import { claimXeroTenant, isXeroTenantBindingConflict } from "./xero-ownership";

test("unowned tenant acquires the transaction lock before resolving its owner", async () => {
  mocks.findFirst.mockResolvedValue(null);
  await expect(
    claimXeroTenant(
      { $queryRaw: mocks.queryRaw },
      { accountId: "account" },
      "tenant"
    )
  ).resolves.toEqual({ status: "unowned" });
  expect(mocks.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.findFirst.mock.invocationCallOrder[0]
  );
});

test.each([
  "xero_connections_owned_tenant_key",
  "xero_connections_owned_remote_connection_key",
])(
  "maps adapter ownership index %s without treating other unique indexes as conflicts",
  (index) => {
    expect(
      isXeroTenantBindingConflict({
        code: "P2002",
        meta: { driverAdapterError: { cause: { constraint: { index } } } },
      })
    ).toBe(true);
    expect(
      isXeroTenantBindingConflict({
        code: "P2002",
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { index: "xero_connections_organisation_id_key" },
            },
          },
        },
      })
    ).toBe(false);
  }
);

test.each(["xero_tenant_id", "remote_connection_id"])(
  "maps Neon ownership-column metadata for %s",
  (field) => {
    expect(
      isXeroTenantBindingConflict({
        code: "P2002",
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { fields: [field] },
              kind: "UniqueConstraintViolation",
              originalCode: "23505",
            },
          },
        },
      })
    ).toBe(true);
  }
);

test.each([
  { fields: ["organisation_id"] },
  { fields: ["xero_authorisation_id"] },
  { fields: ["xero_tenant_id", "organisation_id"] },
  { fields: [] },
])(
  "does not classify unrelated or composite adapter fields %j",
  ({ fields }) => {
    expect(
      isXeroTenantBindingConflict({
        code: "P2002",
        meta: { driverAdapterError: { cause: { constraint: { fields } } } },
      })
    ).toBe(false);
  }
);

const opaqueOwnershipFailure = ({
  cause = {},
  code = "P2002",
  modelName = "XeroConnection",
}: {
  cause?: Record<string, unknown>;
  code?: unknown;
  modelName?: unknown;
} = {}) => ({
  code,
  meta: {
    driverAdapterError: {
      cause: {
        kind: "UniqueConstraintViolation",
        originalCode: "23505",
        originalMessage:
          'duplicate key value violates unique constraint "xero_connections_owned_tenant_key"',
        ...cause,
      },
    },
    modelName,
  },
});

test.each([
  "xero_connections_owned_tenant_key",
  "xero_connections_owned_remote_connection_key",
])("maps RLS-opaque adapter conflict for exact owned index %s", (index) => {
  expect(
    isXeroTenantBindingConflict(
      opaqueOwnershipFailure({
        cause: {
          originalMessage: `duplicate key value violates unique constraint "${index}"`,
        },
      })
    )
  ).toBe(true);
});

test.each([
  opaqueOwnershipFailure({ code: "P2003" }),
  opaqueOwnershipFailure({ modelName: "OtherModel" }),
  opaqueOwnershipFailure({ cause: { kind: "ForeignKeyConstraintViolation" } }),
  opaqueOwnershipFailure({ cause: { originalCode: "23503" } }),
  opaqueOwnershipFailure({ cause: { originalCode: 23_505 } }),
  opaqueOwnershipFailure({
    cause: { originalMessage: "xero_connections_owned_tenant_key" },
  }),
  opaqueOwnershipFailure({
    cause: {
      originalMessage:
        'duplicate key value violates unique constraint "xero_connections_organisation_id_key"',
    },
  }),
  opaqueOwnershipFailure({
    cause: {
      originalMessage:
        'prefix duplicate key value violates unique constraint "xero_connections_owned_tenant_key" suffix',
    },
  }),
  opaqueOwnershipFailure({
    cause: {
      constraint: { fields: ["xero_tenant_id", "organisation_id"] },
    },
  }),
  opaqueOwnershipFailure({ cause: { constraint: null } }),
])("denies unrecognised or malformed opaque ownership metadata %j", (error) => {
  expect(isXeroTenantBindingConflict(error)).toBe(false);
});
