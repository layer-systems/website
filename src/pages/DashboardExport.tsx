import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostr } from '@nostrify/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InfoIcon, Download, Users, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { OsShell } from '@/components/navigation/OsShell';
import { useSeoMeta } from '@unhead/react';

export function DashboardExport() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const [isExporting, setIsExporting] = useState(false);

  useSeoMeta({ title: 'Archive · Nostr OS', description: 'Export and preserve your Nostr following list.' });

  // Fetch the user's contact list (kind 3 event)
  const { data: contactListEvent, isLoading } = useQuery({
    queryKey: ['contact-list', user?.pubkey],
    queryFn: async (c) => {
      if (!user) return null;
      
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);
      const events = await nostr.query(
        [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
        { signal }
      );
      
      return events[0] || null;
    },
    enabled: !!user,
  });

  // Extract following list from the contact list event
  const followingList = contactListEvent?.tags
    .filter(([tag]) => tag === 'p')
    .map(([_, pubkey, relay, petname]) => ({
      pubkey,
      relay: relay || '',
      petname: petname || '',
    })) || [];

  const followingCount = followingList.length;
  const createdAt = contactListEvent?.created_at;
  const createdDate = createdAt ? new Date(createdAt * 1000) : null;

  const handleExport = () => {
    if (!contactListEvent) return;

    setIsExporting(true);

    try {
      // Prepare export data
      const exportData = {
        exported_at: new Date().toISOString(),
        pubkey: user?.pubkey,
        event: {
          id: contactListEvent.id,
          created_at: contactListEvent.created_at,
          kind: contactListEvent.kind,
          tags: contactListEvent.tags,
          content: contactListEvent.content,
          sig: contactListEvent.sig,
        },
        following: followingList,
        stats: {
          total_following: followingCount,
          event_created_at: createdDate?.toISOString(),
        },
      };

      // Create blob and download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nostr-following-backup-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <OsShell title="Archive" eyebrow="Portable identity">
      <div className="space-y-6 overflow-x-hidden">
            {!user ? (
              <Card className="border-dashed bg-card/70">
                <CardContent className="py-16 px-8 text-center">
                  <div className="max-w-sm mx-auto space-y-4">
                    <Alert>
                      <InfoIcon className="h-4 w-4" />
                      <AlertDescription>
                        Please log in to export your following list.
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="max-w-2xl mx-auto space-y-6">
                <section className="rounded-3xl border border-border/70 bg-card/70 p-5 sm:p-7">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Portable social graph</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">Keep your follows close.</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">Your Nostr social graph belongs to you. Export a signed copy whenever you need it.</p>
                </section>
                <Card className="border-border/70 bg-card/70">
                  <CardHeader>
                    <CardTitle>Backup Your Following List</CardTitle>
                    <CardDescription>
                      Export your contact list as a JSON file for backup or migration purposes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {isLoading ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-48" />
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-48" />
                          </div>
                        </div>
                      </div>
                    ) : !contactListEvent ? (
                      <Alert>
                        <InfoIcon className="h-4 w-4" />
                        <AlertDescription>
                          No following list found. You may need to follow some users first.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Card>
                            <CardContent className="pt-6">
                              <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Users className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Following</p>
                                  <p className="text-2xl font-bold">{followingCount}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardContent className="pt-6">
                              <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Calendar className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Last Updated</p>
                                  <p className="text-sm font-medium">
                                    {createdDate
                                      ? createdDate.toLocaleDateString('en-US', {
                                          year: 'numeric',
                                          month: 'short',
                                          day: 'numeric',
                                        })
                                      : 'Unknown'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {createdDate
                                      ? createdDate.toLocaleTimeString('en-US', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                      : ''}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-lg border p-4 space-y-2">
                            <h3 className="font-semibold text-sm">What's included:</h3>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              <li>• Complete list of all {followingCount} accounts you follow</li>
                              <li>• Public keys (pubkeys) for each account</li>
                              <li>• Relay hints and petnames (if available)</li>
                              <li>• Original event data and signature</li>
                              <li>• Timestamp of when the list was created</li>
                            </ul>
                          </div>

                          <Button
                            onClick={handleExport}
                            disabled={isExporting || !contactListEvent}
                            className="w-full"
                            size="lg"
                          >
                            <Download className="mr-2 h-5 w-5" />
                            {isExporting ? 'Exporting...' : 'Export as JSON'}
                          </Button>

                          <p className="text-xs text-muted-foreground text-center">
                            Your backup file will be saved to your downloads folder
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-base">About Your Following List</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                      Your following list is stored on Nostr as a kind 3 event. This backup includes
                      the complete event data, allowing you to restore your following list on any
                      compatible Nostr client.
                    </p>
                    <p>
                      The export includes all public keys (npubs) of accounts you follow, along with
                      optional relay hints and petnames that help clients find and display these
                      accounts.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
      </div>
    </OsShell>
  );
}
