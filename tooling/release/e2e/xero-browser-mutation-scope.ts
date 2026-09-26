import { z } from "zod";

const planSchema = z.strictObject({
  action: z.enum([
    "create",
    "approve",
    "decline",
    "withdraw",
    "connect",
    "disconnect",
  ]),
  dateFrom: z.iso.date(),
  dateUntil: z.iso.date(),
  employeeId: z.uuid().nullable(),
  leaveTypeId: z.uuid().nullable(),
  organisationId: z.uuid(),
  recordId: z.uuid().nullable(),
});
export type XeroBrowserMutationScope = z.infer<typeof planSchema>;
export function assertXeroBrowserMutationPage(
  address: string,
  appUrl: string,
  value: XeroBrowserMutationScope
) {
  const plan = planSchema.parse(value);
  const url = new URL(address);
  const { origin } = new URL(appUrl);
  if (
    url.origin !== origin ||
    url.searchParams.get("org") !== plan.organisationId ||
    url.hash
  ) {
    throw new Error("Browser mutation page has foreign payroll scope");
  }
  const recordPath = plan.recordId ? `/plans/${plan.recordId}` : null;
  if (plan.action === "approve" || plan.action === "decline") {
    if (
      !plan.recordId ||
      (url.pathname !== "/leave-approvals" && url.pathname !== recordPath)
    ) {
      throw new Error("Approval page has no exact owned record");
    }
  } else if (plan.action === "withdraw") {
    if (!plan.recordId || url.pathname !== recordPath) {
      throw new Error("Withdrawal page has no exact owned record");
    }
  } else if (plan.action === "create") {
    // The remote create is submitDraftRecordAction on an existing draft.
    // createRecordAction at /plans/new only persists a local draft.
    if (
      !plan.recordId ||
      url.pathname !== recordPath ||
      !plan.employeeId ||
      !plan.leaveTypeId
    ) {
      throw new Error(
        "Remote submit has no exact owned draft and payroll type"
      );
    }
  } else if (
    url.pathname !== "/settings/integrations/xero" &&
    url.pathname !== "/settings/integrations/xero/connect"
  ) {
    throw new Error("Connection page is outside the owned scope");
  }
}
export function assertXeroBrowserMutationRequest(
  value: unknown,
  scope: XeroBrowserMutationScope
) {
  const envelope = z.array(z.unknown()).length(1).parse(value);
  const payloadSchema = z.strictObject({
    organisationId: z.uuid(),
    recordId: z.uuid(),
  });
  const payload = (
    scope.action === "decline"
      ? payloadSchema.extend({ reason: z.string().min(1) })
      : payloadSchema
  ).parse(envelope[0]);
  if (
    payload.organisationId !== scope.organisationId ||
    (scope.recordId !== null && payload.recordId !== scope.recordId)
  ) {
    throw new Error(
      "Browser mutation request has foreign or missing intent scope"
    );
  }
}
