export interface DemoPerson {
  id: string;
  name: string;
}

export type DemoAbsenceKind = "Annual leave" | "Personal leave" | "WFH";

export interface DemoAbsence {
  end: number;
  kind: DemoAbsenceKind;
  monthIndex: number;
  personId: string;
  start: number;
}

export interface DemoDepartment {
  absences: DemoAbsence[];
  id: string;
  monthly: {
    usedDays: number;
    balanceDays: number;
    scheduledDays: number;
  }[];
  name: string;
  people: DemoPerson[];
}

export const months = [
  {
    days: [
      "2026-04-20",
      "2026-04-21",
      "2026-04-22",
      "2026-04-23",
      "2026-04-24",
    ],
    id: "apr",
    label: "April 2026",
  },
  {
    days: [
      "2026-05-18",
      "2026-05-19",
      "2026-05-20",
      "2026-05-21",
      "2026-05-22",
    ],
    id: "may",
    label: "May 2026",
  },
  {
    days: [
      "2026-06-15",
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
      "2026-06-19",
    ],
    id: "jun",
    label: "June 2026",
  },
];

// Illustrative monthly snapshots, independent of the five-day coverage samples.
// Balances represent supplied payroll values; this demo does not accrue leave.
// Scheduled days count Monday to Friday per person, before public holidays.
export const departments: DemoDepartment[] = [
  {
    absences: [
      { end: 1, kind: "Annual leave", monthIndex: 0, personId: "ap", start: 0 },
      {
        end: 4,
        kind: "Personal leave",
        monthIndex: 0,
        personId: "lw",
        start: 4,
      },
      { end: 3, kind: "Annual leave", monthIndex: 1, personId: "en", start: 1 },
      {
        end: 2,
        kind: "Personal leave",
        monthIndex: 1,
        personId: "dc",
        start: 2,
      },
      { end: 3, kind: "Annual leave", monthIndex: 2, personId: "dc", start: 1 },
      { end: 2, kind: "Annual leave", monthIndex: 2, personId: "ap", start: 2 },
      { end: 0, kind: "WFH", monthIndex: 2, personId: "en", start: 0 },
    ],
    id: "engineering",
    monthly: [
      { balanceDays: 64, scheduledDays: 88, usedDays: 8 },
      { balanceDays: 59, scheduledDays: 84, usedDays: 12 },
      { balanceDays: 50, scheduledDays: 88, usedDays: 16 },
    ],
    name: "Engineering",
    people: [
      { id: "dc", name: "Daniel Chen" },
      { id: "ap", name: "Amelia Patel" },
      { id: "lw", name: "Liam Wilson" },
      { id: "en", name: "Emily Nguyen" },
    ],
  },
  {
    absences: [
      { end: 4, kind: "Annual leave", monthIndex: 0, personId: "oc", start: 0 },
      { end: 4, kind: "Annual leave", monthIndex: 0, personId: "zh", start: 3 },
      { end: 1, kind: "Annual leave", monthIndex: 1, personId: "jb", start: 0 },
      { end: 4, kind: "WFH", monthIndex: 1, personId: "pn", start: 4 },
      { end: 4, kind: "Annual leave", monthIndex: 2, personId: "pn", start: 3 },
      {
        end: 4,
        kind: "Personal leave",
        monthIndex: 2,
        personId: "oc",
        start: 4,
      },
    ],
    id: "sales",
    monthly: [
      { balanceDays: 55, scheduledDays: 88, usedDays: 14 },
      { balanceDays: 53, scheduledDays: 84, usedDays: 9 },
      { balanceDays: 48, scheduledDays: 88, usedDays: 12 },
    ],
    name: "Sales",
    people: [
      { id: "pn", name: "Patrick Nolan" },
      { id: "oc", name: "Olivia Cooper" },
      { id: "jb", name: "Jack Brooks" },
      { id: "zh", name: "Zoe Harris" },
    ],
  },
  {
    absences: [
      { end: 3, kind: "Annual leave", monthIndex: 0, personId: "nc", start: 2 },
      { end: 4, kind: "Annual leave", monthIndex: 1, personId: "ew", start: 2 },
      {
        end: 3,
        kind: "Personal leave",
        monthIndex: 1,
        personId: "sg",
        start: 3,
      },
      { end: 1, kind: "Annual leave", monthIndex: 2, personId: "jo", start: 0 },
      { end: 4, kind: "Annual leave", monthIndex: 2, personId: "sg", start: 4 },
    ],
    id: "operations",
    monthly: [
      { balanceDays: 72, scheduledDays: 88, usedDays: 6 },
      { balanceDays: 69, scheduledDays: 84, usedDays: 10 },
      { balanceDays: 68, scheduledDays: 88, usedDays: 8 },
    ],
    name: "Operations",
    people: [
      { id: "jo", name: "James O'Connor" },
      { id: "ew", name: "Ella Walker" },
      { id: "nc", name: "Noah Campbell" },
      { id: "sg", name: "Sophie Green" },
    ],
  },
];

export function getCoverage(
  department: DemoDepartment,
  monthIndex: number,
  dayIndex: number
) {
  const absent = department.people.flatMap((person) => {
    const absence = department.absences.find(
      (entry) =>
        entry.personId === person.id &&
        entry.monthIndex === monthIndex &&
        entry.start <= dayIndex &&
        entry.end >= dayIndex &&
        entry.kind !== "WFH"
    );
    return absence ? [{ ...person, kind: absence.kind }] : [];
  });
  const total = department.people.length;
  const available = total - absent.length;

  return {
    absent,
    available,
    overlap: absent.length > 1,
    percent: total === 0 ? 0 : Math.round((available / total) * 100),
    total,
  };
}
