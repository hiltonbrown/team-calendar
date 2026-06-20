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
  return (
    <ChartContainer className="min-h-[280px] w-full" config={chartConfig}>
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
  );
}
