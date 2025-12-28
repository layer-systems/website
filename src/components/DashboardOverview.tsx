import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserStats } from "@/hooks/useUserStats";
import { DashboardStatCard } from "./DashboardStatCard";
import { FileText, Heart, Repeat2, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardOverview() {
  const { user } = useCurrentUser();
  const { data: stats, isLoading, error } = useUserStats(user?.pubkey);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 px-8 text-center">
          <p className="text-muted-foreground">
            Failed to load statistics. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 px-8 text-center">
          <p className="text-muted-foreground">
            No data available. Start posting to see your statistics!
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartConfig = {
    posts: {
      label: "Posts",
      color: "hsl(var(--primary))",
    },
  };

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardStatCard
          title="Total Posts"
          value={stats.totalPosts}
          description="All time"
          icon={FileText}
        />
        <DashboardStatCard
          title="Reactions"
          value={stats.totalReactions}
          description="All time"
          icon={Heart}
        />
        <DashboardStatCard
          title="Reposts"
          value={stats.totalReposts}
          description="All time"
          icon={Repeat2}
        />
        <DashboardStatCard
          title="Posts This Week"
          value={stats.postsThisWeek}
          description="Last 7 days"
          icon={TrendingUp}
        />
      </div>

      {/* Activity Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Overview</CardTitle>
          <CardDescription>Your posting activity over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <AreaChart data={stats.dailyActivity}>
              <defs>
                <linearGradient id="fillPosts" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-posts)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-posts)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => value}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                allowDecimals={false}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <Area
                dataKey="posts"
                type="monotone"
                fill="url(#fillPosts)"
                fillOpacity={0.4}
                stroke="var(--color-posts)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
