"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { toast } from "@repo/design-system/components/ui/sonner";
import { useState, useTransition } from "react";
import { resolveXeroPersonMatchAction } from "./_actions";
import type { XeroPersonMatchView } from "./_match-view";

interface MatchesClientProps {
  matches: XeroPersonMatchView[];
  organisationId: string;
}

export function MatchesClient({ matches, organisationId }: MatchesClientProps) {
  const [isPending, startTransition] = useTransition();
  const [clerkUserIds, setClerkUserIds] = useState<Record<string, string>>({});

  if (matches.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>No pending matches</CardTitle>
          <CardDescription>
            Team Calendar will show possible Xero and manual person matches here
            for explicit admin review.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {matches.map((match) => (
        <Card className="rounded-2xl" key={match.id}>
          <CardHeader>
            <CardTitle>
              {match.xero_person.first_name} {match.xero_person.last_name}
            </CardTitle>
            <CardDescription>
              Xero person: {match.xero_person.email || "No email provided"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-muted/30 p-4 text-label-lg">
              <p className="font-medium">Possible match</p>
              <p className="text-muted-foreground">
                {match.candidate_person
                  ? `${match.candidate_person.first_name} ${match.candidate_person.last_name} · ${match.candidate_person.email}`
                  : "No candidate person was stored for this match."}
              </p>
            </div>

            <Input
              onChange={(event) =>
                setClerkUserIds((current) => ({
                  ...current,
                  [match.id]: event.target.value,
                }))
              }
              placeholder={
                match.candidate_person?.clerk_user_id ??
                "Enter Clerk user ID to link"
              }
              value={clerkUserIds[match.id] ?? ""}
            />

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await resolveXeroPersonMatchAction({
                      clerkUserId:
                        clerkUserIds[match.id] ??
                        match.candidate_person?.clerk_user_id ??
                        undefined,
                      matchId: match.id,
                      organisationId,
                      resolution: "match",
                    });
                    toast[result.ok ? "success" : "error"](
                      result.ok ? "Xero person linked." : result.error.message
                    );
                  })
                }
              >
                Link to Clerk user
              </Button>
              <Button
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await resolveXeroPersonMatchAction({
                      matchId: match.id,
                      organisationId,
                      resolution: "ignore",
                    });
                    toast[result.ok ? "success" : "error"](
                      result.ok
                        ? "Possible match ignored."
                        : result.error.message
                    );
                  })
                }
                variant="outline"
              >
                Keep separate
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
