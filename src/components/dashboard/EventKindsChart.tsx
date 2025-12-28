"use client"

import { TrendingUp } from "lucide-react"
import { Pie, PieChart } from "recharts"
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

export const description = "Distribution of event kinds for the logged-in user"

// Common Nostr event kind labels
const kindLabels: Record<number, string> = {
  0: "Metadata",
  1: "Note",
  3: "Contacts",
  4: "DM (Encrypted)",
  5: "Delete",
  6: "Repost",
  7: "Reaction",
  16: "Generic Repost",
  40: "Channel Create",
  41: "Channel Metadata",
  42: "Channel Message",
  43: "Channel Hide",
  44: "Channel Mute",
  1984: "Report",
  9734: "Zap Request",
  9735: "Zap",
  10002: "Relay List",
  30023: "Long-form",
  30311: "Live Event",
}

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export function EventKindsChart() {
  const { user } = useCurrentUser()
  const { data: stats, isLoading } = useUserStats(user?.pubkey)

  const { chartData, chartConfig, topKind } = useMemo(() => {
    if (!stats || !stats.eventsByKind) {
      return { chartData: [], chartConfig: {}, topKind: null }
    }

    // Sort event kinds by count and take top 5
    const sortedKinds = Object.entries(stats.eventsByKind)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)

    // Calculate total for percentage
    const total = sortedKinds.reduce((sum, [, count]) => sum + count, 0)

    // Generate chart data
    const data = sortedKinds.map(([kind, count], index) => ({
      kind: `kind${kind}`,
      kindNumber: parseInt(kind),
      label: kindLabels[parseInt(kind)] || `Kind ${kind}`,
      count,
      fill: chartColors[index % chartColors.length],
    }))

    // Generate chart config
    const config: ChartConfig = {
      count: {
        label: "Events",
      },
      ...Object.fromEntries(
        data.map((item) => [
          item.kind,
          {
            label: item.label,
            color: item.fill,
          },
        ])
      ),
    }

    // Find top kind
    const top = sortedKinds[0] ? {
      kind: parseInt(sortedKinds[0][0]),
      count: sortedKinds[0][1],
      percentage: total > 0 ? ((sortedKinds[0][1] / total) * 100).toFixed(1) : "0",
    } : null

    return { chartData: data, chartConfig: config, topKind: top }
  }, [stats])

  if (isLoading) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="items-center pb-0">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent className="flex-1 pb-0">
          <div className="mx-auto aspect-square max-h-[250px] flex items-center justify-center">
            <Skeleton className="h-[250px] w-[250px] rounded-full" />
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-2 text-sm">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-56" />
        </CardFooter>
      </Card>
    )
  }

  if (!user) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="items-center pb-0">
          <CardTitle>Event Kinds Distribution</CardTitle>
          <CardDescription>Log in to see your event distribution</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pb-0 flex items-center justify-center min-h-[250px]">
          <p className="text-muted-foreground text-sm">Please log in to view your stats</p>
        </CardContent>
      </Card>
    )
  }

  if (!stats || chartData.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="items-center pb-0">
          <CardTitle>Event Kinds Distribution</CardTitle>
          <CardDescription>Your published event types</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pb-0 flex items-center justify-center min-h-[250px]">
          <p className="text-muted-foreground text-sm">No events found</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Event Kinds Distribution</CardTitle>
        <CardDescription>Your top 5 event types</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie data={chartData} dataKey="count" nameKey="label" />
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        {topKind && (
          <div className="flex items-center gap-2 leading-none font-medium">
            {kindLabels[topKind.kind] || `Kind ${topKind.kind}`} is your most common event ({topKind.percentage}%)
            <TrendingUp className="h-4 w-4" />
          </div>
        )}
        <div className="text-muted-foreground leading-none">
          Showing distribution of your last {stats.totalEvents} events
        </div>
      </CardFooter>
    </Card>
  )
}
