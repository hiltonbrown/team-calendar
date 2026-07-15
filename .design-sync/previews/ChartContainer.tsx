import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/design-system/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

interface LeaveDaysByMonth {
  annual: number;
  month: string;
  sick: number;
}

const monthlyLeaveData: LeaveDaysByMonth[] = [
  { month: "Sep", annual: 18, sick: 4 },
  { month: "Oct", annual: 22, sick: 6 },
  { month: "Nov", annual: 14, sick: 3 },
  { month: "Dec", annual: 31, sick: 5 },
  { month: "Jan", annual: 26, sick: 7 },
  { month: "Feb", annual: 12, sick: 2 },
];

const barChartConfig = {
  annual: {
    color: "var(--chart-1)",
    label: "Annual leave",
  },
  sick: {
    color: "var(--chart-2)",
    label: "Sick leave",
  },
} satisfies ChartConfig;

export const Default = () => (
  <ChartContainer className="min-h-[280px] w-full" config={barChartConfig}>
    <BarChart
      accessibilityLayer
      data={monthlyLeaveData}
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
      <ChartLegend content={<ChartLegendContent />} />
      <Bar
        dataKey="annual"
        fill="var(--color-annual)"
        isAnimationActive={false}
        radius={[8, 8, 0, 0]}
      />
      <Bar
        dataKey="sick"
        fill="var(--color-sick)"
        isAnimationActive={false}
        radius={[8, 8, 0, 0]}
      />
    </BarChart>
  </ChartContainer>
);

const trendChartConfig = {
  balance: {
    color: "var(--chart-1)",
    label: "Team leave balance (days)",
  },
} satisfies ChartConfig;

const balanceTrendData = [
  { month: "Sep", balance: 142 },
  { month: "Oct", balance: 128 },
  { month: "Nov", balance: 134 },
  { month: "Dec", balance: 101 },
  { month: "Jan", balance: 96 },
  { month: "Feb", balance: 110 },
];

export const LineTrend = () => (
  <ChartContainer className="min-h-[240px] w-full" config={trendChartConfig}>
    <LineChart
      accessibilityLayer
      data={balanceTrendData}
      margin={{ bottom: 8, left: 0, right: 8, top: 16 }}
    >
      <CartesianGrid vertical={false} />
      <XAxis
        axisLine={false}
        dataKey="month"
        tickLine={false}
        tickMargin={10}
      />
      <YAxis axisLine={false} tickLine={false} tickMargin={10} />
      <ChartTooltip
        content={({ content: _content, ...props }) => (
          <ChartTooltipContent {...props} />
        )}
      />
      <Line
        dataKey="balance"
        dot={{ fill: "var(--color-balance)" }}
        isAnimationActive={false}
        stroke="var(--color-balance)"
        strokeWidth={2}
        type="monotone"
      />
    </LineChart>
  </ChartContainer>
);
