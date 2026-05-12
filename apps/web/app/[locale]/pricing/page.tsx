import { Button } from "@repo/design-system/components/ui/button";
import { createMetadata } from "@repo/seo/metadata";
import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = createMetadata({
  title: "Pricing",
  description:
    "LeaveSync pricing. Commercial model coming soon, with early access available while pricing is finalised.",
});

const Pricing = () => (
  <div className="w-full">
    {/* Page header */}
    <div className="w-full bg-muted/50 py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-4 lg:max-w-2xl">
          <p className="font-medium text-primary text-sm uppercase tracking-widest">
            Pricing
          </p>
          <h1 className="font-semibold text-4xl tracking-tight md:text-6xl">
            Pricing coming soon
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            We are finalising the commercial model for LeaveSync. Pricing will
            be based on the number of active employees synced from Xero Payroll.
          </p>
        </div>
      </div>
    </div>

    {/* Interest form placeholder */}
    <div className="w-full py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h2 className="font-semibold text-3xl tracking-tight">
              What to expect
            </h2>
            <div className="flex flex-col gap-6">
              {[
                {
                  title: "Per-employee pricing",
                  description:
                    "Pricing will be based on the number of active employees in your connected Xero Payroll file. You only pay for the employees you sync.",
                },
                {
                  title: "No setup fee",
                  description:
                    "Connecting your Xero Payroll account is included. There is no implementation charge or onboarding cost.",
                },
                {
                  title: "All regions included",
                  description:
                    "Xero Payroll AU, NZ, and UK are available on all plans. You are not restricted to a single payroll region.",
                },
                {
                  title: "Contact us for enterprise",
                  description:
                    "If you have multiple Xero organisations or a large payroll file, contact us to discuss volume pricing and tailored support.",
                },
              ].map((item) => (
                <div className="flex flex-col gap-2" key={item.title}>
                  <h3 className="font-medium text-base">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-6 rounded-2xl bg-muted p-8">
            <div className="flex flex-col gap-2">
              <Mail className="h-6 w-6 text-primary" strokeWidth={1.5} />
              <h2 className="font-semibold text-2xl tracking-tight">
                Get pricing updates
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                We will notify you when pricing is published. In the meantime,
                you are welcome to connect your Xero account and use LeaveSync
                during the early access period.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button asChild className="w-full gap-2">
                <Link href="/contact">
                  <Mail className="h-4 w-4" />
                  Contact us
                </Link>
              </Button>
              <p className="text-center text-muted-foreground text-xs">
                No credit card required during early access.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default Pricing;
