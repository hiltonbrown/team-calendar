import { z } from "zod";

export const syncRunTypes = [
  "people",
  "leave_records",
  "leave_balances",
  "approval_state_reconciliation",
] as const;

export const syncRunStatuses = [
  "running",
  "succeeded",
  "partial_success",
  "failed",
  "cancelled",
] as const;

export const syncTriggerTypes = ["scheduled", "manual", "webhook"] as const;

const csvArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value
        .flatMap((item) => String(item).split(","))
        .filter((item) => item !== "all" && item.length > 0);
    }
    if (typeof value === "string" && value.length > 0) {
      return value
        .split(",")
        .filter((item) => item !== "all" && item.length > 0);
    }
  }, z.array(schema).optional());

const optionalDateOnly = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
);

export const SyncRunFiltersSchema = z.object({
  connectionId: csvArray(z.string().uuid()),
  cursor: z.string().optional(),
  dateFrom: optionalDateOnly,
  dateTo: optionalDateOnly,
  runType: csvArray(z.enum(syncRunTypes)),
  status: csvArray(z.enum(syncRunStatuses)),
  triggerType: csvArray(z.enum(syncTriggerTypes)),
});

export const DispatchManualSyncActionSchema = z.object({
  connectionId: z.string().uuid(),
  organisationId: z.string().uuid(),
  runType: z.enum(syncRunTypes),
});

export const CancelRunActionSchema = z.object({
  organisationId: z.string().uuid(),
  runId: z.string().uuid(),
});

export const ExportFailedRecordsCsvActionSchema = z.object({
  organisationId: z.string().uuid(),
  runId: z.string().uuid(),
});

export type SyncRunFiltersInput = z.infer<typeof SyncRunFiltersSchema>;
