"use client";

import { getAvailabilityRecordLabel } from "@repo/core";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/design-system/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";

interface OooDaysMonthlyChartProps {
  data: Record<string, string | number>[];
  recordTypes: string[];
}

export function OooDaysMonthlyChart({
  data,
  recordTypes,
}: OooDaysMonthlyChartProps) {
  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];

  const chartConfig: ChartConfig = {};
  recordTypes.forEach((type, index) => {
    chartConfig[type] = {
      color: colors[index % colors.length],
      label: labelForRecordType(type),
    };
  });

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        Exact monthly values are listed by labelled type before the chart.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((item) => (
          <section className="rounded-xl bg-muted p-3" key={String(item.month)}>
            <h3 className="font-medium text-sm">{item.month}</h3>
            <dl className="mt-2 space-y-1.5">
              {recordTypes.map((type) => (
                <div className="flex justify-between gap-4" key={type}>
                  <dt className="break-words text-muted-foreground text-sm">
                    {labelForRecordType(type)}
                  </dt>
                  <dd className="shrink-0 text-sm tabular-nums">
                    {formatDays(item[type])}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
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
            dataKey="month"
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
          <Legend />
          {recordTypes.map((type) => (
            <Bar
              dataKey={type}
              fill={`var(--color-${type})`}
              key={type}
              name={labelForRecordType(type)}
              radius={[0, 0, 0, 0]}
              stackId="a"
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function formatNumber(value: string | number | undefined): string {
  return typeof value === "number"
    ? value.toLocaleString("en-AU", { maximumFractionDigits: 1 })
    : "0";
}

function formatDays(value: string | number | undefined): string {
  return `${formatNumber(value)} ${value === 1 ? "day" : "days"}`;
}

function labelForRecordType(recordType: string): string {
  if (recordType === "wfh") {
    return "WFH";
  }
  return getAvailabilityRecordLabel(recordType);
}
