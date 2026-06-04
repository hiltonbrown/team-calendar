"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
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
        <div className="rounded-2xl bg-error-container p-3 text-error text-sm">
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
        {[
          ["named", "Subscribers see names and leave types"],
          ["masked", "Subscribers see Team member with leave types"],
          ["private", "Subscribers see Unavailable only"],
        ].map(([value, label]) => (
          <label className="flex gap-2 text-sm" key={value}>
            <input
              checked={privacyMode === value}
              onChange={() =>
                setPrivacyMode(value as "masked" | "named" | "private")
              }
              type="radio"
            />
            {label}
          </label>
        ))}
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
        {[
          ["self", "Just me"],
          ["manager_team", "My team"],
          ["team", "Specific teams"],
          ["person", "Specific people"],
          ...(canCreateOrgScope ? [["org", "All of organisation"]] : []),
        ].map(([value, label]) => (
          <label className="flex gap-2 text-sm" key={value}>
            <input
              checked={scopeChoice === value}
              onChange={() => setScopeChoice(value as ScopeChoice)}
              type="radio"
            />
            {label}
          </label>
        ))}
        {scopeChoice === "team" && (
          <select className="w-full rounded-xl bg-muted p-3" name="teamId">
            <option value="">Choose team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}
        {scopeChoice === "person" && (
          <select className="w-full rounded-xl bg-muted p-3" name="personId">
            <option value="">Choose person</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        )}
      </fieldset>
      <div className="flex justify-end">
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
