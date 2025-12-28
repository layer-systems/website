import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/navigation/AppSidebar';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { EventKindsChart } from '@/components/dashboard/EventKindsChart';
import { RecentActivityChart } from '@/components/dashboard/RecentActivityChart';
import { RecentActivityList } from '@/components/dashboard/RecentActivityList';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';

export function Dashboard() {
  const { user } = useCurrentUser();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1">
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold md:text-xl">Dashboard</h1>
          </div>
          
          <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
            {!user ? (
              <Card className="border-dashed">
                <CardContent className="py-12 px-8 text-center">
                  <div className="max-w-sm mx-auto space-y-4">
                    <Alert>
                      <InfoIcon className="h-4 w-4" />
                      <AlertDescription>
                        Please log in to view your dashboard and activity statistics.
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold tracking-tight">
                    Welcome back!
                  </h2>
                  <p className="text-muted-foreground">
                    Here's an overview of your Nostr activity and statistics.
                  </p>
                </div>

                <DashboardStats pubkey={user.pubkey} />

                <RecentActivityChart />

                <div className="grid gap-6 md:grid-cols-2">
                  <EventKindsChart />
                  <RecentActivityList pubkey={user.pubkey} />
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

export default Dashboard;
