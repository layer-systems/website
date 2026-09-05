import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';
import { EventExplorer } from '@/components/dashboard/EventExplorer';

/** The My Events ("Finder") app, rendered inside an OS window — see docs/DESKTOP_OS.md. */
export function DashboardEvents() {
  const { user } = useCurrentUser();

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8 overflow-x-hidden">
        {!user ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center">
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
            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight break-words">
                Your Nostr events
              </h2>
              <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
                Browse all events you have published on Nostr, search through their content,
                and publish deletion requests when you want something removed.
              </p>
            </div>

            <EventExplorer pubkey={user.pubkey} />
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardEvents;
