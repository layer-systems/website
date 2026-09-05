import { Home, LayoutDashboard, FileText, Download, Compass, MessageCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { LoginArea } from '@/components/auth/LoginArea';
import { Wordmark } from '@/components/brand/Wordmark';

const navigationItems = [
  {
    title: 'Home',
    url: '/',
    icon: Home,
  },
  {
    title: 'Explore',
    url: '/explore',
    icon: Compass,
  },
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'My Events',
    url: '/dashboard/events',
    icon: FileText,
  },
  {
    title: 'Export Following',
    url: '/dashboard/export',
    icon: Download,
  },
  {
    title: 'Messages',
    url: '/messages',
    icon: MessageCircle,
  },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/" className="flex items-center px-2 py-1 transition-opacity hover:opacity-80">
          <Wordmark className="text-base" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="eyebrow">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="p-2">
          <LoginArea className="w-full" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
