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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { toast } from "@repo/design-system/components/ui/sonner";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createManualPersonAction } from "./_actions";

const EMPLOYMENT_TYPE_OPTIONS = [
  { label: "Employee", value: "employee" },
  { label: "Contractor", value: "contractor" },
  { label: "Director", value: "director" },
  { label: "Offshore staff", value: "offshore" },
] as const;

interface NewPersonClientProps {
  organisationId: string;
  orgQueryValue: string | null;
}

export const NewPersonClient = ({
  organisationId,
  orgQueryValue,
}: NewPersonClientProps) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [employmentType, setEmploymentType] = useState("employee");
  const [jobTitle, setJobTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  const peopleHref = orgQueryValue ? `/people?org=${orgQueryValue}` : "/people";

  const isValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0;

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await createManualPersonAction({
        email,
        employmentType,
        firstName,
        jobTitle: jobTitle.trim() || undefined,
        lastName,
        organisationId,
      });
      if (!result.ok) {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-lg rounded-2xl">
        <CardHeader>
          <CardTitle>Add a person</CardTitle>
          <CardDescription>
            Add someone to your organisation manually. You can connect them to
            Xero later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                maxLength={128}
                onChange={(e) => setFirstName(e.target.value)}
                required
                value={firstName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                maxLength={128}
                onChange={(e) => setLastName(e.target.value)}
                required
                value={lastName}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              maxLength={256}
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="employment-type">Employment type</Label>
            <Select onValueChange={setEmploymentType} value={employmentType}>
              <SelectTrigger id="employment-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-title">
              Job title{" "}
              <span className="text-label-lg text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="job-title"
              maxLength={128}
              onChange={(e) => setJobTitle(e.target.value)}
              value={jobTitle}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Button asChild variant="ghost">
              <Link href={peopleHref}>Cancel</Link>
            </Button>
            <Button disabled={isPending || !isValid} onClick={handleSubmit}>
              {isPending ? "Adding..." : "Add person"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
