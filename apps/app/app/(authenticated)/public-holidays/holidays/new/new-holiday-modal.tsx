"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/design-system/components/ui/button";
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
import type { HolidayCountryOption } from "./form-data";

const NATIONWIDE = "__all__";

const formSchema = z
  .object({
    countryCode: z.string().optional(),
    date: z.string().min(1, "Date is required"),
    name: z.string().min(1, "Name is required").max(100),
    regionCode: z.string(),
    scope: z.enum(["everywhere", "country"]),
  })
  .superRefine((value, context) => {
    if (value.scope === "country" && !value.countryCode) {
      context.addIssue({
        code: "custom",
        message: "Choose a country",
        path: ["countryCode"],
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface NewHolidayModalProps {
  countries: HolidayCountryOption[];
  defaultCountryCode: string | null;
  organisationId: string;
}

export function NewHolidayModal({
  countries,
  defaultCountryCode,
  organisationId,
}: NewHolidayModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    defaultValues: {
      countryCode:
        countries.find((country) => country.code === defaultCountryCode)
          ?.code ?? undefined,
      date: "",
      name: "",
      regionCode: NATIONWIDE,
      scope: "everywhere",
    },
    resolver: zodResolver(formSchema),
  });
  const scope = form.watch("scope");
  const countryCode = form.watch("countryCode");
  const regionCode = form.watch("regionCode");
  const selectedCountry = countries.find(
    (country) => country.code === countryCode
  );
  const scopePreview = scopePreviewLabel(scope, selectedCountry, regionCode);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      router.back();
    }
  };

  const onSubmit = (values: FormValues) => {
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
            Add a company or one-off holiday. Official public holidays are
            included automatically.
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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="everywhere">Everyone</SelectItem>
                      <SelectItem value="country">
                        One country or region
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Holidays for everyone apply regardless of a person&apos;s
                    location.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {scope === "country" ? (
              <>
                <FormField
                  control={form.control}
                  name="countryCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("regionCode", NATIONWIDE);
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a country" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {countries.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="regionCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State or region</FormLabel>
                      <Select
                        disabled={!selectedCountry}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NATIONWIDE}>
                            Whole country
                          </SelectItem>
                          {selectedCountry?.regions.map((region) => (
                            <SelectItem key={region.code} value={region.code}>
                              {region.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : null}

            <div
              aria-live="polite"
              className="rounded-xl bg-muted p-4 text-label-lg"
            >
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
  values: FormValues,
  organisationId: string
) {
  const everywhere = values.scope === "everywhere";
  return {
    appliesToAllJurisdictions: everywhere,
    countryCode: everywhere ? null : (values.countryCode ?? null),
    date: new Date(values.date),
    name: values.name,
    organisationId,
    regionCode:
      everywhere || values.regionCode === NATIONWIDE ? null : values.regionCode,
  };
}

function scopePreviewLabel(
  scope: FormValues["scope"],
  country: HolidayCountryOption | undefined,
  regionCode: string
) {
  if (scope === "everywhere") {
    return "Everyone in the organisation";
  }
  if (!country) {
    return "Choose a country";
  }
  const region = country.regions.find((option) => option.code === regionCode);
  return region
    ? `${region.label}, ${country.label}`
    : `All of ${country.label}`;
}
