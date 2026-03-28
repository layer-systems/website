import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/navigation/AppSidebar';
import { Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LoginArea } from '@/components/auth/LoginArea';

interface DashboardLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function DashboardLayout({ title, children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full overflow-x-hidden bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0">
          {/* Top bar */}
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-lg px-4 lg:h-[60px] lg:px-6">
            <SidebarTrigger />
            <h1 className="flex-1 truncate font-serif text-lg font-semibold md:text-xl">
              {title}
            </h1>
            <div className="hidden sm:flex items-center gap-3">
              <Link
                to="/"
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Layers className="h-3.5 w-3.5" />
                Home
              </Link>
              <LoginArea className="max-w-48" />
            </div>
          </div>

          {/* Page content */}
          <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8 overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
