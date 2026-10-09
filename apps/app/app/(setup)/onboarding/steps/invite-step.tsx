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
import { CheckIcon, CircleAlertIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { RosterPerson } from "@/lib/server/load-onboarding-people";
import {
  advanceStepAction,
  type InviteOutcome,
  sendInvitesAction,
} from "../_actions";
import { ActionError, StepHeading } from "./step-heading";

type InviteRole = "org:admin" | "org:manager" | "org:viewer";

const ROLE_OPTIONS: { label: string; value: InviteRole }[] = [
  { label: "Admin", value: "org:admin" },
  { label: "Manager", value: "org:manager" },
  { label: "Viewer", value: "org:viewer" },
];

interface InviteRow {
  email: string;
  key: string;
  name: string | null;
  role: InviteRole;
  selected: boolean;
}

function rowsFromRoster(roster: RosterPerson[]): InviteRow[] {
  return roster.map((person) => ({
    email: person.email,
    key: person.id,
    name: person.name,
    role: person.hasDirectReports ? "org:manager" : "org:viewer",
    selected: true,
  }));
}

let manualRowCount = 0;
function manualRow(): InviteRow {
  manualRowCount += 1;
  return {
    email: "",
    key: `manual-${manualRowCount}`,
    name: null,
    role: "org:viewer",
    selected: true,
  };
}

export function InviteStep({
  doneHref,
  organisationId,
  roster,
}: {
  doneHref: string;
  organisationId: string;
  roster: RosterPerson[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<InviteRow[]>(() =>
    roster.length > 0 ? rowsFromRoster(roster) : [manualRow()]
  );
  const [outcomes, setOutcomes] = useState<Map<string, InviteOutcome>>(
    new Map()
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const update = (key: string, patch: Partial<InviteRow>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  const pending = rows.filter(
    (row) =>
      row.selected && row.email.trim() && !outcomes.get(row.email.trim())?.ok
  );
  const sentCount = [...outcomes.values()].filter(
    (outcome) => outcome.ok
  ).length;

  const send = () => {
    setError(null);
    startTransition(async () => {
      const result = await sendInvitesAction({
        organisationId,
        rows: pending.map((row) => ({
          email: row.email.trim(),
          role: row.role,
        })),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOutcomes((current) => {
        const next = new Map(current);
        for (const outcome of result.value.results) {
          next.set(outcome.email, outcome);
        }
        return next;
      });
    });
  };

  const advance = () => {
    setError(null);
    startTransition(async () => {
      const result = await advanceStepAction({
        from: "invites",
        organisationId,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.replace(doneHref);
    });
  };

  return (
    <div className="space-y-6">
      <StepHeading
        description="Invite managers and staff so they can see the calendar and request leave. Viewers can see the calendar, check their own balances and request leave."
        stepId="invites"
      >
        Invite your team
      </StepHeading>

      {roster.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-label-lg text-muted-foreground">
            {rows.filter((row) => row.selected).length} of {rows.length}{" "}
            selected
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                setRows((current) =>
                  current.map((row) => ({ ...row, selected: true }))
                )
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              Select all
            </Button>
            <Button
              onClick={() =>
                setRows((current) =>
                  current.map((row) => ({ ...row, selected: false }))
                )
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              Select none
            </Button>
          </div>
        </div>
      ) : null}

      <ul
        aria-label="People to invite"
        className="max-h-[28rem] space-y-2 overflow-y-auto"
      >
        {rows.map((row) => (
          <InviteRowItem
            key={row.key}
            onChange={(patch) => update(row.key, patch)}
            outcome={outcomes.get(row.email.trim())}
            row={row}
          />
        ))}
      </ul>

      <Button
        onClick={() => setRows((current) => [...current, manualRow()])}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PlusIcon aria-hidden="true" />
        Invite someone else by email
      </Button>

      <ActionError message={error} />
      {sentCount > 0 ? (
        <p className="text-body-sm text-muted-foreground" role="status">
          {sentCount} {sentCount === 1 ? "invitation" : "invitations"} sent.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        {pending.length > 0 ? (
          <Button
            aria-busy={isPending}
            className="sm:flex-1"
            disabled={isPending}
            onClick={send}
            type="button"
          >
            Send {pending.length}{" "}
            {pending.length === 1 ? "invitation" : "invitations"}
          </Button>
        ) : (
          <Button
            aria-busy={isPending}
            className="sm:flex-1"
            disabled={isPending}
            onClick={advance}
            type="button"
          >
            Continue
          </Button>
        )}
        <Button
          disabled={isPending}
          onClick={advance}
          type="button"
          variant="ghost"
        >
          {sentCount > 0 ? "Continue without the rest" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}

function InviteRowItem({
  onChange,
  outcome,
  row,
}: {
  onChange: (patch: Partial<InviteRow>) => void;
  outcome: InviteOutcome | undefined;
  row: InviteRow;
}) {
  const label = row.name ?? (row.email || "New invitation");
  return (
    <li className="grid gap-3 rounded-lg bg-surface-container-low p-3 sm:grid-cols-[auto_minmax(0,1fr)_9rem] sm:items-center">
      <Checkbox
        aria-label={`Invite ${label}`}
        checked={row.selected}
        disabled={outcome?.ok}
        onCheckedChange={(checked) => onChange({ selected: checked === true })}
      />
      <div className="min-w-0">
        {row.name ? (
          <>
            <p className="truncate font-medium text-body-sm">{row.name}</p>
            <p className="truncate text-label-md text-muted-foreground">
              {row.email}
            </p>
          </>
        ) : (
          <>
            <Label className="sr-only" htmlFor={`${row.key}-email`}>
              Email address
            </Label>
            <Input
              id={`${row.key}-email`}
              onChange={(event) => onChange({ email: event.target.value })}
              placeholder="name@example.com"
              type="email"
              value={row.email}
            />
          </>
        )}
        {outcome ? (
          <p
            className={[
              "mt-1 flex items-center gap-1 text-label-md",
              outcome.ok ? "text-muted-foreground" : "text-destructive",
            ].join(" ")}
          >
            {outcome.ok ? (
              <CheckIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <CircleAlertIcon aria-hidden="true" className="size-3.5" />
            )}
            {outcome.ok ? "Invitation sent" : outcome.reason}
          </p>
        ) : null}
      </div>
      <Select
        disabled={outcome?.ok}
        onValueChange={(value) => {
          const role = ROLE_OPTIONS.find((option) => option.value === value);
          if (role) {
            onChange({ role: role.value });
          }
        }}
        value={row.role}
      >
        <SelectTrigger aria-label={`Role for ${label}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </li>
  );
}
