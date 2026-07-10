import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';
import { EventExplorer } from '@/components/dashboard/EventExplorer';
import { OsShell } from '@/components/navigation/OsShell';
import { useSeoMeta } from '@unhead/react';

export function DashboardEvents() {
  const { user } = useCurrentUser();

  useSeoMeta({ title: 'Studio · Nostr OS', description: 'Browse and manage your published Nostr events.' });

  return (
    <OsShell title="Studio" eyebrow="Event workspace">
      <div className="space-y-6 overflow-x-hidden">
            {!user ? (
              <Card className="border-dashed bg-card/70">
                <CardContent className="py-16 px-8 text-center">
                  <div className="max-w-sm mx-auto space-y-4">
                    <Alert>
                      <InfoIcon className="h-4 w-4" />
                      <AlertDescription>
                        Please log in to explore your events and manage deletion requests.
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <section className="rounded-3xl border border-border/70 bg-card/70 p-5 sm:p-7">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Personal event index</p>
                  <h2 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight break-words">
                    Your Nostr events
                  </h2>
                  <p className="mt-3 text-sm md:text-base text-muted-foreground max-w-2xl">
                    Browse all events you have published on Nostr, search through their content,
                    and publish deletion requests when you want something removed.
                  </p>
                </section>

                <EventExplorer pubkey={user.pubkey} />
              </div>
            )}
      </div>
    </OsShell>
  );
}

export default DashboardEvents;
