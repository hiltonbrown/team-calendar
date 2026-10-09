"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardContent } from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";
import { withOrg } from "@/lib/navigation/org-url";
import { SettingsSectionHeader } from "../components/settings-section-header";
import { updateTeamCoverageMinimumAction } from "./_actions";

export interface CoverageTeam {
  activePeopleCount: number;
  id: string;
  minimumAvailablePeople: number | null;
  name: string;
}

interface CoverageSettingsClientProps {
  organisationId: string;
  teams: CoverageTeam[];
}

const peopleLabel = (count: number) =>
  `${count} ${count === 1 ? "person" : "people"}`;

export const CoverageSettingsClient = ({
  organisationId,
  teams,
}: CoverageSettingsClientProps) => {
  const [receipt, setReceipt] = useState("");

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Set how many people each team needs available on a working day. Managers see shortfalls on their dashboard."
        title="Coverage"
      />

      <p aria-live="polite" className="sr-only" role="status">
        {receipt}
      </p>

      {teams.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="space-y-3">
            <p className="text-body-sm text-muted-foreground">
              No teams yet. Teams come from your people records.
            </p>
            <Button asChild variant="secondary">
              <Link href={withOrg("/people", organisationId)}>Open People</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl">
          <CardContent className="space-y-2">
            <ul className="space-y-2">
              {teams.map((team) => (
                <CoverageTeamRow
                  key={team.id}
                  onSaved={setReceipt}
                  organisationId={organisationId}
                  team={team}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

function CoverageTeamRow({
  onSaved,
  organisationId,
  team,
}: {
  onSaved: (message: string) => void;
  organisationId: string;
  team: CoverageTeam;
}) {
  const [value, setValue] = useState(
    team.minimumAvailablePeople === null
      ? ""
      : String(team.minimumAvailablePeople)
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputId = `coverage-minimum-${team.id}`;
  const errorId = `${inputId}-error`;

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    const minimum = trimmed === "" ? null : Number(trimmed);
    setError(null);
    startTransition(async () => {
      const result = await updateTeamCoverageMinimumAction({
        minimum,
        organisationId,
        teamId: team.id,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onSaved(result.value.message);
    });
  };

  return (
    <li className="rounded-xl bg-muted/30 p-3">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6"
        // The service's message names the valid range; native bubbles do not.
        noValidate
        onSubmit={save}
      >
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-label-lg">{team.name}</p>
          <p className="text-body-sm text-muted-foreground tabular-nums">
            Team size: {peopleLabel(team.activePeopleCount)}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={inputId}>
            Minimum people in
            <span className="sr-only"> for {team.name}</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              className="w-24 tabular-nums"
              disabled={isPending}
              id={inputId}
              inputMode="numeric"
              max={team.activePeopleCount}
              min={0}
              onChange={(event) => setValue(event.target.value)}
              placeholder="None"
              step={1}
              type="number"
              value={value}
            />
            <Button
              aria-label={`Save ${team.name}`}
              disabled={isPending}
              type="submit"
              variant="secondary"
            >
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          {error ? (
            <p
              className="flex items-start gap-1.5 text-destructive text-label-md"
              id={errorId}
              role="alert"
            >
              <AlertCircleIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </li>
  );
}
