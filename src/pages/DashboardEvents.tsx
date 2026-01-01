import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/navigation/AppSidebar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';
import { EventExplorer } from '@/components/dashboard/EventExplorer';

export function DashboardEvents() {
  const { user } = useCurrentUser();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full overflow-x-hidden">
        <AppSidebar />
        <main className="flex-1 min-w-0">
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold md:text-xl truncate">My Events</h1>
          </div>

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
        </main>
      </div>
    </SidebarProvider>
  );
}

export default DashboardEvents;
