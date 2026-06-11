import { RadioTower, InfoIcon } from 'lucide-react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/navigation/AppSidebar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { RelayListManager } from '@/components/relays/RelayListManager';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function DashboardRelays() {
  const { user } = useCurrentUser();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full overflow-x-hidden">
        <AppSidebar />
        <main className="min-w-0 flex-1">
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
            <SidebarTrigger />
            <h1 className="truncate text-lg font-semibold md:text-xl">Relay Lists</h1>
          </div>

          <div className="flex-1 space-y-6 overflow-x-hidden p-4 md:p-6 lg:p-8">
            {!user ? (
              <Card className="border-dashed">
                <CardContent className="px-8 py-12 text-center">
                  <div className="mx-auto max-w-sm space-y-4">
                    <Alert>
                      <InfoIcon className="h-4 w-4" />
                      <AlertDescription>Please log in to view and publish your relay lists.</AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="mx-auto max-w-5xl space-y-6">
                <div className="flex items-start gap-4">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <RadioTower className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Your relay map</h2>
                    <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                      Control where clients find your events, which relay feeds you recommend, and the named relay groups you reuse.
                    </p>
                  </div>
                </div>
                <RelayListManager pubkey={user.pubkey} />
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

export default DashboardRelays;
