import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "@repo/design-system";

const leaveByMonth = [
  { month: "May", annual: 42, personal: 11, longService: 0 },
  { month: "Jun", annual: 58, personal: 17, longService: 10 },
  { month: "Jul", annual: 96, personal: 21, longService: 15 },
  { month: "Aug", annual: 51, personal: 14, longService: 5 },
  { month: "Sep", annual: 63, personal: 9, longService: 20 },
  { month: "Oct", annual: 88, personal: 12, longService: 10 },
];

const leaveConfig = {
  annual: { label: "Annual leave", color: "var(--chart-1)" },
  personal: { label: "Personal leave", color: "var(--chart-2)" },
  longService: { label: "Long service", color: "var(--chart-3)" },
} satisfies ChartConfig;

export const LeaveDaysByMonth = () => (
  <Card style={{ width: 560 }}>
    <CardHeader>
      <CardTitle>Leave days by month</CardTitle>
      <CardDescription>Head Office, May to October 2026</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer className="h-64 w-full" config={leaveConfig} style={{ aspectRatio: "auto" }}>
        <BarChart accessibilityLayer data={leaveByMonth}>
          <CartesianGrid vertical={false} />
          <XAxis axisLine={false} dataKey="month" tickLine={false} tickMargin={8} />
          <YAxis axisLine={false} tickLine={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
          <Bar dataKey="annual" fill="var(--color-annual)" isAnimationActive={false} radius={[0, 0, 4, 4]} stackId="leave" />
          <Bar dataKey="personal" fill="var(--color-personal)" isAnimationActive={false} stackId="leave" />
          <Bar dataKey="longService" fill="var(--color-longService)" isAnimationActive={false} radius={[4, 4, 0, 0]} stackId="leave" />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);

const peopleOut = [
  { week: "7 Sep", away: 4, wfh: 9 },
  { week: "14 Sep", away: 6, wfh: 11 },
  { week: "21 Sep", away: 9, wfh: 8 },
  { week: "28 Sep", away: 14, wfh: 6 },
  { week: "5 Oct", away: 11, wfh: 10 },
  { week: "12 Oct", away: 7, wfh: 12 },
  { week: "19 Oct", away: 5, wfh: 13 },
];

const outConfig = {
  away: { label: "On leave", color: "var(--chart-1)" },
  wfh: { label: "Working from home", color: "var(--chart-4)" },
} satisfies ChartConfig;

export const OutOfOfficeTrend = () => (
  <Card style={{ width: 560 }}>
    <CardHeader>
      <CardTitle>Out of office by week</CardTitle>
      <CardDescription>People away or remote, all locations</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer className="h-64 w-full" config={outConfig} style={{ aspectRatio: "auto" }}>
        <AreaChart accessibilityLayer data={peopleOut} margin={{ left: 0, right: 8 }}>
          <defs>
            <linearGradient id="fillAway" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--color-away)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-away)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="fillWfh" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="var(--color-wfh)" stopOpacity={0.5} />
              <stop offset="95%" stopColor="var(--color-wfh)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis axisLine={false} dataKey="week" tickLine={false} tickMargin={8} />
          <YAxis axisLine={false} tickLine={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
          <Area
            dataKey="wfh"
            fill="url(#fillWfh)"
            isAnimationActive={false}
            stroke="var(--color-wfh)"
            strokeWidth={2}
            type="monotone"
          />
          <Area
            dataKey="away"
            fill="url(#fillAway)"
            isAnimationActive={false}
            stroke="var(--color-away)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ChartContainer>
    </CardContent>
  </Card>
);
