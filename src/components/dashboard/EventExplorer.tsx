import { useMemo, useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useUserStats } from '@/hooks/useUserStats';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, Search, Info } from 'lucide-react';

const kindLabels: Record<number, string> = {
  0: 'Metadata',
  1: 'Text Note',
  3: 'Contacts',
  4: 'DM',
  5: 'Deletion',
  6: 'Repost',
  7: 'Reaction',
  16: 'Generic Repost',
  40: 'Channel Create',
  41: 'Channel Metadata',
  42: 'Channel Message',
  43: 'Channel Hide',
  44: 'Channel Mute',
  1984: 'Report',
  9735: 'Zap',
  10002: 'Relay List',
  30023: 'Article',
};

interface EventExplorerProps {
  pubkey: string;
}

const EVENTS_PER_PAGE = 20;

export function EventExplorer({ pubkey }: EventExplorerProps) {
  const { data: stats, isLoading, isError } = useUserStats(pubkey);
  const { mutateAsync: publishDeletion, isPending } = useNostrPublish();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<NostrEvent | null>(null);
  const [reason, setReason] = useState('I would like this event to be deleted.');

  const filteredEvents = useMemo(() => {
    if (!stats) return [];

    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return stats.events;
    }

    return stats.events.filter((event) => {
      if (!event.content) return false;
      return event.content.toLowerCase().includes(normalizedSearch);
    });
  }, [stats, search]);

  const totalPages = useMemo(() => {
    if (filteredEvents.length === 0) return 1;
    return Math.ceil(filteredEvents.length / EVENTS_PER_PAGE);
  }, [filteredEvents.length]);

  const pageSafe = Math.min(Math.max(page, 1), totalPages);

  const paginatedEvents = useMemo(() => {
    const start = (pageSafe - 1) * EVENTS_PER_PAGE;
    const end = start + EVENTS_PER_PAGE;
    return filteredEvents.slice(start, end);
  }, [filteredEvents, pageSafe]);

  const handleOpenDialog = (event: NostrEvent) => {
    setSelectedEvent(event);
    setReason('I would like this event to be deleted.');
  };

  const handleRequestDeletion = async () => {
    if (!selectedEvent) return;

    try {
      await publishDeletion({
        kind: 5,
        content: reason.trim() || 'Requesting deletion of this event.',
        tags: [
          ['e', selectedEvent.id],
          ['p', selectedEvent.pubkey],
        ],
      });

      toast({
        title: 'Deletion request sent',
        description: 'A Nostr deletion event has been published.',
      });

      setSelectedEvent(null);
    } catch (error) {
      console.error('Failed to publish deletion event:', error);
      toast({
        title: 'Deletion request failed',
        description: 'Unable to publish deletion request. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !stats) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Your Events</CardTitle>
          <CardDescription>
            Explore your published events and manage deletion requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load your events. Please check your relay connections and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (stats.events.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Your Events</CardTitle>
          <CardDescription>
            Explore your published events and manage deletion requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center space-y-3 py-8 text-center">
            <Info className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-md">
              You have not published any events yet. Once you start posting on Nostr, your activity will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Your Events</CardTitle>
            <CardDescription>
              Browse your published events and request deletion directly from your dashboard.
            </CardDescription>
          </div>
          <div className="w-full sm:w-64">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search content..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="pr-4">
            <div className="space-y-3">
              {paginatedEvents.map((event) => {
                const label = kindLabels[event.kind] || `Kind ${event.kind}`;
                const createdAt = new Date(event.created_at * 1000);
                const contentPreview = event.content
                  ? event.content.slice(0, 120) + (event.content.length > 120 ? '…' : '')
                  : 'No content';

                return (
                  <div
                    key={event.id}
                    className="flex flex-col gap-2 rounded-lg border bg-card/40 p-3 transition hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {createdAt.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 max-w-xl">
                        {contentPreview}
                      </p>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <AlertDialog
                        open={selectedEvent?.id === event.id}
                        onOpenChange={(open) => {
                          if (!open) {
                            setSelectedEvent((current) =>
                              current?.id === event.id ? null : current,
                            );
                          } else {
                            handleOpenDialog(event);
                          }
                        }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="whitespace-nowrap"
                          onClick={() => handleOpenDialog(event)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Request deletion
                        </Button>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Request deletion of this event?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will publish a Nostr deletion event (kind 5) referencing the
                              selected event. Relays and clients may remove or hide the original
                              event in response.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="space-y-3 py-2 text-sm">
                            <div className="rounded-md bg-muted px-3 py-2">
                              <div className="flex items-center justify-between mb-1">
                                <Badge variant="secondary" className="text-2xs">
                                  {label}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {createdAt.toLocaleString()}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-3">
                                {contentPreview}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-foreground">
                                Deletion reason (optional)
                              </p>
                              <Textarea
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                className="min-h-[80px] text-sm"
                                placeholder="Explain why you are requesting this deletion."
                              />
                            </div>
                          </div>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleRequestDeletion}
                              disabled={isPending}
                            >
                              {isPending ? 'Publishing…' : 'Publish deletion request'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing
              {' '}
              <span className="font-medium">
                {paginatedEvents.length === 0
                  ? 0
                  : (pageSafe - 1) * EVENTS_PER_PAGE + 1}
              </span>
              {' '}
              to
              {' '}
              <span className="font-medium">
                {(pageSafe - 1) * EVENTS_PER_PAGE + paginatedEvents.length}
              </span>
              {' '}
              of
              {' '}
              <span className="font-medium">{filteredEvents.length}</span>
              {' '}
              events
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pageSafe <= 1}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Previous
              </Button>
              <span>
                Page
                {' '}
                <span className="font-medium">{pageSafe}</span>
                {' '}
                of
                {' '}
                <span className="font-medium">{totalPages}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pageSafe >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(current + 1, totalPages))
                }
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
