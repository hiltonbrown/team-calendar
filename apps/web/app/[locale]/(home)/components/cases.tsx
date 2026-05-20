import type { Dictionary } from "@repo/internationalization";
import { Calendar, Clock, Settings, Users } from "lucide-react";

interface CasesProps {
  dictionary: Dictionary;
}

const personas = [
  {
    icon: Settings,
    role: "HR admins and ops managers",
    description:
      "Configure Xero connections, manage calendar subscriptions, and review sync status. Full data density with control and confidence.",
  },
  {
    icon: Users,
    role: "Team managers",
    description:
      "Check who is on leave or working remotely across the team. Scannable views and calendar subscriptions are primary.",
  },
  {
    icon: Calendar,
    role: "Employees",
    description:
      "Submit leave, record WFH and manual availability, and share a private calendar subscription with your calendar app of choice.",
  },
  {
    icon: Clock,
    role: "Payroll teams",
    description:
      "Xero remains the source of truth. LeaveSync writes approved leave back to Xero automatically, reducing reconciliation overhead.",
  },
];

export const Cases = ({ dictionary }: CasesProps) => (
  <div className="w-full py-20 lg:py-40">
    <div className="container mx-auto">
      <div className="flex flex-col gap-10">
        <h2 className="text-left font-semibold text-xl tracking-tight md:text-5xl lg:max-w-xl">
          {dictionary.web.home.cases.title}
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {personas.map((persona) => {
            const Icon = persona.icon;
            return (
              <div
                className="flex flex-col gap-4 rounded-2xl bg-muted p-6"
                key={persona.role}
              >
                <Icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
                <div className="flex flex-col gap-2">
                  <h3 className="font-medium text-base">{persona.role}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {persona.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);
