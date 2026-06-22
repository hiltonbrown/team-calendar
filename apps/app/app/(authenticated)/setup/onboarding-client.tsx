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
import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import { toast } from "@repo/design-system/components/ui/sonner";
import { useState, useTransition } from "react";
import { createOrganisationAction } from "./_actions";

const COUNTRY_OPTIONS = [
  { label: "Australia", value: "AU" },
  { label: "New Zealand", value: "NZ" },
  { label: "United Kingdom", value: "UK" },
] as const;

interface OnboardingClientProps {
  prefillName: string;
}

export const OnboardingClient = ({ prefillName }: OnboardingClientProps) => {
  const [name, setName] = useState(prefillName);
  const [countryCode, setCountryCode] = useState<"AU" | "NZ" | "UK">("AU");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await createOrganisationAction({ name, countryCode });
      if (!result.ok) {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle>Set up your organisation</CardTitle>
          <CardDescription>
            Complete your organisation profile to get started with Team
            Calendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organisation name</Label>
            <Input
              id="org-name"
              maxLength={128}
              onChange={(e) => setName(e.target.value)}
              required
              value={name}
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Country</Label>
              <p className="text-muted-foreground text-sm">
                Used to match your Xero region and configure the right public
                holidays.
              </p>
            </div>
            <RadioGroup
              className="grid gap-2 sm:grid-cols-3"
              onValueChange={(value) => {
                if (value === "AU" || value === "NZ" || value === "UK") {
                  setCountryCode(value);
                }
              }}
              value={countryCode}
            >
              {COUNTRY_OPTIONS.map((option) => (
                <div
                  className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3 text-sm"
                  key={option.value}
                >
                  <RadioGroupItem
                    id={`country-${option.value}`}
                    value={option.value}
                  />
                  <Label htmlFor={`country-${option.value}`}>
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="flex justify-end">
            <Button disabled={isPending || !name.trim()} onClick={handleSubmit}>
              {isPending ? "Setting up..." : "Get started"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};
