"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { toast } from "@repo/design-system/components/ui/sonner";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createManualAvailabilityAction,
  type ManualAvailabilityActionInput,
  updateManualAvailabilityAction,
} from "@/app/actions/availability/manual";
import { withOrg } from "@/lib/navigation/org-url";

type Contactability = ManualAvailabilityActionInput["contactability"];
type PrivacyMode = ManualAvailabilityActionInput["privacyMode"];
type RecordType = ManualAvailabilityActionInput["recordType"];

export interface ManualAvailabilityFormPerson {
  email: string;
  firstName: string;
  id: string;
  lastName: string;
}

export interface ManualAvailabilityFormRecord {
  allDay: boolean;
  contactability: "contactable" | "limited" | "unavailable";
  endsAt: string;
  id: string;
  includeInFeed: boolean;
  notesInternal: string;
  personId: string;
  privacyMode: "named" | "masked" | "private";
  recordType: "client_site" | "leave" | "training" | "travel" | "wfh";
  startsAt: string;
  title: string;
  workingLocation: string;
}

interface ManualAvailabilityFormProps {
  mode: "create" | "edit";
  onSaved?: () => void;
  organisationId: string;
  orgQueryValue?: null | string;
  people: ManualAvailabilityFormPerson[];
  record?: ManualAvailabilityFormRecord;
  redirectTo?: string;
}

const recordTypeOptions: { label: string; value: RecordType }[] = [
  { value: "leave", label: "Leave" },
  { value: "wfh", label: "Working from home" },
  { value: "travel", label: "Travel" },
  { value: "training", label: "Training" },
  { value: "client_site", label: "Client site" },
];

const contactabilityOptions: { label: string; value: Contactability }[] = [
  { value: "contactable", label: "Contactable" },
  { value: "limited", label: "Limited contact" },
  { value: "unavailable", label: "Unavailable" },
];

const privacyOptions: { label: string; value: PrivacyMode }[] = [
  { value: "named", label: "Show details" },
  { value: "masked", label: "Mask details" },
  { value: "private", label: "Private busy block" },
];

export function ManualAvailabilityForm({
  mode,
  onSaved,
  organisationId,
  orgQueryValue,
  people,
  record,
  redirectTo,
}: ManualAvailabilityFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [personId, setPersonId] = useState(
    record?.personId ?? people[0]?.id ?? ""
  );
  const [recordType, setRecordType] = useState<RecordType>(
    record?.recordType ?? "wfh"
  );
  const [contactability, setContactability] = useState<Contactability>(
    record?.contactability ?? "contactable"
  );
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>(
    record?.privacyMode ?? "named"
  );
  const [allDay, setAllDay] = useState(record?.allDay ?? true);
  const [includeInFeed, setIncludeInFeed] = useState(
    record?.includeInFeed ?? true
  );
  const submitLabel = getSubmitLabel(isPending, mode);

  const handleSubmit = (formData: FormData) => {
    const input: ManualAvailabilityActionInput = {
      allDay,
      contactability,
      endsAt: String(formData.get("endsAt") ?? ""),
      includeInFeed,
      notesInternal: String(formData.get("notesInternal") ?? ""),
      organisationId,
      personId,
      preferredContactMethod: "",
      privacyMode,
      recordType,
      startsAt: String(formData.get("startsAt") ?? ""),
      title: String(formData.get("title") ?? ""),
      workingLocation: String(formData.get("workingLocation") ?? ""),
    };

    startTransition(async () => {
      const result =
        mode === "edit" && record
          ? await updateManualAvailabilityAction(record.id, input)
          : await createManualAvailabilityAction(input);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        mode === "edit" ? "Availability updated" : "Availability created"
      );
      onSaved?.();
      router.refresh();

      if (redirectTo) {
        router.push(withOrg(redirectTo, orgQueryValue));
      }
    });
  };

  if (people.length === 0) {
    return (
      <div className="rounded-2xl bg-muted p-5 text-muted-foreground text-sm">
        Add at least one person before creating availability.
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Person">
          <Select onValueChange={setPersonId} value={personId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a person" />
            </SelectTrigger>
            <SelectContent>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Type">
          <Select
            onValueChange={(value) => setRecordType(normaliseRecordType(value))}
            value={recordType}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recordTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Title">
        <Input
          defaultValue={record?.title}
          maxLength={200}
          name="title"
          placeholder="Working from home, client workshop, annual leave"
          required
        />
      </Field>

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

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Contactability">
          <Select
            onValueChange={(value) =>
              setContactability(normaliseContactability(value))
            }
            value={contactability}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contactabilityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Feed privacy">
          <Select
            onValueChange={(value) =>
              setPrivacyMode(normalisePrivacyMode(value))
            }
            value={privacyMode}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {privacyOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Working location">
        <Input
          defaultValue={record?.workingLocation}
          name="workingLocation"
          placeholder="Brisbane, home, client site"
        />
      </Field>

      <Field label="Internal notes">
        <Textarea
          defaultValue={record?.notesInternal}
          name="notesInternal"
          placeholder="Visible inside LeaveSync only"
          rows={4}
        />
      </Field>

      <div className="grid gap-3 rounded-2xl bg-muted p-4">
        <div className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={allDay}
            id="all-day"
            onCheckedChange={(checked) => setAllDay(checked === true)}
          />
          <Label htmlFor="all-day">All-day availability</Label>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={includeInFeed}
            id="include-in-feed"
            onCheckedChange={(checked) => setIncludeInFeed(checked === true)}
          />
          <Label htmlFor="include-in-feed">Include in calendar feeds</Label>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button disabled={isPending} type="submit">
          {submitLabel}
        </Button>
      </div>
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
      <Label className="text-[0.8125rem]">{label}</Label>
      {children}
    </div>
  );
}

function normaliseRecordType(value: string): RecordType {
  switch (value) {
    case "client_site":
    case "leave":
    case "training":
    case "travel":
    case "wfh":
      return value;
    default:
      return "wfh";
  }
}

function normaliseContactability(value: string): Contactability {
  switch (value) {
    case "limited":
    case "unavailable":
    case "contactable":
      return value;
    default:
      return "contactable";
  }
}

function normalisePrivacyMode(value: string): PrivacyMode {
  switch (value) {
    case "masked":
    case "private":
    case "named":
      return value;
    default:
      return "named";
  }
}

function getSubmitLabel(isPending: boolean, mode: "create" | "edit"): string {
  if (isPending) {
    return "Saving...";
  }
  if (mode === "edit") {
    return "Save changes";
  }
  return "Create availability";
}
