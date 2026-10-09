"use client";

import type { StageStatus } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { CheckIcon, CircleAlertIcon, LoaderIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { resolveXeroPersonMatchAction } from "@/app/(authenticated)/settings/integrations/xero/matches/_actions";
import type { XeroPersonMatchView } from "@/app/(authenticated)/settings/integrations/xero/matches/_match-view";
import type { RosterPerson } from "@/lib/server/load-onboarding-people";
import {
  addPersonAction,
  advanceStepAction,
  createSelfAction,
  linkSelfAction,
} from "../_actions";
import { ImportPoller } from "./import-poller";
import { ActionError, StepHeading } from "./step-heading";

const INLINE_MATCH_LIMIT = 10;

interface PeopleStepProps {
  actingPerson: { id: string; name: string } | null;
  matches: XeroPersonMatchView[];
  mode: "manual" | "xero";
  organisationId: string;
  peopleCount: number;
  peopleStage: StageStatus;
  selfCandidates: RosterPerson[];
}

export function PeopleStep(props: PeopleStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const importing =
    props.mode === "xero" &&
    (props.peopleStage === "running" || props.peopleStage === "not_started");
  const importDone =
    props.mode === "manual" ||
    props.peopleStage === "complete" ||
    props.peopleStage === "failed";
  const canContinue =
    Boolean(props.actingPerson) && importDone && props.matches.length === 0;

  const run = (
    action: () => Promise<{ ok: boolean; error?: { message: string } }>
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error?.message ?? "Something went wrong. Try again.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      <ImportPoller active={importing} />
      <StepHeading
        description={
          props.mode === "xero"
            ? "Your people come from Xero Payroll. Confirm which one is you."
            : "Confirm your own record, then add anyone else you want on the calendar."
        }
        stepId="people"
      >
        Your people
      </StepHeading>

      {props.mode === "xero" ? (
        <ImportStatus count={props.peopleCount} stage={props.peopleStage} />
      ) : null}

      {props.matches.length > 0 ? (
        <section aria-labelledby="matches-heading" className="space-y-3">
          <h2 className="font-semibold text-title-md" id="matches-heading">
            Check possible duplicates
          </h2>
          <p className="text-body-sm text-muted-foreground">
            These Xero people look like people already in Team Calendar. Nothing
            is merged until you choose.
          </p>
          <ul className="space-y-2">
            {props.matches.slice(0, INLINE_MATCH_LIMIT).map((match) => (
              <li
                className="flex flex-col gap-3 rounded-lg bg-surface-container-low p-4 sm:flex-row sm:items-center"
                key={match.id}
              >
                <div className="min-w-0 flex-1 text-body-sm">
                  <p className="font-medium">
                    {match.xero_person.first_name} {match.xero_person.last_name}{" "}
                    <span className="text-muted-foreground">
                      ({match.xero_person.email})
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    {match.candidate_person
                      ? `Possibly ${match.candidate_person.first_name} ${match.candidate_person.last_name} (${match.candidate_person.email})`
                      : "No existing person stored for this match."}
                  </p>
                </div>
                <div className="flex gap-2">
                  {match.candidate_person ? (
                    <Button
                      disabled={isPending}
                      onClick={() =>
                        run(() =>
                          resolveXeroPersonMatchAction({
                            matchId: match.id,
                            organisationId: props.organisationId,
                            resolution: "match",
                          })
                        )
                      }
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      Same person
                    </Button>
                  ) : null}
                  <Button
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        resolveXeroPersonMatchAction({
                          matchId: match.id,
                          organisationId: props.organisationId,
                          resolution: "ignore",
                        })
                      )
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Keep separate
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {props.matches.length > INLINE_MATCH_LIMIT ? (
            <Link
              className="font-medium text-label-lg underline underline-offset-4"
              href="/settings/integrations/xero/matches"
            >
              Review all possible duplicates
            </Link>
          ) : null}
        </section>
      ) : null}

      <SelfSection
        actingPerson={props.actingPerson}
        isPending={isPending}
        onCreate={() =>
          run(() => createSelfAction({ organisationId: props.organisationId }))
        }
        onLink={(personId) =>
          run(() =>
            linkSelfAction({ organisationId: props.organisationId, personId })
          )
        }
        selfCandidates={importDone ? props.selfCandidates : []}
      />

      {props.mode === "manual" ? (
        <AddPersonForm organisationId={props.organisationId} />
      ) : null}

      <ActionError message={error} />
      <div className="space-y-2">
        <Button
          aria-busy={isPending}
          className="w-full"
          disabled={isPending || !canContinue}
          onClick={() =>
            run(() =>
              advanceStepAction({
                from: "people",
                organisationId: props.organisationId,
              })
            )
          }
          type="button"
        >
          Continue
        </Button>
        {canContinue ? null : (
          <p className="text-center text-label-md text-muted-foreground">
            {continueHint(props, importDone)}
          </p>
        )}
      </div>
    </div>
  );
}

function continueHint(props: PeopleStepProps, importDone: boolean): string {
  if (!importDone) {
    return "You can continue once people have been imported.";
  }
  if (props.matches.length > 0) {
    return "Resolve the possible duplicates to continue.";
  }
  return "Confirm your own record to continue.";
}

function ImportStatus({ count, stage }: { count: number; stage: StageStatus }) {
  let content = (
    <>
      <CheckIcon aria-hidden="true" className="size-4 text-primary" />
      {count} {count === 1 ? "person" : "people"} imported from Xero.
    </>
  );
  if (stage === "running" || stage === "not_started") {
    content = (
      <>
        <LoaderIcon
          aria-hidden="true"
          className="size-4 animate-spin motion-reduce:animate-none"
        />
        Importing people from Xero. {count} {count === 1 ? "person" : "people"}{" "}
        so far.
      </>
    );
  } else if (stage === "failed") {
    content = (
      <>
        <CircleAlertIcon aria-hidden="true" className="size-4 text-error" />
        The people import from Xero did not finish. It retries automatically;
        you can continue and review people later.
      </>
    );
  }
  return (
    <p
      aria-live="polite"
      className="flex items-start gap-2 rounded-lg bg-surface-container-low p-4 text-body-sm [&>svg]:mt-0.5 [&>svg]:shrink-0"
    >
      {content}
    </p>
  );
}

function SelfSection({
  actingPerson,
  isPending,
  onCreate,
  onLink,
  selfCandidates,
}: {
  actingPerson: { id: string; name: string } | null;
  isPending: boolean;
  onCreate: () => void;
  onLink: (personId: string) => void;
  selfCandidates: RosterPerson[];
}) {
  const [personId, setPersonId] = useState("");
  if (actingPerson) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-surface-container-low p-4 text-body-sm">
        <CheckIcon aria-hidden="true" className="size-4 text-primary" />
        You are linked to {actingPerson.name}.
      </p>
    );
  }
  return (
    <section aria-labelledby="self-heading" className="space-y-3">
      <h2 className="font-semibold text-title-md" id="self-heading">
        Which person are you?
      </h2>
      {selfCandidates.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="onboarding-self">Choose yourself</Label>
            <Select onValueChange={setPersonId} value={personId}>
              <SelectTrigger className="w-full" id="onboarding-self">
                <SelectValue placeholder="Select your name" />
              </SelectTrigger>
              <SelectContent>
                {selfCandidates.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name} ({person.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={isPending || !personId}
            onClick={() => onLink(personId)}
            type="button"
            variant="secondary"
          >
            This is me
          </Button>
        </div>
      ) : null}
      <Button
        disabled={isPending}
        onClick={onCreate}
        type="button"
        variant={selfCandidates.length > 0 ? "ghost" : "secondary"}
      >
        {selfCandidates.length > 0
          ? "I'm not listed, create my record"
          : "Create my record"}
      </Button>
    </section>
  );
}

function AddPersonForm({ organisationId }: { organisationId: string }) {
  const router = useRouter();
  const [values, setValues] = useState({
    email: "",
    firstName: "",
    lastName: "",
  });
  const [message, setMessage] = useState<{
    text: string;
    tone: "error" | "status";
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await addPersonAction({ ...values, organisationId });
      if (!result.ok) {
        setMessage({ text: result.error.message, tone: "error" });
        return;
      }
      setMessage({
        text: `${values.firstName} ${values.lastName} added.`,
        tone: "status",
      });
      setValues({ email: "", firstName: "", lastName: "" });
      router.refresh();
    });
  };

  return (
    <form
      aria-labelledby="add-person-heading"
      className="space-y-3 rounded-lg bg-surface-container-low p-4"
      onSubmit={submit}
    >
      <h2 className="font-semibold text-title-md" id="add-person-heading">
        Add someone (optional)
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="add-first-name">First name</Label>
          <Input
            id="add-first-name"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                firstName: event.target.value,
              }))
            }
            value={values.firstName}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="add-last-name">Last name</Label>
          <Input
            id="add-last-name"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                lastName: event.target.value,
              }))
            }
            value={values.lastName}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="add-email">Email</Label>
        <Input
          id="add-email"
          onChange={(event) =>
            setValues((current) => ({ ...current, email: event.target.value }))
          }
          type="email"
          value={values.email}
        />
      </div>
      {message ? (
        <p
          className={
            message.tone === "error"
              ? "text-body-sm text-destructive"
              : "text-body-sm text-muted-foreground"
          }
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
      <Button
        aria-busy={isPending}
        disabled={isPending}
        type="submit"
        variant="secondary"
      >
        Add person
      </Button>
    </form>
  );
}
