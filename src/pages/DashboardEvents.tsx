import { DashboardLayout } from '@/components/DashboardLayout';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';
import { EventExplorer } from '@/components/dashboard/EventExplorer';

export function DashboardEvents() {
  const { user } = useCurrentUser();

  return (
    <DashboardLayout title="My Events">
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
          <div className="space-y-1">
            <h2 className="font-serif text-2xl font-bold tracking-tight md:text-3xl break-words">
              Your Nostr Events
            </h2>
            <p className="text-sm text-muted-foreground md:text-base max-w-2xl">
              Browse all events you have published on Nostr, search through their content,
              and publish deletion requests when you want something removed.
            </p>
          </div>

          <EventExplorer pubkey={user.pubkey} />
        </div>
      )}
    </DashboardLayout>
  );
}

export default DashboardEvents;
