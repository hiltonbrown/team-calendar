import { describe, expect, it } from "vitest";
import {
  isSupportedCurrencyCode,
  LeaveBalanceRawPayloadSchema,
  mapXeroLeaveBalances,
  SupportedCurrencyCodeSchema,
  toValidatedLeaveBalanceRawPayload,
} from "./leave-balances";

describe("Xero leave balances read mapper", () => {
  it.each([undefined, null, "12"])(
    "rejects invalid provider balance amount %s instead of inventing zero",
    (amount) => {
      expect(() =>
        mapXeroLeaveBalances({
          Employees: [
            {
              EmployeeID: "emp-1",
              LeaveBalances: [
                {
                  LeaveTypeID: "annual",
                  NumberOfUnits: amount,
                  TypeOfUnits: "Hours",
                },
              ],
            },
          ],
        })
      ).toThrow();
    }
  );
  it.each([
    {},
    { Employees: [] },
    { Employees: "invalid" },
    { Employees: [{ EmployeeID: "emp-1" }] },
    { Employees: [{ LeaveBalances: [] }] },
  ])(
    "rejects malformed employee balance detail %j instead of reporting no balances",
    (payload) => {
      expect(() => mapXeroLeaveBalances(payload)).toThrow();
    }
  );
  it("accepts genuine empty balances and preserves provider zero", () => {
    expect(
      mapXeroLeaveBalances({
        Employees: [{ EmployeeID: "emp-1", LeaveBalances: [] }],
      })
    ).toEqual([]);
    expect(
      mapXeroLeaveBalances({
        Employees: [
          {
            EmployeeID: "emp-1",
            LeaveBalances: [
              { LeaveTypeID: "annual", NumberOfUnits: 0, TypeOfUnits: "Days" },
            ],
          },
        ],
      })
    ).toMatchObject([{ balance: 0, unitType: "days" }]);
  });
  it("maps AU employee detail leave balances into narrow Xero balances", () => {
    const balances = mapXeroLeaveBalances({
      Employees: [
        {
          EmployeeID: "11111111-1111-4111-8111-111111111111",
          LeaveBalances: [
            {
              LeaveName: "Annual Leave",
              LeaveTypeID: "annual",
              NumberOfUnits: 76,
              TypeOfUnits: "Hours",
            },
            {
              LeaveName: "Personal Leave",
              LeaveTypeID: "personal",
              NumberOfUnits: 10,
              TypeOfUnits: "Days",
            },
          ],
        },
      ],
    });

    expect(balances).toEqual([
      {
        balance: 76,
        currencyCode: null,
        employeeId: "11111111-1111-4111-8111-111111111111",
        leaveTypeId: "annual",
        leaveTypeName: "Annual Leave",
        rawPayload: expect.objectContaining({ LeaveTypeID: "annual" }),
        unitType: "hours",
      },
      {
        balance: 10,
        currencyCode: null,
        employeeId: "11111111-1111-4111-8111-111111111111",
        leaveTypeId: "personal",
        leaveTypeName: "Personal Leave",
        rawPayload: expect.objectContaining({ LeaveTypeID: "personal" }),
        unitType: "days",
      },
    ]);
  });

  it("maps a Dollars balance with a valid NZD currency code to unitType currency", () => {
    const balances = mapXeroLeaveBalances({
      Employees: [
        {
          EmployeeID: "22222222-2222-4222-8222-222222222222",
          LeaveBalances: [
            {
              CurrencyCode: "nzd",
              LeaveName: "Holiday Pay",
              LeaveTypeID: "holiday-pay",
              NumberOfUnits: 1234.56,
              TypeOfUnits: "Dollars",
            },
          ],
        },
      ],
    });

    expect(balances).toEqual([
      {
        balance: 1234.56,
        currencyCode: "NZD",
        employeeId: "22222222-2222-4222-8222-222222222222",
        leaveTypeId: "holiday-pay",
        leaveTypeName: "Holiday Pay",
        rawPayload: expect.objectContaining({ TypeOfUnits: "Dollars" }),
        unitType: "currency",
      },
    ]);
  });

  it("maps a currency balance without a currency code to a null currencyCode", () => {
    const balances = mapXeroLeaveBalances({
      Employees: [
        {
          EmployeeID: "33333333-3333-4333-8333-333333333333",
          LeaveBalances: [
            {
              LeaveName: "Holiday Pay",
              LeaveTypeID: "holiday-pay",
              NumberOfUnits: 500,
              TypeOfUnits: "Dollars",
            },
          ],
        },
      ],
    });

    expect(balances[0]).toMatchObject({
      currencyCode: null,
      unitType: "currency",
    });
  });
});

describe("SupportedCurrencyCodeSchema", () => {
  it("accepts NZD", () => {
    expect(isSupportedCurrencyCode("NZD")).toBe(true);
    expect(SupportedCurrencyCodeSchema.safeParse("NZD").success).toBe(true);
  });

  it("rejects an unsupported currency code", () => {
    expect(isSupportedCurrencyCode("USD")).toBe(false);
    expect(isSupportedCurrencyCode("AUD")).toBe(false);
    expect(isSupportedCurrencyCode(null)).toBe(false);
    expect(isSupportedCurrencyCode(undefined)).toBe(false);
  });
});

describe("LeaveBalanceRawPayloadSchema / toValidatedLeaveBalanceRawPayload", () => {
  it("round-trips a plain JSON-safe raw payload", () => {
    const rawPayload = {
      CurrencyCode: "NZD",
      LeaveTypeID: "holiday-pay",
      NumberOfUnits: 1234.56,
      TypeOfUnits: "Dollars",
    };

    expect(LeaveBalanceRawPayloadSchema.safeParse(rawPayload).success).toBe(
      true
    );
    expect(toValidatedLeaveBalanceRawPayload(rawPayload)).toEqual(rawPayload);
  });

  it("returns null for a payload that cannot be represented as JSON", () => {
    const notJsonSafe = { fn: () => "not json" };

    expect(toValidatedLeaveBalanceRawPayload(notJsonSafe)).toBeNull();
  });
});
