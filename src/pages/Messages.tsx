import { useSeoMeta } from '@unhead/react';
import { DMMessagingInterface } from '@/components/dm/DMMessagingInterface';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/navigation/AppSidebar';

const Messages = () => {
  useSeoMeta({
    title: 'Messages — LAYER.systems',
    description: 'Private, end-to-end encrypted messaging on Nostr.',
  });

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
            <SidebarTrigger />
            <h1 className="font-display text-lg font-semibold md:text-xl truncate">Messages</h1>
          </div>

          <div className="flex-1 min-h-0 p-4">
            <DMMessagingInterface className="h-full" />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Messages;
