import { Button } from "@repo/design-system/components/ui/button";
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
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useForm } from "react-hook-form";

type LeaveRequestValues = {
  reason: string;
};

export const Default = () => {
  const form = useForm<LeaveRequestValues>({
    defaultValues: { reason: "" },
  });

  return (
    <Form {...form}>
      <form className="flex w-80 flex-col gap-4">
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Leave reason</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Family holiday" {...field} />
              </FormControl>
              <FormDescription>
                Shown to your manager when they review this request.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="self-start">
          Submit request
        </Button>
      </form>
    </Form>
  );
};

export const WithError = () => {
  const form = useForm<LeaveRequestValues>({
    defaultValues: { reason: "" },
    errors: {
      reason: { type: "required", message: "A reason for leave is required." },
    },
  });

  return (
    <Form {...form}>
      <form className="flex w-80 flex-col gap-4">
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Leave reason</FormLabel>
              <FormControl>
                <Textarea placeholder="e.g. Family holiday" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="self-start">
          Submit request
        </Button>
      </form>
    </Form>
  );
};
