import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system";

export const Default = () => (
  <Accordion
    style={{ width: 440 }}
    collapsible
    defaultValue="balances"
    type="single"
  >
    <AccordionItem value="balances">
      <AccordionTrigger>Where do leave balances come from?</AccordionTrigger>
      <AccordionContent className="text-muted-foreground">
        Balances are read from Xero Payroll each morning. Team Calendar never
        calculates accruals itself.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="approval">
      <AccordionTrigger>Who approves my leave?</AccordionTrigger>
      <AccordionContent className="text-muted-foreground">
        Your manager in Team Calendar approves requests.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="feeds">
      <AccordionTrigger>Can I see leave in Outlook?</AccordionTrigger>
      <AccordionContent className="text-muted-foreground">
        Yes, subscribe to your calendar feed.
      </AccordionContent>
    </AccordionItem>
  </Accordion>
);

export const CalendarApps = () => (
  <Accordion
    style={{ width: 480 }}
    collapsible
    defaultValue="manual"
    type="single"
  >
    <AccordionItem className="border-b-0" value="manual">
      <AccordionTrigger className="rounded-md py-3">
        Other calendar apps
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid grid-cols-2 gap-5 pb-2">
          <div>
            <h3 className="font-medium text-foreground text-title-sm">
              Outlook
            </h3>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Add calendar, then Subscribe from web, and paste the feed URL.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground text-title-sm">
              Apple Calendar
            </h3>
            <p className="mt-1 text-body-sm text-muted-foreground">
              File, New Calendar Subscription, then paste the feed URL.
            </p>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
);
