import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Hash, Activity, Clock } from 'lucide-react';
import { useUserStats } from '@/hooks/useUserStats';

interface DashboardStatsProps {
  pubkey: string;
}

export function DashboardStats({ pubkey }: DashboardStatsProps) {
  const { data: stats, isLoading } = useUserStats(pubkey);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="rounded-none border-2 border-foreground bg-card shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const lastActivityDate = stats.lastActivity 
    ? new Date(stats.lastActivity * 1000).toLocaleDateString()
    : 'Never';

  const uniqueKinds = Object.keys(stats.eventsByKind).length;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="rounded-none border-2 border-foreground bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-black uppercase">Loaded Events</CardTitle>
          <FileText className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="font-mono text-3xl font-black">{stats.totalEvents}</div>
          <p className="text-xs text-muted-foreground">
            All events loaded
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-none border-2 border-foreground bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-black uppercase">Event Types</CardTitle>
          <Hash className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="font-mono text-3xl font-black">{uniqueKinds}</div>
          <p className="text-xs text-muted-foreground">
            Different kinds used
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-none border-2 border-foreground bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-black uppercase">Most Used</CardTitle>
          <Activity className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="font-mono text-3xl font-black">
            {Object.entries(stats.eventsByKind).length > 0
              ? `Kind ${
                  Object.entries(stats.eventsByKind).sort(
                    ([, a], [, b]) => b - a
                  )[0][0]
                }`
              : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground">
            {Object.entries(stats.eventsByKind).length > 0
              ? `${
                  Object.entries(stats.eventsByKind).sort(
                    ([, a], [, b]) => b - a
                  )[0][1]
                } events`
              : 'No events yet'}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-none border-2 border-foreground bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-black uppercase">Last Activity</CardTitle>
          <Clock className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="font-mono text-3xl font-black">
            {stats.lastActivity
              ? new Date(stats.lastActivity * 1000).toLocaleDateString(
                  undefined,
                  { month: 'short', day: 'numeric' }
                )
              : 'Never'}
          </div>
          <p className="text-xs text-muted-foreground">{lastActivityDate}</p>
        </CardContent>
      </Card>
    </div>
  );
}
