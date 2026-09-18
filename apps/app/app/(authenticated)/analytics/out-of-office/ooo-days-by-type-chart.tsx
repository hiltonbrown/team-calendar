"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/design-system/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

interface OooDaysByTypeChartProps {
  data: OooDaysByTypeChartItem[];
}

export interface OooDaysByTypeChartItem {
  days: number;
  label: string;
  recordType: string;
}

const chartConfig = {
  days: {
    color: "var(--chart-1)",
    label: "Out of office days",
  },
} satisfies ChartConfig;

export function OooDaysByTypeChart({ data }: OooDaysByTypeChartProps) {
  const [leadingType] = data;
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        {leadingType
          ? `${leadingType.label} is the most common type at ${formatNumber(leadingType.days)} days.`
          : "No out-of-office type values are available."}
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {data.map((item) => (
          <div
            className="flex items-baseline justify-between gap-4 rounded-xl bg-muted p-3"
            key={item.recordType}
          >
            <dt className="break-words font-medium text-sm">{item.label}</dt>
            <dd className="shrink-0 text-sm tabular-nums">
              {formatDays(item.days)}
            </dd>
          </div>
        ))}
      </dl>
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
            dataKey="label"
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
    </div>
  );
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-AU", { maximumFractionDigits: 1 });
}

function formatDays(value: number): string {
  return `${formatNumber(value)} ${value === 1 ? "day" : "days"}`;
}
