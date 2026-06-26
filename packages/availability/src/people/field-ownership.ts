export type FieldOwner = "team-calendar" | "xero";

export interface FieldOwnership {
  avatarUrl: "team-calendar";
  email: FieldOwner;
  firstName: FieldOwner;
  jobTitle: FieldOwner;
  lastName: FieldOwner;
  location: "team-calendar";
  manager: "team-calendar";
  personType: "team-calendar";
  startDate: FieldOwner;
  statusNote: "team-calendar";
  team: "team-calendar";
}

export function fieldOwnershipForPerson(input: {
  xeroEmployeeId: string | null;
}): FieldOwnership {
  const syncedOwner: FieldOwner = input.xeroEmployeeId
    ? "xero"
    : "team-calendar";

  return {
    avatarUrl: "team-calendar",
    email: syncedOwner,
    firstName: syncedOwner,
    jobTitle: syncedOwner,
    lastName: syncedOwner,
    location: "team-calendar",
    manager: "team-calendar",
    personType: "team-calendar",
    startDate: syncedOwner,
    statusNote: "team-calendar",
    team: "team-calendar",
  };
}
