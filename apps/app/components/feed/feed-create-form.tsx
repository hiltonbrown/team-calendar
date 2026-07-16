"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createFeedAction } from "@/app/(authenticated)/feeds/_actions";
import { useFeedTokenSession } from "@/app/(authenticated)/feeds/feed-token-session";
import { OneTimeTokenPanel } from "./one-time-token-panel";

type ScopeChoice = "manager_team" | "org" | "person" | "self" | "team";

export function FeedCreateForm({
  canCreateOrgScope,
  organisationId,
  people,
  teams,
}: {
  canCreateOrgScope: boolean;
  organisationId: string;
  people: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const tokenSession = useFeedTokenSession();
  const [scopeChoice, setScopeChoice] = useState<ScopeChoice>("self");
  const [privacyMode, setPrivacyMode] = useState<
    "masked" | "named" | "private"
  >("named");
  const [includeHolidays, setIncludeHolidays] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    feedId: string;
    plaintext: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    setError(null);
    const scopes = scopePayload(scopeChoice, formData);
    if (scopes.length === 0) {
      setError("Choose at least one scope.");
      return;
    }
    startTransition(async () => {
      const result = await createFeedAction({
        description: String(formData.get("description") ?? ""),
        includesPublicHolidays: includeHolidays,
        name: String(formData.get("name") ?? ""),
        organisationId,
        privacyMode,
        scopes,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      tokenSession.setToken(result.value.feedId, result.value.token.plaintext);
      setCreated({
        feedId: result.value.feedId,
        plaintext: result.value.token.plaintext,
      });
    });
  };

  if (created) {
    return (
      <OneTimeTokenPanel
        feedId={created.feedId}
        onDone={() => {
          tokenSession.clearToken(created.feedId);
          router.push(`/feeds/${created.feedId}`);
        }}
        origin={tokenSession.origin}
        plaintext={created.plaintext}
      />
    );
  }

  return (
    <form action={submit} className="space-y-5">
      {error && (
        <div className="rounded-2xl bg-error-container p-3 text-on-error-container text-sm">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="feed-name">Name</Label>
        <Input id="feed-name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="feed-description">Description</Label>
        <Textarea id="feed-description" name="description" />
      </div>
      <fieldset className="space-y-2">
        <legend className="font-medium text-sm">Privacy mode</legend>
        <RadioGroup
          onValueChange={(value) =>
            setPrivacyMode(value as "masked" | "named" | "private")
          }
          value={privacyMode}
        >
          {[
            ["named", "Subscribers see names and leave types"],
            ["masked", "Subscribers see Team member with leave types"],
            ["private", "Subscribers see Unavailable only"],
          ].map(([value, label]) => (
            <div className="flex items-center gap-2 text-sm" key={value}>
              <RadioGroupItem id={`privacy-${value}`} value={value} />
              <Label className="font-normal" htmlFor={`privacy-${value}`}>
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-muted p-3 text-sm">
        <Label htmlFor="include-public-holidays">Include public holidays</Label>
        <Switch
          checked={includeHolidays}
          id="include-public-holidays"
          onCheckedChange={setIncludeHolidays}
        />
      </div>
      <fieldset className="space-y-3">
        <legend className="font-medium text-sm">Scope</legend>
        <RadioGroup
          onValueChange={(value) => setScopeChoice(value as ScopeChoice)}
          value={scopeChoice}
        >
          {[
            ["self", "Just me"],
            ["manager_team", "My team"],
            ["team", "Specific teams"],
            ["person", "Specific people"],
            ...(canCreateOrgScope ? [["org", "All of organisation"]] : []),
          ].map(([value, label]) => (
            <div className="flex items-center gap-2 text-sm" key={value}>
              <RadioGroupItem id={`scope-${value}`} value={value} />
              <Label className="font-normal" htmlFor={`scope-${value}`}>
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {scopeChoice === "team" && (
          <Select name="teamId">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Choose team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {scopeChoice === "person" && (
          <Select name="personId">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Choose person" />
            </SelectTrigger>
            <SelectContent>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button onClick={() => router.back()} type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={isPending} type="submit">
          {isPending ? "Creating" : "Create feed"}
        </Button>
      </div>
    </form>
  );
}

function scopePayload(choice: ScopeChoice, formData: FormData) {
  if (choice === "team") {
    const teamId = String(formData.get("teamId") ?? "");
    return teamId ? [{ scopeType: "team" as const, scopeValue: teamId }] : [];
  }
  if (choice === "person") {
    const personId = String(formData.get("personId") ?? "");
    return personId
      ? [{ scopeType: "person" as const, scopeValue: personId }]
      : [];
  }
  return [{ scopeType: choice, scopeValue: null }];
}
