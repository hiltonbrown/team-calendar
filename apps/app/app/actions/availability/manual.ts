"use server";

import { currentUser } from "@repo/auth/server";
import {
  archiveManualAvailability,
  createManualAvailability,
  updateManualAvailability,
} from "@repo/availability";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";

const ManualAvailabilityActionSchema = z.object({
  allDay: z.boolean().default(true),
  contactability: z.enum(["contactable", "limited", "unavailable"]),
  endsAt: z.string().min(1),
  includeInFeed: z.boolean().default(true),
  notesInternal: z.string().optional(),
  organisationId: z.string().uuid(),
  personId: z.string().uuid(),
  preferredContactMethod: z.string().optional(),
  privacyMode: z.enum(["named", "masked", "private"]),
  recordType: z.enum(["leave", "wfh", "travel", "training", "client_site"]),
  startsAt: z.string().min(1),
  title: z.string().min(1).max(200),
  workingLocation: z.string().optional(),
});

const RecordActionSchema = z.object({
  organisationId: z.string().uuid(),
  recordId: z.string().uuid(),
});

export type ManualAvailabilityActionInput = z.infer<
  typeof ManualAvailabilityActionSchema
>;

export type AvailabilityActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export async function createManualAvailabilityAction(
  input: ManualAvailabilityActionInput
): Promise<AvailabilityActionResult> {
  const parsed = ManualAvailabilityActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid availability record",
    };
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return { ok: false, error: contextResult.error.message };
  }

  const user = await currentUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  const result = await createManualAvailability(
    contextResult.value,
    toServiceInput(parsed.data),
    user.id
  );

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  revalidateAvailabilityPaths();
  return { ok: true, id: result.value.id };
}

export async function updateManualAvailabilityAction(
  recordId: string,
  input: ManualAvailabilityActionInput
): Promise<AvailabilityActionResult> {
  const recordParsed = z.string().uuid().safeParse(recordId);
  if (!recordParsed.success) {
    return { ok: false, error: "Invalid availability record" };
  }

  const parsed = ManualAvailabilityActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid availability record",
    };
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return { ok: false, error: contextResult.error.message };
  }

  const user = await currentUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  const result = await updateManualAvailability(
    contextResult.value,
    recordParsed.data,
    toServiceInput(parsed.data),
    user.id
  );

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  revalidateAvailabilityPaths();
  return { ok: true, id: result.value.id };
}

export async function archiveManualAvailabilityAction(
  input: z.infer<typeof RecordActionSchema>
): Promise<AvailabilityActionResult> {
  const parsed = RecordActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid availability record" };
  }

  const contextResult = await getActiveOrgContext(parsed.data.organisationId);
  if (!contextResult.ok) {
    return { ok: false, error: contextResult.error.message };
  }

  const user = await currentUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  const result = await archiveManualAvailability(
    contextResult.value,
    parsed.data.recordId,
    user.id
  );

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  revalidateAvailabilityPaths();
  return { ok: true };
}

function toServiceInput(input: ManualAvailabilityActionInput) {
  return {
    ...input,
    endsAt: new Date(input.endsAt),
    notesInternal: emptyToUndefined(input.notesInternal),
    preferredContactMethod: emptyToUndefined(input.preferredContactMethod),
    startsAt: new Date(input.startsAt),
    workingLocation: emptyToUndefined(input.workingLocation),
  };
}

function emptyToUndefined(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function revalidateAvailabilityPaths(): void {
  for (const path of ["/", "/plans", "/availability", "/calendar", "/people"]) {
    revalidatePath(path);
  }
}
