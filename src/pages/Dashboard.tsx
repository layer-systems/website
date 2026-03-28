import { DashboardLayout } from '@/components/DashboardLayout';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { EventKindsChart } from '@/components/dashboard/EventKindsChart';
import { RecentActivityChart } from '@/components/dashboard/RecentActivityChart';
import { RecentActivityList } from '@/components/dashboard/RecentActivityList';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';
import { Account, useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { genUserName } from '@/lib/genUserName';

export function Dashboard() {
  const { user } = useCurrentUser();
  const { currentUser } = useLoggedInAccounts();

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? genUserName(account.pubkey);
  };

  return (
    <DashboardLayout title="Dashboard">
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
          <div className="space-y-1">
            <h2 className="font-serif text-2xl font-bold tracking-tight md:text-3xl break-words">
              Welcome back{currentUser ? `, ${getDisplayName(currentUser)}` : ''}
            </h2>
            <p className="text-sm text-muted-foreground md:text-base">
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
    </DashboardLayout>
  );
}

export default Dashboard;
