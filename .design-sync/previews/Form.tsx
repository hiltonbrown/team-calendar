import {
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
} from "@repo/design-system";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

type DeclineValues = { reason: string };
type FeedValues = { name: string; description: string };

const FeedForm = () => {
  const form = useForm<FeedValues>({
    defaultValues: { name: "Kitchen team leave", description: "" },
  });
  return (
    <Form {...form}>
      <form className="w-[420px] space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Feed name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>Shown as the calendar name in Outlook and Google Calendar.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Approved leave for the Sydney kitchen" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="button">Create feed</Button>
      </form>
    </Form>
  );
};

const DeclineForm = () => {
  const form = useForm<DeclineValues>({ defaultValues: { reason: "" } });
  useEffect(() => {
    form.setError("reason", { message: "Enter a reason so Priya knows why." });
  }, [form]);
  return (
    <Form {...form}>
      <form className="w-[420px] space-y-6">
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Decline reason</FormLabel>
              <FormControl>
                <Textarea placeholder="Explain why this request is declined" {...field} />
              </FormControl>
              <FormDescription>The employee sees this reason in their notification.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="button" variant="destructive">
          Decline request
        </Button>
      </form>
    </Form>
  );
};

export const CreateFeed = () => <FeedForm />;

export const ValidationError = () => <DeclineForm />;
