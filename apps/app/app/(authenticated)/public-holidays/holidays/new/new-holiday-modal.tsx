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
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { addCustomHolidayAction } from "../../_actions";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  date: z.string().min(1, "Date is required"),
  recursAnnually: z.boolean(),
  appliesToAllJurisdictions: z.boolean(),
});

export function NewHolidayModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const org = searchParams.get("org");
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      date: "",
      recursAnnually: false,
      appliesToAllJurisdictions: true,
    },
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      router.back();
    }
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!org) {
      toast.error("No organisation selected.");
      return;
    }

    startTransition(async () => {
      const result = await addCustomHolidayAction({
        organisationId: org,
        jurisdictionId: null, // Custom holidays currently default to all jurisdictions or handled via appliesToAllJurisdictions
        name: values.name,
        date: new Date(values.date),
        recursAnnually: values.recursAnnually,
        appliesToAllJurisdictions: values.appliesToAllJurisdictions,
      });

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
