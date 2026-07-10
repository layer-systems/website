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
import { OsShell } from '@/components/navigation/OsShell';
import { useSeoMeta } from '@unhead/react';

export function Dashboard() {
  const { user } = useCurrentUser();
  const { currentUser } = useLoggedInAccounts();

  useSeoMeta({ title: 'Activity · Nostr OS', description: 'Your Nostr activity at a glance.' });

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? genUserName(account.pubkey);
  }

  return (
    <OsShell title="Activity" eyebrow="Personal telemetry">
      <div className="space-y-6 overflow-x-hidden">
            {!user ? (
              <Card className="border-dashed bg-card/70">
                <CardContent className="py-16 px-8 text-center">
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
                <section className="rounded-3xl border border-border/70 bg-card/70 p-5 sm:p-7">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Identity dashboard</p>
                  <h2 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight break-words">
                    Welcome back {currentUser ? getDisplayName(currentUser) : ''}!
                  </h2>
                  <p className="mt-3 text-sm md:text-base text-muted-foreground">
                    Here's an overview of your Nostr activity and statistics.
                  </p>
                </section>

                <DashboardStats pubkey={user.pubkey} />

                <RecentActivityChart />

                <div className="grid gap-6 md:grid-cols-2">
                  <EventKindsChart />
                  <RecentActivityList pubkey={user.pubkey} />
                </div>
              </>
            )}
      </div>
    </OsShell>
  );
}

export default Dashboard;
