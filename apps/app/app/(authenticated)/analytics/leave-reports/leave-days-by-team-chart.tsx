"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/design-system/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

interface LeaveDaysByTeamChartProps {
  data: LeaveDaysByTeamChartItem[];
}

export interface LeaveDaysByTeamChartItem {
  days: number;
  peopleCount: number;
  teamName: string;
}

const chartConfig = {
  days: {
    color: "var(--chart-1)",
    label: "Leave days",
  },
} satisfies ChartConfig;

export function LeaveDaysByTeamChart({ data }: LeaveDaysByTeamChartProps) {
  const [leadingTeam] = data;
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        {leadingTeam
          ? `${leadingTeam.teamName} has the most approved leave in this view at ${leadingTeam.days.toLocaleString("en-AU")} days across ${leadingTeam.peopleCount.toLocaleString("en-AU")} people.`
          : "No team leave values are available."}
      </p>
      <ChartContainer
        aria-hidden="true"
        className="min-h-[280px] w-full"
        config={chartConfig}
      >
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ bottom: 8, left: 0, right: 8, top: 16 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="teamName"
            tickLine={false}
            tickMargin={10}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tickMargin={10}
          />
          <ChartTooltip
            content={({ content: _content, ...props }) => (
              <ChartTooltipContent {...props} />
            )}
          />
          <Bar
            dataKey="days"
            fill="var(--color-days)"
            maxBarSize={52}
            radius={[12, 12, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
      <div className="overflow-x-auto rounded-2xl bg-muted p-2">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="p-3 text-left font-medium">
            Exact approved leave values by team
          </caption>
          <thead>
            <tr>
              <th className="p-3 text-left" scope="col">
                Team
              </th>
              <th className="p-3 text-right" scope="col">
                Leave days
              </th>
              <th className="p-3 text-right" scope="col">
                People
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.teamName}>
                <th
                  className="max-w-[28rem] break-words p-3 text-left font-medium"
                  scope="row"
                >
                  {item.teamName}
                </th>
                <td className="p-3 text-right tabular-nums">
                  {item.days.toLocaleString("en-AU")}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {item.peopleCount.toLocaleString("en-AU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
