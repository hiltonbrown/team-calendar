"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/design-system/components/ui/form";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { addCustomHolidayAction } from "../../_actions";

const formSchema = z
  .object({
    date: z.string().min(1, "Date is required"),
    jurisdictionId: z.string().uuid().optional(),
    name: z.string().min(1, "Name is required").max(100),
    recursAnnually: z.boolean(),
    scope: z.enum(["jurisdiction", "organisation"]),
  })
  .superRefine((value, context) => {
    if (value.scope === "jurisdiction" && !value.jurisdictionId) {
      context.addIssue({
        code: "custom",
        message: "Choose a jurisdiction",
        path: ["jurisdictionId"],
      });
    }
  });

interface NewHolidayModalProps {
  jurisdictions: Array<{
    country_code: string;
    id: string;
    region_code: string | null;
  }>;
  organisationId: string;
}

export function NewHolidayModal({
  jurisdictions,
  organisationId,
}: NewHolidayModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      date: "",
      jurisdictionId: undefined,
      name: "",
      recursAnnually: false,
      scope: "organisation",
    },
    resolver: zodResolver(formSchema),
  });
  const scope = form.watch("scope");
  const jurisdictionId = form.watch("jurisdictionId");
  const selectedJurisdiction = jurisdictions.find(
    (jurisdiction) => jurisdiction.id === jurisdictionId
  );
  const scopePreview = scopePreviewLabel(scope, selectedJurisdiction);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      router.back();
    }
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    startTransition(async () => {
      const result = await addCustomHolidayAction(
        buildCustomHolidayActionInput(values, organisationId)
      );

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Custom holiday added");
      router.back();
    });
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={true}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add custom holiday</DialogTitle>
          <DialogDescription>
            Create a custom public holiday for your organisation.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Company Anniversary" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Applies to</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value === "organisation") {
                        form.setValue("jurisdictionId", undefined);
                      }
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="organisation">
                        All organisation locations
                      </SelectItem>
                      <SelectItem
                        disabled={jurisdictions.length === 0}
                        value="jurisdiction"
                      >
                        One imported jurisdiction
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Organisation-wide holidays apply regardless of a person's
                    location.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {scope === "jurisdiction" ? (
              <FormField
                control={form.control}
                name="jurisdictionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jurisdiction</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a jurisdiction" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {jurisdictions.map((jurisdiction) => (
                          <SelectItem
                            key={jurisdiction.id}
                            value={jurisdiction.id}
                          >
                            {jurisdictionLabel(jurisdiction)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Jurisdictions are created when holidays are refreshed from
                      the source.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <div aria-live="polite" className="rounded-xl bg-muted p-4 text-sm">
              <span className="font-medium">Scope preview: </span>
              {scopePreview}
            </div>

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="recursAnnually"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg bg-muted p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Recurs annually</FormLabel>
                    <FormDescription>
                      This holiday will automatically apply every year.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                disabled={isPending}
                onClick={() => router.back()}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? "Adding..." : "Add holiday"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function buildCustomHolidayActionInput(
  values: z.infer<typeof formSchema>,
  organisationId: string
) {
  return {
    appliesToAllJurisdictions: values.scope === "organisation",
    date: new Date(values.date),
    jurisdictionId:
      values.scope === "jurisdiction" ? (values.jurisdictionId ?? null) : null,
    name: values.name,
    organisationId,
    recursAnnually: values.recursAnnually,
  };
}

function jurisdictionLabel(jurisdiction: {
  country_code: string;
  region_code: string | null;
}) {
  return jurisdiction.region_code
    ? `${jurisdiction.country_code}-${jurisdiction.region_code}`
    : `${jurisdiction.country_code} national`;
}

function scopePreviewLabel(
  scope: "jurisdiction" | "organisation",
  jurisdiction: { country_code: string; region_code: string | null } | undefined
) {
  if (scope === "organisation") {
    return "All organisation locations";
  }
  return jurisdiction
    ? jurisdictionLabel(jurisdiction)
    : "Choose a jurisdiction";
}
