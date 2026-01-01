import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/navigation/AppSidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRelayStats } from '@/hooks/useRelayStats';
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Activity, Users, FileText, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { genUserName } from '@/lib/genUserName';

const activityChartConfig = {
  events: {
    label: 'Events',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

const kindChartConfig = {
  count: {
    label: 'Count',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

const pieChartConfig = {
  events: {
    label: 'Events',
  },
} satisfies ChartConfig;

export function Stats() {
  const { data: stats, isLoading } = useRelayStats();

  const activityData = useMemo(() => {
    if (!stats) return [];
    
    // Get last 7 days
    const days: Array<{ date: string; day: string; events: number }> = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      days.push({
        date: dateKey,
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        events: stats.eventsPerDay[dateKey] || 0,
      });
    }
    return days;
  }, [stats]);

  const kindData = useMemo(() => {
    if (!stats) return [];
    return stats.topKinds.map((item) => ({
      kind: `Kind ${item.kind}`,
      count: item.count,
    }));
  }, [stats]);

  const pieData = useMemo(() => {
    if (!stats || stats.topKinds.length === 0) return [];
    
    const colors = [
      'hsl(var(--chart-1))',
      'hsl(var(--chart-2))',
      'hsl(var(--chart-3))',
      'hsl(var(--chart-4))',
      'hsl(var(--chart-5))',
    ];
    
    return stats.topKinds.slice(0, 5).map((item, index) => ({
      kind: `Kind ${item.kind}`,
      events: item.count,
      fill: colors[index % colors.length],
    }));
  }, [stats]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full overflow-x-hidden">
        <AppSidebar />
        <main className="flex-1 min-w-0">
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold md:text-xl truncate">Relay Statistics</h1>
          </div>

          <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8 overflow-x-hidden">
            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                Network Overview
              </h2>
              <p className="text-sm md:text-base text-muted-foreground">
                Real-time statistics from connected Nostr relays (last 7 days).
              </p>
            </div>

            {/* Stats Overview Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Events</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold">{stats?.totalEvents.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Last 7 days
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Unique Authors</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold">{stats?.uniqueAuthors.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Active contributors
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Event Types</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold">
                        {Object.keys(stats?.eventsByKind || {}).length}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Different kinds
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg. per Day</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold">
                        {Math.round((stats?.totalEvents || 0) / 7).toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Events per day
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Activity Timeline Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
                <CardDescription>Events published over the last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : (
                  <ChartContainer config={activityChartConfig} className="h-[300px] w-full">
                    <LineChart data={activityData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="day"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line
                        type="monotone"
                        dataKey="events"
                        stroke="var(--color-events)"
                        strokeWidth={2}
                        dot={{ fill: 'var(--color-events)' }}
                      />
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Charts Grid */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Top Event Kinds Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Event Kinds</CardTitle>
                  <CardDescription>Most popular event types by count</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <ChartContainer config={kindChartConfig} className="h-[300px] w-full">
                      <BarChart data={kindData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="kind"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey="count"
                          fill="var(--color-count)"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              {/* Event Distribution Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Event Distribution</CardTitle>
                  <CardDescription>Distribution of top 5 event kinds</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : (
                    <ChartContainer config={pieChartConfig} className="h-[300px] w-full">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie
                          data={pieData}
                          dataKey="events"
                          nameKey="kind"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label
                        />
                      </PieChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Authors List */}
            <Card>
              <CardHeader>
                <CardTitle>Most Active Authors</CardTitle>
                <CardDescription>Top contributors in the last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                    ))}
                  </div>
                ) : stats?.topAuthors && stats.topAuthors.length > 0 ? (
                  <div className="space-y-4">
                    {stats.topAuthors.map((author, index) => (
                      <div key={author.pubkey} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-semibold">
                            {index + 1}
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium leading-none">
                              {genUserName(author.pubkey)}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {author.pubkey.slice(0, 8)}...{author.pubkey.slice(-8)}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm font-semibold">
                          {author.count.toLocaleString()} events
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No author data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

export default Stats;
