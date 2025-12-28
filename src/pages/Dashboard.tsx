import { useSeoMeta } from "@unhead/react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardOverview } from "@/components/DashboardOverview";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export function Dashboard() {
  const { user } = useCurrentUser();

  useSeoMeta({
    title: "Dashboard - LAYER.systems",
    description: "View your Nostr activity and statistics",
  });

  return (
    <DashboardLayout>
      {!user ? (
        <div className="max-w-4xl mx-auto">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Please log in to view your dashboard. Use the login area in the sidebar to get started.
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Welcome back!</h2>
            <p className="text-muted-foreground">
              Here's an overview of your Nostr activity
            </p>
          </div>
          <DashboardOverview />
        </div>
      )}
    </DashboardLayout>
  );
}

export default Dashboard;
