import { describe, expect, it } from "vitest";
import { mapXeroEmployees } from "./employees";

describe("mapXeroEmployees", () => {
  it("maps employee IDs with EmployeeID taking precedence over EmployeeId", () => {
    const employees = mapXeroEmployees({
      Employees: [
        {
          EmployeeID: "11111111-1111-4111-8111-111111111111",
          EmployeeId: "22222222-2222-4222-8222-222222222222",
          FirstName: "Ada",
          LastName: "Lovelace",
        },
        {
          EmployeeId: "33333333-3333-4333-8333-333333333333",
          FirstName: "Grace",
          LastName: "Hopper",
        },
      ],
    });

    expect(employees.map((employee) => employee.employeeId)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("trims optional string fields and maps whitespace-only values to null", () => {
    const [employee] = mapXeroEmployees({
      Employees: [
        {
          Email: " ada@example.com ",
          EmployeeID: "11111111-1111-4111-8111-111111111111",
          EmploymentType: " Full Time ",
          FirstName: "Ada",
          JobTitle: " Engineer ",
          LastName: "Lovelace",
          StartDate: " 2026-01-01 ",
          Status: " ACTIVE ",
        },
      ],
    });

    expect(employee).toEqual({
      email: "ada@example.com",
      employeeId: "11111111-1111-4111-8111-111111111111",
      employmentType: "Full Time",
      firstName: "Ada",
      jobTitle: "Engineer",
      lastName: "Lovelace",
      rawPayload: expect.objectContaining({
        EmployeeID: "11111111-1111-4111-8111-111111111111",
      }),
      startDate: "2026-01-01",
      status: "ACTIVE",
    });

    const [blankEmployee] = mapXeroEmployees({
      Employees: [
        {
          Email: " ",
          EmployeeID: "22222222-2222-4222-8222-222222222222",
          EmploymentType: " ",
          FirstName: "Grace",
          JobTitle: " ",
          LastName: "Hopper",
          StartDate: " ",
          Status: " ",
        },
      ],
    });

    expect(blankEmployee).toEqual(
      expect.objectContaining({
        email: null,
        employmentType: null,
        jobTitle: null,
        startDate: null,
        status: null,
      })
    );
  });

  it("returns an empty list for malformed payloads", () => {
    expect(mapXeroEmployees(null)).toEqual([]);
    expect(mapXeroEmployees({})).toEqual([]);
    expect(mapXeroEmployees({ Employees: "not an array" })).toEqual([]);
    expect(
      mapXeroEmployees({
        Employees: [
          {
            EmployeeID: "not-a-uuid",
            FirstName: "Ada",
            LastName: "Lovelace",
          },
        ],
      })
    ).toEqual([]);
  });
});
