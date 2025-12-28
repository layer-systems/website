"use client"

import { TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { useMemo } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { useUserStats } from "@/hooks/useUserStats"

export const description = "Activity timeline showing events per day"

const chartConfig = {
  events: {
    label: "Events",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

export function RecentActivityChart() {
  const { user } = useCurrentUser()
  const { data: stats, isLoading } = useUserStats(user?.pubkey)

  const { chartData, totalEvents, daysWithActivity } = useMemo(() => {
    if (!stats || !stats.events || stats.events.length === 0) {
      return { chartData: [], totalEvents: 0, daysWithActivity: 0 }
    }

    // Group events by day
    const eventsByDay = new Map<string, number>()
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Initialize all days in the last 30 days with 0 events
    for (let i = 0; i < 30; i++) {
      const date = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000)
      const dateKey = date.toISOString().split('T')[0]
      eventsByDay.set(dateKey, 0)
    }

    // Count events per day
    stats.events.forEach((event) => {
      const eventDate = new Date(event.created_at * 1000)
      if (eventDate >= thirtyDaysAgo) {
        const dateKey = eventDate.toISOString().split('T')[0]
        eventsByDay.set(dateKey, (eventsByDay.get(dateKey) || 0) + 1)
      }
    })

    // Convert to chart data format
    const data = Array.from(eventsByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => {
        const dateObj = new Date(date)
        return {
          date,
          displayDate: dateObj.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric' 
          }),
          events: count,
        }
      })

    const total = Array.from(eventsByDay.values()).reduce((sum, count) => sum + count, 0)
    const activeDays = Array.from(eventsByDay.values()).filter(count => count > 0).length

    return {
      chartData: data,
      totalEvents: total,
      daysWithActivity: activeDays,
    }
  }, [stats])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
            Log in to view your activity timeline
          </div>
        </CardContent>
      </Card>
    )
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
            No activity in the last 30 days
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>
          Your event activity over the last 30 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <BarChart data={chartData} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="displayDate"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={30}
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
            <Bar
              dataKey="events"
              fill="var(--color-events)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 font-medium leading-none">
          {daysWithActivity} active days with {totalEvents} events
          <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Showing activity distribution over the last 30 days
        </div>
      </CardFooter>
    </Card>
  )
}
