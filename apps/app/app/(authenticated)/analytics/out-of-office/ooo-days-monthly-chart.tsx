"use client";

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
    <ChartContainer className="min-h-[280px] w-full" config={chartConfig}>
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
            radius={[0, 0, 0, 0]}
            stackId="a"
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

function labelForRecordType(recordType: string): string {
  if (recordType === "wfh") {
    return "WFH";
  }
  return recordType
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
