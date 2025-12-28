import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useUserStats } from '@/hooks/useUserStats';
import { Skeleton } from '@/components/ui/skeleton';

interface EventKindsChartProps {
  pubkey: string;
}

// Map of common kind numbers to their names
const kindNames: Record<number, string> = {
  0: 'Metadata',
  1: 'Text Note',
  3: 'Contacts',
  4: 'DM',
  5: 'Deletion',
  6: 'Repost',
  7: 'Reaction',
  9735: 'Zap',
  10002: 'Relay List',
  30023: 'Article',
};

export function EventKindsChart({ pubkey }: EventKindsChartProps) {
  const { data: stats, isLoading } = useUserStats(pubkey);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!stats || Object.keys(stats.eventsByKind).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Event Distribution</CardTitle>
          <CardDescription>Events published by kind</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No events found
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform data for chart
  const chartData = Object.entries(stats.eventsByKind)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10) // Top 10 kinds
    .map(([kind, count]) => ({
      kind: kindNames[Number(kind)] || `Kind ${kind}`,
      count,
    }));

  const chartConfig = {
    count: {
      label: 'Events',
      color: 'hsl(var(--chart-1))',
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event Distribution</CardTitle>
        <CardDescription>Top event types you've published</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="kind"
              angle={-45}
              textAnchor="end"
              height={80}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
