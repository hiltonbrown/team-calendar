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
    "Talk to us about getting your small business onto Team Calendar, connected to your Xero Payroll file. Tell us your team size and we will help you set up.",
  benefits: [
    {
      title: "Quick setup",
      description:
        "Connecting your Xero account takes minutes. We will walk you through the OAuth flow and first sync.",
    },
    {
      title: "Xero expertise",
      description:
        "Our team understands Xero Payroll Australia. We can help with region-specific leave configurations.",
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
    cta: "Book your setup call",
  },
};

export const ContactForm = () => {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const preferredDateId = "preferred-date";
  const uploadId = "contact-upload";

  return (
    <div className="fmkt-page marketing-simple">
      <section className="marketing-simple__hero">
        <div className="fmkt-container">
          <div className="marketing-simple__grid marketing-simple__grid--two">
            <div className="marketing-simple__intro">
              <p className="marketing-simple__kicker">Contact</p>
              <h1 className="marketing-simple__title">{contactCopy.title}</h1>
              <p className="marketing-simple__lead">
                {contactCopy.description}
              </p>
              <div className="marketing-simple__section-copy">
                <ul className="marketing-simple__list">
                  {contactCopy.benefits.map((benefit) => (
                    <li key={benefit.title}>
                      <Check size={16} strokeWidth={1.8} />
                      <span>
                        <strong>{benefit.title}</strong>
                        <br />
                        {benefit.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="marketing-simple__panel">
              <h2>{contactCopy.form.title}</h2>
              <div className="grid w-full max-w-sm items-center gap-1">
                <Label htmlFor={preferredDateId}>{contactCopy.form.date}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      className={cn(
                        "w-full max-w-sm justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                      id={preferredDateId}
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
                <Label htmlFor={uploadId}>{contactCopy.form.resume}</Label>
                <Input id={uploadId} type="file" />
              </div>

              <Button className="w-full gap-4">
                {contactCopy.form.cta} <MoveRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
