"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
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
import { toast } from "@repo/design-system/components/ui/sonner";
import { useMemo, useState, useTransition } from "react";
import { SettingsSectionHeader } from "../components/settings-section-header";
import { updateAccountNameAction, updateOrganisationAction } from "./_actions";

const COUNTRY_OPTIONS = [
  { label: "Australia", value: "AU" },
  { label: "New Zealand", value: "NZ" },
  { label: "United Kingdom", value: "UK" },
] as const;

const REGION_OPTIONS: Record<
  string,
  Array<{ label: string; value: string }>
> = {
  AU: [
    { label: "Australian Capital Territory", value: "ACT" },
    { label: "New South Wales", value: "NSW" },
    { label: "Northern Territory", value: "NT" },
    { label: "Queensland", value: "QLD" },
    { label: "South Australia", value: "SA" },
    { label: "Tasmania", value: "TAS" },
    { label: "Victoria", value: "VIC" },
    { label: "Western Australia", value: "WA" },
  ],
  NZ: [
    { label: "Auckland", value: "AUK" },
    { label: "Canterbury", value: "CAN" },
    { label: "Otago", value: "OTA" },
    { label: "Wellington", value: "WGN" },
  ],
  UK: [
    { label: "England", value: "ENG" },
    { label: "Northern Ireland", value: "NIR" },
    { label: "Scotland", value: "SCT" },
    { label: "Wales", value: "WLS" },
  ],
};

const TIMEZONE_OPTIONS = [
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
  "Europe/London",
];

interface GeneralClientProps {
  account: {
    name: string;
    slug: null | string;
  };
  organisation: {
    countryCode: "AU" | "NZ" | "UK";
    id: string;
    name: string;
    regionCode: null | string;
    timezone: string;
  };
}

export const GeneralClient = ({
  organisation,
  account,
}: GeneralClientProps) => {
  const [accountName, setAccountName] = useState(account.name);
  const [organisationName, setOrganisationName] = useState(organisation.name);
  const [confirmCountryChange, setConfirmCountryChange] = useState(false);
  const [countryCode, setCountryCode] = useState(organisation.countryCode);
  const [regionCode, setRegionCode] = useState(organisation.regionCode ?? "");
  const [timezone, setTimezone] = useState(organisation.timezone);
  const [savingAccount, startAccountTransition] = useTransition();
  const [savingOrganisation, startOrganisationTransition] = useTransition();

  const regionOptions = useMemo(
    () => REGION_OPTIONS[countryCode] ?? [],
    [countryCode]
  );
  const countryChanged = countryCode !== organisation.countryCode;

  const saveAccount = () => {
    startAccountTransition(async () => {
      const result = await updateAccountNameAction({
        name: accountName,
        organisationId: organisation.id,
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      toast.success("Account name updated.");
    });
  };

  const saveOrganisation = () => {
    startOrganisationTransition(async () => {
      const result = await updateOrganisationAction({
        confirmationCountryChange: confirmCountryChange,
        countryCode,
        name: organisationName,
        organisationId: organisation.id,
        regionCode: regionCode || null,
        timezone,
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      toast.success("Organisation settings updated.");
    });
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Manage account identity and payroll entity defaults."
        title="General"
      />

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Account name is managed in Clerk. The slug is fixed when the account
            is created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-name">Account name</Label>
            <Input
              id="account-name"
              onChange={(event) => setAccountName(event.target.value)}
              value={accountName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-slug">Account slug</Label>
            <Input
              disabled
              id="account-slug"
              value={account.slug ?? "Not available"}
            />
            <p className="text-muted-foreground text-xs">
              Account slug is set when the account is created.
            </p>
          </div>
          <div className="flex justify-end">
            <Button disabled={savingAccount} onClick={saveAccount}>
              {savingAccount ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Payroll entity</CardTitle>
          <CardDescription>
            Country, region, and timezone affect future public holiday imports
            and Xero payroll region selection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="organisation-name">Organisation name</Label>
            <Input
              id="organisation-name"
              onChange={(event) => setOrganisationName(event.target.value)}
              value={organisationName}
            />
          </div>

          <div className="space-y-3">
            <Label>Country</Label>
            <RadioGroup
              className="grid gap-2 sm:grid-cols-3"
              onValueChange={(value) => {
                if (value === "AU" || value === "NZ" || value === "UK") {
                  setCountryCode(value);
                }
                setConfirmCountryChange(false);
                setRegionCode("");
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

          <div className="space-y-2">
            <Label htmlFor="region-code">Region</Label>
            <Select
              onValueChange={setRegionCode}
              value={regionCode || undefined}
            >
              <SelectTrigger id="region-code">
                <SelectValue placeholder="Select a region" />
              </SelectTrigger>
              <SelectContent>
                {regionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Primary timezone</Label>
            <Select onValueChange={setTimezone} value={timezone}>
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select a timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(countryChanged ||
            regionCode !== (organisation.regionCode ?? "")) && (
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              Changing your country or region affects which public holidays and
              Xero payroll regions are available. Existing records and
              connections are not changed automatically. You may need to import
              new public holidays from Settings &gt; Holidays.
            </div>
          )}

          {countryChanged && (
            <div className="space-y-3 rounded-xl bg-muted/40 p-3 text-sm">
              <p>
                Confirm changing the organisation&apos;s country to{" "}
                {countryCode}. This affects future Xero connections and holiday
                imports. Existing data is preserved. Continue?
              </p>
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={confirmCountryChange}
                  id="confirm-country-change"
                  onCheckedChange={(checked) =>
                    setConfirmCountryChange(checked === true)
                  }
                />
                <Label htmlFor="confirm-country-change">
                  I understand and want to continue
                </Label>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              disabled={
                savingOrganisation || (countryChanged && !confirmCountryChange)
              }
              onClick={saveOrganisation}
            >
              {savingOrganisation ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
