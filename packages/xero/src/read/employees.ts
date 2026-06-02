import { z } from "zod";

export interface XeroEmployee {
  email: string | null;
  employeeId: string;
  employmentType: string | null;
  firstName: string;
  jobTitle: string | null;
  lastName: string;
  rawPayload: unknown;
  startDate: string | null;
  status: string | null;
}

export const XeroEmployeeSchema = z
  .object({
    EmployeeID: z.string().uuid().optional(),
    EmployeeId: z.string().uuid().optional(),
    FirstName: z.string().optional().nullable(),
    LastName: z.string().optional().nullable(),
    Email: z.string().optional().nullable(),
    Status: z.string().optional().nullable(),
    JobTitle: z.string().optional().nullable(),
    StartDate: z.string().optional().nullable(),
    EmploymentType: z.string().optional().nullable(),
  })
  .passthrough();

export const XeroEmployeesResponseSchema = z
  .object({
    Employees: z.array(XeroEmployeeSchema),
  })
  .passthrough();

export function mapXeroEmployees(payload: unknown): XeroEmployee[] {
  const parsed = XeroEmployeesResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.Employees.map((e) => ({
    employeeId: e.EmployeeID ?? e.EmployeeId ?? "",
    firstName: e.FirstName ?? "",
    lastName: e.LastName ?? "",
    email:
      typeof e.Email === "string" && e.Email.trim().length > 0
        ? e.Email.trim()
        : null,
    status:
      typeof e.Status === "string" && e.Status.trim().length > 0
        ? e.Status.trim()
        : null,
    jobTitle:
      typeof e.JobTitle === "string" && e.JobTitle.trim().length > 0
        ? e.JobTitle.trim()
        : null,
    startDate:
      typeof e.StartDate === "string" && e.StartDate.trim().length > 0
        ? e.StartDate.trim()
        : null,
    employmentType:
      typeof e.EmploymentType === "string" && e.EmploymentType.trim().length > 0
        ? e.EmploymentType.trim()
        : null,
    rawPayload: e,
  }));
}
