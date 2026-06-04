"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Calendar } from "@repo/design-system/components/ui/calendar";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { cn } from "@repo/design-system/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Check, MoveRight } from "lucide-react";
import { useState } from "react";

const contactCopy = {
  title: "Get in touch",
  description:
    "Talk to us about connecting LeaveSync to your Xero Payroll account.",
  benefits: [
    {
      title: "Quick setup",
      description:
        "Connecting your Xero account takes minutes. We will walk you through the OAuth flow and first sync.",
    },
    {
      title: "Xero expertise",
      description:
        "Our team understands Xero Payroll AU, NZ, and UK. We can help with region-specific leave configurations.",
    },
    {
      title: "Dedicated support",
      description:
        "If something does not look right in your sync or feed, we will investigate and resolve it with you.",
    },
  ],
  form: {
    title: "Book a call",
    date: "Preferred date",
    firstName: "First name",
    lastName: "Last name",
    resume: "Upload file",
    cta: "Book the call",
  },
};

export const ContactForm = () => {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div className="w-full py-20 lg:py-40">
      <div className="container mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h4 className="max-w-xl text-left font-regular text-3xl tracking-tighter md:text-5xl">
                  {contactCopy.title}
                </h4>
                <p className="max-w-sm text-left text-lg text-muted-foreground leading-relaxed tracking-tight">
                  {contactCopy.description}
                </p>
              </div>
            </div>
            {contactCopy.benefits.map((benefit) => (
              <div
                className="flex flex-row items-start gap-6 text-left"
                key={benefit.title}
              >
                <Check className="mt-2 h-4 w-4 text-primary" />
                <div className="flex flex-col gap-1">
                  <p>{benefit.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center">
            <div className="flex max-w-sm flex-col gap-4 rounded-md border p-8">
              <p>{contactCopy.form.title}</p>
              <div className="grid w-full max-w-sm items-center gap-1">
                <Label htmlFor="picture">{contactCopy.form.date}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      className={cn(
                        "w-full max-w-sm justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                      variant="outline"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? (
                        format(date, "PPP")
                      ) : (
                        <span>{contactCopy.form.date}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      autoFocus
                      mode="single"
                      onSelect={setDate}
                      selected={date}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid w-full max-w-sm items-center gap-1">
                <Label htmlFor="firstname">{contactCopy.form.firstName}</Label>
                <Input id="firstname" type="text" />
              </div>
              <div className="grid w-full max-w-sm items-center gap-1">
                <Label htmlFor="lastname">{contactCopy.form.lastName}</Label>
                <Input id="lastname" type="text" />
              </div>
              <div className="grid w-full max-w-sm items-center gap-1">
                <Label htmlFor="picture">{contactCopy.form.resume}</Label>
                <Input id="picture" type="file" />
              </div>

              <Button className="w-full gap-4">
                {contactCopy.form.cta} <MoveRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
