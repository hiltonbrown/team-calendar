import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";

export const Default = () => (
  <Accordion className="w-full max-w-lg" defaultValue="annual" type="single">
    <AccordionItem value="annual">
      <AccordionTrigger>Annual leave</AccordionTrigger>
      <AccordionContent>
        Accrues at 4 weeks per year for full-time staff, pro-rated for
        part-time. Balances are sourced directly from Xero Payroll and update
        after each pay run.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="sick">
      <AccordionTrigger>Sick leave</AccordionTrigger>
      <AccordionContent>
        10 days per year in Australia, with unused days carrying over. A medical
        certificate may be required for absences longer than two consecutive
        days.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="parental">
      <AccordionTrigger>Parental leave</AccordionTrigger>
      <AccordionContent>
        Up to 12 months unpaid leave is available for eligible employees, with
        government-funded parental leave pay administered separately through
        Xero Payroll.
      </AccordionContent>
    </AccordionItem>
  </Accordion>
);

export const MultipleOpen = () => (
  <Accordion
    className="w-full max-w-lg"
    defaultValue={["public-holidays", "wfh"]}
    type="multiple"
  >
    <AccordionItem value="public-holidays">
      <AccordionTrigger>Public holidays</AccordionTrigger>
      <AccordionContent>
        Public holidays are applied automatically based on each employee's
        rostered location and synced from the Nager.Date public holiday API.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="wfh">
      <AccordionTrigger>Working from home</AccordionTrigger>
      <AccordionContent>
        Manual availability entries such as WFH, travelling, or client site
        visits do not affect leave balances and are visible only to your team.
      </AccordionContent>
    </AccordionItem>
  </Accordion>
);
