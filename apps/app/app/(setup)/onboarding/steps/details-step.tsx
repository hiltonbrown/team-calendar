"use client";

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
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import {
  AU_TIMEZONES,
  type AuTimezone,
  DEFAULT_AU_TIMEZONE,
  isAuTimezone,
} from "@/lib/onboarding/au-timezones";
import { saveDetailsAction } from "../_actions";
import { ActionError, StepHeading } from "./step-heading";

export function DetailsStep({
  doneHref,
  name,
  organisationId,
  timezone,
}: {
  doneHref: string;
  name: string;
  organisationId: string;
  timezone: string | null;
}) {
  const router = useRouter();
  const [nameValue, setNameValue] = useState(name);
  const [timezoneValue, setTimezoneValue] = useState<AuTimezone>(
    isAuTimezone(timezone) ? timezone : DEFAULT_AU_TIMEZONE
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveDetailsAction({
        name: nameValue,
        organisationId,
        timezone: timezoneValue,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.replace(doneHref);
    });
  };

  return (
    <form className="space-y-6" onSubmit={submit}>
      <StepHeading
        description="These details set your calendar's dates and public holidays."
        stepId="details"
      >
        Your organisation
      </StepHeading>
      <div className="space-y-2">
        <Label htmlFor="onboarding-name">Organisation name</Label>
        <Input
          autoComplete="organization"
          id="onboarding-name"
          maxLength={128}
          onChange={(event) => setNameValue(event.target.value)}
          required
          value={nameValue}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="onboarding-country">Country</Label>
        <Input
          aria-describedby="onboarding-country-help"
          id="onboarding-country"
          readOnly
          value="Australia"
        />
        <p
          className="text-label-md text-muted-foreground"
          id="onboarding-country-help"
        >
          Team Calendar currently supports Australian Xero Payroll only.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="onboarding-timezone">Timezone</Label>
        <Select
          onValueChange={(value) => {
            if (isAuTimezone(value)) {
              setTimezoneValue(value);
            }
          }}
          value={timezoneValue}
        >
          <SelectTrigger className="w-full" id="onboarding-timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AU_TIMEZONES.map((zone) => (
              <SelectItem key={zone.value} value={zone.value}>
                {zone.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ActionError message={error} />
      <Button
        aria-busy={isPending}
        className="w-full"
        disabled={isPending || !nameValue.trim()}
        type="submit"
      >
        Continue
      </Button>
    </form>
  );
}
