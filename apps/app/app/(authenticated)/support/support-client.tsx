"use client";

import type {
  SupportSubmissionCategory,
  SupportSubmissionPriority,
} from "@repo/core";
import { SupportSubmissionPayloadSchema } from "@repo/core";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
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
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, LifeBuoy, MessageSquare, RefreshCcw } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { z } from "zod";
import { getPublicApiUrl } from "@/lib/public-api-url";
import { SettingsSectionHeader } from "../settings/components/settings-section-header";

type Stage = "LANDING" | "FORM" | "SUCCESS";

interface SupportFormState {
  actual_outcome: string;
  category: SupportSubmissionCategory;
  email_override: string;
  expected_outcome: string;
  message: string;
  priority: SupportSubmissionPriority;
  reproduction_steps: string;
  subject: string;
}

const CATEGORY_OPTIONS: Array<{
  label: string;
  value: SupportSubmissionCategory;
}> = [
  { value: "support", label: "Support" },
  { value: "feedback", label: "Feedback" },
];

const PRIORITY_OPTIONS: Array<{
  label: string;
  value: SupportSubmissionPriority;
}> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const GENERIC_FAILURE_MESSAGE =
  "We could not submit your request right now. Please try again.";
const SUCCESS_MESSAGE = "Your message has been sent to support.";

const SupportGitHubIssueSuccessSchema = z.object({
  issueNumber: z.number().int().positive(),
  issueUrl: z.string().url(),
  ok: z.literal(true),
});

const SupportGitHubIssueFailureSchema = z.object({
  code: z.enum([
    "auth_error",
    "configuration_error",
    "forbidden",
    "integration_error",
    "unauthorised",
    "validation_error",
  ]),
  message: z.string().min(1),
  ok: z.literal(false),
});

const SupportGitHubIssueResponseSchema = z.union([
  SupportGitHubIssueSuccessSchema,
  SupportGitHubIssueFailureSchema,
]);

function createEmptyForm(
  category: SupportSubmissionCategory = "support"
): SupportFormState {
  return {
    actual_outcome: "",
    category,
    email_override: "",
    expected_outcome: "",
    message: "",
    priority: "normal",
    reproduction_steps: "",
    subject: "",
  };
}

export const SupportClient = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<Stage>("LANDING");
  const [form, setForm] = useState<SupportFormState>(createEmptyForm());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successCategory, setSuccessCategory] =
    useState<SupportSubmissionCategory>("support");
  const [isPending, startTransition] = useTransition();

  const search = searchParams.toString();
  const currentRoute = search ? `${pathname}?${search}` : pathname;

  const openForm = (category: SupportSubmissionCategory) => {
    setErrorMessage(null);
    setForm(createEmptyForm(category));
    setStage("FORM");
  };

  const handleBack = () => {
    setErrorMessage(null);
    setStage("LANDING");
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const pageUrl = typeof window === "undefined" ? null : window.location.href;
    const apiUrl = getPublicApiUrl("/api/support/github-issue");

    if (!(pageUrl && apiUrl)) {
      setErrorMessage(GENERIC_FAILURE_MESSAGE);
      return;
    }

    const parsedSubmission = SupportSubmissionPayloadSchema.safeParse({
      ...form,
      page_url: pageUrl,
    });

    if (!parsedSubmission.success) {
      setErrorMessage(
        parsedSubmission.error.issues[0]?.message ??
          "Please check your message and try again."
      );
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(apiUrl, {
          body: JSON.stringify(parsedSubmission.data),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        const payload = await response.json().catch(() => null);
        const parsedResponse =
          SupportGitHubIssueResponseSchema.safeParse(payload);

        if (!parsedResponse.success) {
          setErrorMessage(GENERIC_FAILURE_MESSAGE);
          return;
        }

        if (!parsedResponse.data.ok) {
          setErrorMessage(
            parsedResponse.data.code === "validation_error"
              ? parsedResponse.data.message
              : GENERIC_FAILURE_MESSAGE
          );
          return;
        }

        setSuccessCategory(parsedSubmission.data.category);
        setForm(createEmptyForm(parsedSubmission.data.category));
        setErrorMessage(null);
        setStage("SUCCESS");
      } catch {
        setErrorMessage(GENERIC_FAILURE_MESSAGE);
      }
    });
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Get help or share feedback without leaving the app."
        title="Support & Feedback"
      />

      <div className="relative min-h-[400px] overflow-hidden">
        <AnimatePresence initial={false} mode="wait">
          {stage === "LANDING" && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              initial={{ opacity: 0, y: 20 }}
              key="landing"
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Button
                  className="flex h-32 flex-col items-start justify-between rounded-2xl border-2 border-transparent bg-muted/50 p-6 text-left transition-colors hover:bg-muted"
                  onClick={() => openForm("support")}
                  type="button"
                  variant="ghost"
                >
                  <RefreshCcw className="h-6 w-6 text-primary" />
                  <div className="text-left">
                    <div className="font-semibold">I have a sync issue</div>
                    <div className="text-muted-foreground text-sm">
                      Send the details to support so we can investigate.
                    </div>
                  </div>
                </Button>

                <Button
                  className="flex h-32 flex-col items-start justify-between rounded-2xl border-2 border-transparent bg-muted/50 p-6 text-left transition-colors hover:bg-muted"
                  onClick={() => openForm("feedback")}
                  type="button"
                  variant="ghost"
                >
                  <MessageSquare className="h-6 w-6 text-primary" />
                  <div className="text-left">
                    <div className="font-semibold">Suggest or report</div>
                    <div className="text-muted-foreground text-sm">
                      Share product feedback or tell us what is not working.
                    </div>
                  </div>
                </Button>

                <Button
                  className="flex h-32 flex-col items-start justify-between rounded-2xl border-2 border-transparent bg-muted/50 p-6 text-left transition-colors hover:bg-muted sm:col-span-2"
                  onClick={() => openForm("support")}
                  type="button"
                  variant="ghost"
                >
                  <LifeBuoy className="h-6 w-6 text-primary" />
                  <div className="text-left">
                    <div className="font-semibold text-lg">Talk to a human</div>
                    <div className="max-w-md text-muted-foreground text-sm">
                      Send a message to the support team and we will follow up.
                    </div>
                  </div>
                </Button>
              </div>
            </motion.div>
          )}

          {stage === "FORM" && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              initial={{ opacity: 0, x: -20 }}
              key="form"
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Card className="rounded-2xl">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="mb-2 text-lg leading-none">
                        How can we help?
                      </CardTitle>
                      <CardDescription>
                        We will reply to your account email unless you add
                        another address here.
                      </CardDescription>
                    </div>
                    <Button
                      className="h-9 w-9 p-0"
                      disabled={isPending}
                      onClick={handleBack}
                      type="button"
                      variant="ghost"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  <form className="space-y-5" onSubmit={handleSubmit}>
                    {errorMessage && (
                      <Alert className="rounded-2xl" variant="destructive">
                        <AlertTitle>Could not send your message</AlertTitle>
                        <AlertDescription>{errorMessage}</AlertDescription>
                      </Alert>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="category">Category</Label>
                        <Select
                          disabled={isPending}
                          onValueChange={(value: SupportSubmissionCategory) =>
                            setForm((current) => ({
                              ...current,
                              category: value,
                            }))
                          }
                          value={form.category}
                        >
                          <SelectTrigger className="h-11 w-full" id="category">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="priority">Priority</Label>
                        <Select
                          disabled={isPending}
                          onValueChange={(value: SupportSubmissionPriority) =>
                            setForm((current) => ({
                              ...current,
                              priority: value,
                            }))
                          }
                          value={form.priority}
                        >
                          <SelectTrigger className="h-11 w-full" id="priority">
                            <SelectValue placeholder="Select a priority" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        disabled={isPending}
                        id="subject"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            subject: event.target.value,
                          }))
                        }
                        placeholder="Missing leave entry in the calendar"
                        value={form.subject}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">Message</Label>
                      <Textarea
                        className="min-h-[140px] resize-none"
                        disabled={isPending}
                        id="message"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            message: event.target.value,
                          }))
                        }
                        placeholder="Tell us what happened and what you need."
                        value={form.message}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email-override">
                        Reply email (optional)
                      </Label>
                      <Input
                        disabled={isPending}
                        id="email-override"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            email_override: event.target.value,
                          }))
                        }
                        placeholder="team@company.com"
                        type="email"
                        value={form.email_override}
                      />
                    </div>

                    <div className="rounded-2xl bg-muted/30 p-4">
                      <div className="mb-4 space-y-1">
                        <h3 className="font-medium text-sm">
                          More detail (optional)
                        </h3>
                        <p className="text-muted-foreground text-sm">
                          Add these details if they will help us reproduce or
                          understand the issue.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="reproduction-steps">
                            Reproduction steps
                          </Label>
                          <Textarea
                            className="min-h-[110px] resize-none"
                            disabled={isPending}
                            id="reproduction-steps"
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                reproduction_steps: event.target.value,
                              }))
                            }
                            placeholder="1. Open the calendar&#10;2. Filter by team&#10;3. The leave entry is missing"
                            value={form.reproduction_steps}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="expected-outcome">
                            Expected outcome
                          </Label>
                          <Textarea
                            className="min-h-[90px] resize-none"
                            disabled={isPending}
                            id="expected-outcome"
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                expected_outcome: event.target.value,
                              }))
                            }
                            placeholder="The approved leave entry should appear in the calendar."
                            value={form.expected_outcome}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="actual-outcome">Actual outcome</Label>
                          <Textarea
                            className="min-h-[90px] resize-none"
                            disabled={isPending}
                            id="actual-outcome"
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                actual_outcome: event.target.value,
                              }))
                            }
                            placeholder="The calendar remains empty for that person."
                            value={form.actual_outcome}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-muted/20 px-4 py-3 text-muted-foreground text-sm">
                      Current page: {currentRoute}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        disabled={isPending}
                        onClick={handleBack}
                        type="button"
                        variant="outline"
                      >
                        Back
                      </Button>
                      <Button disabled={isPending} type="submit">
                        {isPending ? "Sending..." : "Submit request"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {stage === "SUCCESS" && (
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              initial={{ opacity: 0, scale: 0.98 }}
              key="success"
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg">Message sent</CardTitle>
                  <CardDescription>{SUCCESS_MESSAGE}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap justify-end gap-2">
                  <Button onClick={handleBack} type="button" variant="outline">
                    Back
                  </Button>
                  <Button
                    onClick={() => openForm(successCategory)}
                    type="button"
                  >
                    Send another message
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
