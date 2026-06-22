"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { toast } from "@repo/design-system/components/ui/sonner";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SubmitConfirmationModal } from "@/components/plans/submit-confirmation-modal";
import {
  createRecordAction,
  type PlanActionResult,
  updateRecordAction,
} from "./_actions";
import {
  localOnlyRecordTypes,
  type PlanRecordFormInput,
  PlanRecordFormSchema,
  xeroLeaveRecordTypes,
} from "./_schemas";

interface PlanPersonOption {
  email: string;
  id: string;
  label: string;
}

interface EditablePlanRecord {
  allDay: boolean;
  contactabilityStatus: PlanRecordFormInput["contactabilityStatus"];
  endsAt: string;
  endTime: string;
  id?: string;
  notesInternal: string;
  personId: string;
  privacyMode: PlanRecordFormInput["privacyMode"];
  recordType: PlanRecordFormInput["recordType"];
  startsAt: string;
  startTime: string;
}

interface RecordFormProps {
  balanceAvailable: number | null;
  canSelectPerson: boolean;
  closeHref: string;
  hasActiveXeroConnection: boolean;
  mode: "create" | "edit";
  organisationId: string;
  people: PlanPersonOption[];
  record?: EditablePlanRecord;
}

const recordTypeDescriptions: Record<string, string> = {
  annual_leave: "Paid annual leave.",
  personal_leave: "Personal or carer's leave.",
  sick_leave: "Sick leave.",
  long_service_leave: "Long service leave.",
  unpaid_leave: "Unpaid leave.",
  holiday: "Holiday leave.",
  wfh: "Working from home.",
  travelling: "Travelling for work.",
  client_site: "Working from a client site.",
  another_office: "Working from another office.",
  training: "Training or development.",
  offsite_meeting: "Offsite meeting.",
  contractor_unavailable: "Contractor unavailable.",
  limited_availability: "Limited availability.",
  alternative_contact: "Use another contact.",
  other: "Other availability.",
};

export function RecordForm({
  balanceAvailable,
  canSelectPerson,
  closeHref,
  hasActiveXeroConnection,
  mode,
  organisationId,
  people,
  record,
}: RecordFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [personId, setPersonId] = useState(
    record?.personId ?? people[0]?.id ?? ""
  );
  const [recordType, setRecordType] = useState<
    PlanRecordFormInput["recordType"]
  >(record?.recordType ?? "annual_leave");
  const [contactabilityStatus, setContactabilityStatus] = useState<
    PlanRecordFormInput["contactabilityStatus"]
  >(record?.contactabilityStatus ?? "contactable");
  const [privacyMode, setPrivacyMode] = useState<
    PlanRecordFormInput["privacyMode"]
  >(record?.privacyMode ?? "named");
  const [allDay, setAllDay] = useState(record?.allDay ?? true);
  const [confirmationRecord, setConfirmationRecord] = useState<{
    endsAt: string;
    id: string;
    recordType: string;
    startsAt: string;
    workingDays: number | null;
  } | null>(null);

  const selectedPerson = people.find((person) => person.id === personId);
  const isXeroLeave = isOneOf(recordType, xeroLeaveRecordTypes);
  const isLocalOnly = isOneOf(recordType, localOnlyRecordTypes);
  const showSubmitPath = isXeroLeave && hasActiveXeroConnection;
  const primaryLabel = primarySubmitLabel(showSubmitPath, mode);

  const dynamicPanel = useMemo(() => {
    if (isLocalOnly) {
      return "Saves as approved and appears on your calendar immediately.";
    }
    if (!hasActiveXeroConnection) {
      return "Saves as approved. Xero is not connected, so this plan will not sync to payroll.";
    }
    return "Saves as draft. Next step: submit for approval.";
  }, [hasActiveXeroConnection, isLocalOnly]);

  const submit = (formData: FormData, submitAfterSave: boolean) => {
    const input: PlanRecordFormInput = {
      allDay,
      contactabilityStatus,
      endsAt: String(formData.get("endsAt") ?? ""),
      endTime: String(formData.get("endTime") ?? ""),
      notesInternal: String(formData.get("notesInternal") ?? ""),
      organisationId,
      personId,
      privacyMode,
      recordType,
      startsAt: String(formData.get("startsAt") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
    };

    const parsed = PlanRecordFormSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid plan record");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await saveRecord(mode, record, parsed.data);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      if (submitAfterSave) {
        setConfirmationRecord({
          endsAt: parsed.data.endsAt,
          id: result.value.id,
          recordType: parsed.data.recordType,
          startsAt: parsed.data.startsAt,
          workingDays: estimateWorkingDays(
            parsed.data.startsAt,
            parsed.data.endsAt
          ),
        });
        return;
      }

      router.push(closeHref);
      router.refresh();
    });
  };

  if (people.length === 0) {
    return (
      <div className="rounded-2xl bg-muted p-5 text-muted-foreground text-sm">
        Add at least one person before creating records.
      </div>
    );
  }

  return (
    <form
      action={(formData) => submit(formData, false)}
      className="relative space-y-5"
    >
      <div className="rounded-2xl bg-muted p-4 text-muted-foreground text-sm">
        <p>{dynamicPanel}</p>
        {isXeroLeave && hasActiveXeroConnection && (
          <p className="mt-2 font-medium text-foreground">
            {balanceAvailable === null
              ? "Balance unavailable. Last sync: never."
              : `Current balance: ${balanceAvailable} days.`}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-2xl bg-muted p-4 text-muted-foreground text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Person">
          {canSelectPerson ? (
            <Select onValueChange={setPersonId} value={personId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a person" />
              </SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-xl bg-muted p-3 text-sm">
              {selectedPerson?.label ?? "Current user"}
            </div>
          )}
        </Field>

        <Field label="Plan type">
          <Select
            onValueChange={(value) =>
              setRecordType(value as PlanRecordFormInput["recordType"])
            }
            value={recordType}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Leave types</SelectLabel>
                {xeroLeaveRecordTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {labelForType(type)}: {recordTypeDescriptions[type]}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Availability</SelectLabel>
                {localOnlyRecordTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {labelForType(type)}: {recordTypeDescriptions[type]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Starts">
          <Input
            defaultValue={record?.startsAt}
            name="startsAt"
            required
            type="date"
          />
        </Field>
        <Field label="Ends">
          <Input
            defaultValue={record?.endsAt}
            name="endsAt"
            required
            type="date"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
        <Checkbox
          checked={allDay}
          id="allDay"
          onCheckedChange={(checked) => setAllDay(checked === true)}
        />
        <Label htmlFor="allDay">All day</Label>
      </div>

      {!allDay && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Start time">
            <Input
              defaultValue={record?.startTime || "09:00"}
              name="startTime"
              type="time"
            />
          </Field>
          <Field label="End time">
            <Input
              defaultValue={record?.endTime || "17:00"}
              name="endTime"
              type="time"
            />
          </Field>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Contactability">
          <Select
            onValueChange={(value) =>
              setContactabilityStatus(
                value as PlanRecordFormInput["contactabilityStatus"]
              )
            }
            value={contactabilityStatus}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contactable">Contactable</SelectItem>
              <SelectItem value="limited">Limited contact</SelectItem>
              <SelectItem value="unavailable">Unavailable</SelectItem>
              <SelectItem value="use_alternative_contact">
                Use alternative contact
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Privacy">
          <Select
            onValueChange={(value) =>
              setPrivacyMode(value as PlanRecordFormInput["privacyMode"])
            }
            value={privacyMode}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="named">Show name</SelectItem>
              <SelectItem value="masked">Masked details</SelectItem>
              <SelectItem value="private">Private busy block</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Notes">
        <Textarea
          defaultValue={record?.notesInternal}
          name="notesInternal"
          placeholder="Visible inside Team Calendar only"
          rows={4}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-3">
        {showSubmitPath && (
          <Button disabled={isPending} type="submit" variant="secondary">
            {mode === "edit" ? "Save changes" : "Save draft"}
          </Button>
        )}
        <Button
          disabled={isPending}
          formAction={
            showSubmitPath ? (formData) => submit(formData, true) : undefined
          }
          type="submit"
        >
          {primaryLabel}
        </Button>
      </div>

      {confirmationRecord && (
        <SubmitConfirmationModal
          inline
          mode="submit"
          onClose={() => setConfirmationRecord(null)}
          onSuccess={() => {
            setConfirmationRecord(null);
            toast.success("Leave submitted for approval.");
            router.push(closeHref);
            router.refresh();
          }}
          record={{
            balanceAvailable,
            endsAt: confirmationRecord.endsAt,
            id: confirmationRecord.id,
            organisationId,
            recordType: confirmationRecord.recordType,
            startsAt: confirmationRecord.startsAt,
            workingDays: confirmationRecord.workingDays,
          }}
        />
      )}
    </form>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function labelForType(recordType: string): string {
  return recordType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isOneOf<T extends string>(
  value: string,
  values: readonly T[]
): value is T {
  return values.some((candidate) => candidate === value);
}

function isUnchanged(
  record: EditablePlanRecord,
  input: PlanRecordFormInput
): boolean {
  return (
    record.allDay === input.allDay &&
    record.contactabilityStatus === input.contactabilityStatus &&
    record.endsAt === input.endsAt &&
    record.endTime === (input.endTime ?? "") &&
    record.notesInternal === (input.notesInternal ?? "") &&
    record.personId === input.personId &&
    record.privacyMode === input.privacyMode &&
    record.recordType === input.recordType &&
    record.startsAt === input.startsAt &&
    record.startTime === (input.startTime ?? "")
  );
}

function primarySubmitLabel(
  showSubmitPath: boolean,
  mode: RecordFormProps["mode"]
): string {
  if (showSubmitPath) {
    return "Save and submit";
  }
  if (mode === "edit") {
    return "Save changes";
  }
  return "Save";
}

async function saveRecord(
  mode: RecordFormProps["mode"],
  record: EditablePlanRecord | undefined,
  input: PlanRecordFormInput
): Promise<PlanActionResult<{ id: string }>> {
  if (mode === "edit" && record?.id) {
    if (isUnchanged(record, input)) {
      return { ok: true, value: { id: record.id } };
    }
    return await updateRecordAction({ ...input, recordId: record.id });
  }
  return await createRecordAction(input);
}

function estimateWorkingDays(startsAt: string, endsAt: string): number | null {
  const start = new Date(`${startsAt}T00:00:00.000Z`);
  const end = new Date(`${endsAt}T00:00:00.000Z`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return null;
  }

  let count = 0;
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
  }
  return count;
}
