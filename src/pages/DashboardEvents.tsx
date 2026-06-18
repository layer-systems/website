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
      <div className="flex min-h-screen w-full overflow-x-hidden bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0">
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b-2 border-foreground bg-background/95 px-4 backdrop-blur lg:h-[60px] lg:px-6">
            <SidebarTrigger />
            <h1 className="truncate text-lg font-black uppercase md:text-xl">My Events</h1>
          </div>

          <div className="flex-1 space-y-6 overflow-x-hidden bg-[linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px),linear-gradient(180deg,hsl(var(--border))_1px,transparent_1px)] bg-[size:32px_32px] p-4 md:p-6 lg:p-8">
            {!user ? (
              <Card className="rounded-none border-2 border-dashed border-foreground bg-card shadow-[6px_6px_0_hsl(var(--primary))]">
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
                <div className="border-2 border-foreground bg-card p-5 shadow-[6px_6px_0_hsl(var(--primary))]">
                  <div className="mb-4 inline-flex border-2 border-foreground bg-primary px-3 py-1 text-xs font-black uppercase text-primary-foreground">
                    Event explorer
                  </div>
                  <h2 className="break-words text-3xl font-black leading-none md:text-5xl">
                    Your Nostr events
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-muted-foreground md:text-base">
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
