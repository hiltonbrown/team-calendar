import { describe, expect, it } from "vitest";
import { fieldOwnershipForPerson } from "./field-ownership";

describe("field-ownership", () => {
  it("marks Xero-sourced identity fields as Xero-owned when linked", () => {
    expect(
      fieldOwnershipForPerson({ xeroEmployeeId: "xero-employee-1" })
    ).toMatchObject({
      email: "xero",
      firstName: "xero",
      jobTitle: "xero",
      lastName: "xero",
      startDate: "xero",
      location: "team-calendar",
      manager: "team-calendar",
      personType: "team-calendar",
      statusNote: "team-calendar",
      team: "team-calendar",
    });
  });

  it("marks all identity fields as Team Calendar-owned for manual people", () => {
    expect(fieldOwnershipForPerson({ xeroEmployeeId: null })).toMatchObject({
      email: "team-calendar",
      firstName: "team-calendar",
      jobTitle: "team-calendar",
      lastName: "team-calendar",
      startDate: "team-calendar",
    });
  });
});
