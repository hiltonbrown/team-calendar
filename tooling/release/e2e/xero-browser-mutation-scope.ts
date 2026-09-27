import { z } from "zod";

const planSchema = z
  .strictObject({
    action: z.enum([
      "create",
      "approve",
      "decline",
      "withdraw",
      "connect",
      "disconnect",
    ]),
    confirmationText: z.string().min(1).nullable().optional(),
    connectionId: z.uuid().nullable().optional(),
    dateFrom: z.iso.date(),
    dateUntil: z.iso.date(),
    disconnectMode: z.enum(["destructive", "soft"]).nullable().optional(),
    employeeId: z.uuid().nullable(),
    leaveTypeId: z.uuid().nullable(),
    organisationId: z.uuid(),
    recordId: z.uuid().nullable(),
  })
  .superRefine((scope, context) => {
    const connectionAction =
      scope.action === "connect" || scope.action === "disconnect";
    if (connectionAction ? scope.recordId !== null : scope.recordId === null) {
      context.addIssue({
        code: "custom",
        message: "Action requires its exact resource scope",
      });
    }
    if (scope.action === "disconnect") {
      if (
        !(scope.connectionId && scope.disconnectMode && scope.confirmationText)
      ) {
        context.addIssue({
          code: "custom",
          message: "Disconnect requires exact private metadata",
        });
      }
    } else if (
      scope.connectionId ||
      scope.disconnectMode ||
      scope.confirmationText
    ) {
      context.addIssue({
        code: "custom",
        message: "Connection metadata is only valid for disconnect",
      });
    }
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
    url.searchParams.getAll("org").length !== 1 ||
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
    (plan.action !== "connect" ||
      url.pathname !== "/settings/integrations/xero/connect")
  ) {
    throw new Error("Connection page is outside the owned scope");
  }
}
export function assertXeroBrowserMutationRequest(
  value: unknown,
  scope: XeroBrowserMutationScope
) {
  const plan = planSchema.parse(scope);
  const envelope = z.array(z.unknown()).length(1).parse(value);
  const organisationSchema = z.strictObject({ organisationId: z.uuid() });
  if (plan.action === "connect") {
    const payload = organisationSchema.parse(envelope[0]);
    if (payload.organisationId !== plan.organisationId) {
      throw new Error("Browser connect request has foreign payroll scope");
    }
    return;
  }
  if (plan.action === "disconnect") {
    const payload = organisationSchema
      .extend({
        confirmationText: z.string().min(1),
        connectionId: z.uuid(),
        mode: z.enum(["destructive", "soft"]),
      })
      .parse(envelope[0]);
    if (
      payload.organisationId !== plan.organisationId ||
      payload.connectionId !== plan.connectionId ||
      payload.mode !== plan.disconnectMode ||
      payload.confirmationText !== plan.confirmationText
    ) {
      throw new Error(
        "Browser disconnect request disagrees with private intent metadata"
      );
    }
    return;
  }
  const payloadSchema = organisationSchema.extend({ recordId: z.uuid() });
  const payload = (
    plan.action === "decline"
      ? payloadSchema.extend({ reason: z.string().trim().min(1) })
      : payloadSchema
  ).parse(envelope[0]);
  if (
    payload.organisationId !== plan.organisationId ||
    payload.recordId !== plan.recordId
  ) {
    throw new Error(
      "Browser mutation request has foreign or missing intent scope"
    );
  }
}
