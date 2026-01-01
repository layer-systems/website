import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserStats } from '@/hooks/useUserStats';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RecentActivityListProps {
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

export function RecentActivityList({ pubkey }: RecentActivityListProps) {
  const { data: stats, isLoading } = useUserStats(pubkey);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-full max-w-sm" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.recentEvents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            No recent activity
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Your latest {stats.recentEvents.length} events</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {stats.recentEvents.map((event) => {
              const kindName = kindNames[event.kind] || `Kind ${event.kind}`;
              const timestamp = new Date(event.created_at * 1000);
              const relativeTime = getRelativeTime(timestamp);
              
              // Get preview of content
              const contentPreview = event.content
                ? event.content.slice(0, 100) + (event.content.length > 100 ? '...' : '')
                : 'No content';

              return (
                <div
                  key={event.id}
                  className="flex items-start justify-between border-b pb-3 last:border-0"
                >
                  <div className="space-y-1 flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {kindName}
                      </Badge>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {relativeTime}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 break-all">
                      {contentPreview}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}
