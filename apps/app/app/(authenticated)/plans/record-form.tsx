"use client";

import { getAvailabilityRecordLabel } from "@repo/core";

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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/design-system/components/ui/toggle-group";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { SubmitConfirmationModal } from "@/components/plans/submit-confirmation-modal";
import { formatLeaveBalance } from "@/lib/format-leave-balance";
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
  balanceCurrencyCode?: string | null;
  balanceUnit?: string | null;
  canSelectPerson: boolean;
  closeHref: string;
  hasActiveXeroConnection: boolean;
  mode: "create" | "edit";
  organisationId: string;
  people: PlanPersonOption[];
  record?: EditablePlanRecord;
}

type PlanIntent = "availability" | "leave";

const recordTypeDescriptions: Record<string, string> = {
  alternative_contact: "Use another contact.",
  annual_leave: "Paid annual leave.",
  another_office: "Working from another office.",
  client_site: "Working from a client site.",
  contractor_unavailable: "Contractor unavailable.",
  holiday: "Holiday leave.",
  limited_availability: "Limited availability.",
  long_service_leave: "Long service leave.",
  offsite_meeting: "Offsite meeting.",
  other: "Other availability.",
  personal_leave: "Personal or carer's leave.",
  sick_leave: "Sick leave.",
  training: "Training or development.",
  travelling: "Travelling for work.",
  unpaid_leave: "Unpaid leave.",
  wfh: "Working from home.",
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This form coordinates record type, intent, submit-path and Xero balance state in one component; the explicit conditional rendering added by noLeakedRender pushed it just over the threshold.
export function RecordForm({
  balanceAvailable,
  balanceCurrencyCode,
  balanceUnit,
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
  const errorRef = useRef<HTMLDivElement>(null);
  const [personId, setPersonId] = useState(
    record?.personId ?? people[0]?.id ?? ""
  );
  const initialRecordType = record?.recordType ?? "annual_leave";
  const [intent, setIntent] = useState<PlanIntent>(
    intentForRecordType(initialRecordType)
  );
  const [recordType, setRecordType] =
    useState<PlanRecordFormInput["recordType"]>(initialRecordType);
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
  const isXeroLeave = isXeroLeaveSelection(intent, recordType);
  const showSubmitPath = isXeroLeave && hasActiveXeroConnection;
  const primaryLabel = primarySubmitLabel(showSubmitPath, mode);
  const visibleRecordTypes = recordTypesForIntent(intent);
  const recordTypeLabels = recordTypeLabelsForIntent(intent);

  const dynamicPanel = useMemo(
    () => dynamicPanelForIntent(intent, hasActiveXeroConnection),
    [hasActiveXeroConnection, intent]
  );

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  const setPlanIntent = (value: string) => {
    if (value !== "leave" && value !== "availability") {
      return;
    }
    const nextIntent = value;
    setIntent(nextIntent);
    setRecordType(firstRecordTypeForIntent(nextIntent));
  };

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
      <div className="rounded-2xl bg-muted p-5 text-label-lg text-muted-foreground">
        Add a person profile before creating leave or availability records.
      </div>
    );
  }

  return (
    <form
      aria-busy={isPending}
      aria-describedby={error ? "plan-form-error" : undefined}
      className="relative space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const submitter =
          event.nativeEvent instanceof SubmitEvent
            ? event.nativeEvent.submitter
            : null;
        submit(
          new FormData(event.currentTarget),
          submitter instanceof HTMLButtonElement && submitter.value === "submit"
        );
      }}
    >
      <div className="rounded-2xl bg-muted p-4 text-label-lg text-muted-foreground">
        <p>{dynamicPanel}</p>
        {isXeroLeave && hasActiveXeroConnection ? (
          <p className="mt-2 font-medium text-foreground">
            {balanceAvailable === null
              ? "Balance has not synced yet. You can still save a draft before submitting."
              : `Current Xero balance: ${formatLeaveBalance({
                  amount: balanceAvailable,
                  currencyCode: balanceCurrencyCode,
                  unit: balanceUnit ?? "days",
                })} before this request.`}
          </p>
        ) : null}
      </div>

      {error ? (
        <div
          className="rounded-2xl bg-error-container p-4 text-label-lg text-on-error-container"
          id="plan-form-error"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          We could not save this plan. {error}
        </div>
      ) : null}

      <Field label="Intent" labelId="plan-intent-label">
        <ToggleGroup
          aria-labelledby="plan-intent-label"
          className="grid w-full grid-cols-2"
          onValueChange={setPlanIntent}
          type="single"
          value={intent}
          variant="outline"
        >
          <ToggleGroupItem
            className="justify-start rounded-xl px-4 py-3 text-left"
            value="leave"
          >
            <span className="flex flex-col items-start gap-1">
              <span>Leave</span>
              <span className="font-normal text-current/75 text-label-md">
                Payroll leave sent to Xero
              </span>
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem
            className="justify-start rounded-xl px-4 py-3 text-left"
            value="availability"
          >
            <span className="flex flex-col items-start gap-1">
              <span>Availability</span>
              <span className="font-normal text-current/75 text-label-md">
                Calendar-only work status
              </span>
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Person"
          labelFor={canSelectPerson ? "plan-person" : undefined}
          labelId={canSelectPerson ? undefined : "plan-person-label"}
        >
          {canSelectPerson ? (
            <Select onValueChange={setPersonId} value={personId}>
              <SelectTrigger id="plan-person">
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
            <div className="rounded-xl bg-muted p-3 text-label-lg">
              {selectedPerson?.label ?? "Current user"}
            </div>
          )}
        </Field>

        <Field label={recordTypeLabels.field} labelFor="plan-record-type">
          <Select
            onValueChange={(value) =>
              setRecordType(value as PlanRecordFormInput["recordType"])
            }
            value={recordType}
          >
            <SelectTrigger id="plan-record-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{recordTypeLabels.group}</SelectLabel>
                {visibleRecordTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {getAvailabilityRecordLabel(type)}:{" "}
                    {recordTypeDescriptions[type]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Starts" labelFor="plan-starts-at">
          <Input
            defaultValue={record?.startsAt}
            id="plan-starts-at"
            name="startsAt"
            required
            type="date"
          />
        </Field>
        <Field label="Ends" labelFor="plan-ends-at">
          <Input
            defaultValue={record?.endsAt}
            id="plan-ends-at"
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
          <Field label="Start time" labelFor="plan-start-time">
            <Input
              defaultValue={record?.startTime || "09:00"}
              id="plan-start-time"
              name="startTime"
              type="time"
            />
          </Field>
          <Field label="End time" labelFor="plan-end-time">
            <Input
              defaultValue={record?.endTime || "17:00"}
              id="plan-end-time"
              name="endTime"
              type="time"
            />
          </Field>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Contactability" labelFor="plan-contactability">
          <Select
            onValueChange={(value) =>
              setContactabilityStatus(
                value as PlanRecordFormInput["contactabilityStatus"]
              )
            }
            value={contactabilityStatus}
          >
            <SelectTrigger id="plan-contactability">
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

        <Field label="Privacy" labelFor="plan-privacy">
          <Select
            onValueChange={(value) =>
              setPrivacyMode(value as PlanRecordFormInput["privacyMode"])
            }
            value={privacyMode}
          >
            <SelectTrigger id="plan-privacy">
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

      <Field label="Notes" labelFor="plan-notes">
        <Textarea
          defaultValue={record?.notesInternal}
          id="plan-notes"
          name="notesInternal"
          placeholder="Visible inside Team Calendar only"
          rows={4}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-3">
        {showSubmitPath ? (
          <Button disabled={isPending} type="submit" variant="secondary">
            {mode === "edit" ? "Save changes" : "Save draft"}
          </Button>
        ) : null}
        <Button
          disabled={isPending}
          name="submissionMode"
          type="submit"
          value={showSubmitPath ? "submit" : "save"}
        >
          {primaryLabel}
        </Button>
      </div>

      {confirmationRecord ? (
        <SubmitConfirmationModal
          mode="submit"
          onClose={() => setConfirmationRecord(null)}
          onSuccess={() => {
            setConfirmationRecord(null);
            toast.success("Leave sent to Xero for approval.");
            router.push(closeHref);
            router.refresh();
          }}
          record={{
            balanceAvailable,
            balanceCurrencyCode,
            balanceUnit,
            endsAt: confirmationRecord.endsAt,
            id: confirmationRecord.id,
            organisationId,
            recordType: confirmationRecord.recordType,
            startsAt: confirmationRecord.startsAt,
            workingDays: confirmationRecord.workingDays,
          }}
        />
      ) : null}
    </form>
  );
}

function Field({
  children,
  label,
  labelFor,
  labelId,
}: {
  children: React.ReactNode;
  label: string;
  labelFor?: string;
  labelId?: string;
}) {
  return (
    <div className="space-y-2">
      {labelFor ? (
        <Label className="text-label-md" htmlFor={labelFor}>
          {label}
        </Label>
      ) : (
        <div className="font-medium text-label-md" id={labelId}>
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function isXeroLeaveSelection(
  intent: PlanIntent,
  recordType: PlanRecordFormInput["recordType"]
): boolean {
  return intent === "leave" && isOneOf(recordType, xeroLeaveRecordTypes);
}

function recordTypesForIntent(
  intent: PlanIntent
): readonly PlanRecordFormInput["recordType"][] {
  if (intent === "leave") {
    return xeroLeaveRecordTypes;
  }
  return localOnlyRecordTypes;
}

function firstRecordTypeForIntent(
  intent: PlanIntent
): PlanRecordFormInput["recordType"] {
  if (intent === "leave") {
    return xeroLeaveRecordTypes[0];
  }
  return localOnlyRecordTypes[0];
}

function recordTypeLabelsForIntent(intent: PlanIntent): {
  field: string;
  group: string;
} {
  if (intent === "leave") {
    return { field: "Leave type", group: "Leave types" };
  }
  return { field: "Availability type", group: "Availability" };
}

function dynamicPanelForIntent(
  intent: PlanIntent,
  hasActiveXeroConnection: boolean
): string {
  if (intent === "availability") {
    return "Saves immediately in Team Calendar. It appears on calendars and feeds without approval or Xero sync.";
  }
  if (!hasActiveXeroConnection) {
    return "Saves as approved in Team Calendar only. It appears on calendars, but it will not create payroll leave or go to Xero for approval.";
  }
  return "Saves as a draft first. Use Save and submit when you are ready to send it to Xero for manager approval.";
}

function isOneOf<T extends string>(
  value: string,
  values: readonly T[]
): value is T {
  return values.some((candidate) => candidate === value);
}

function intentForRecordType(recordType: string): PlanIntent {
  return isOneOf(recordType, localOnlyRecordTypes) ? "availability" : "leave";
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
