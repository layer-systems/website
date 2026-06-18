import { Download, FileText, Home, LayoutDashboard, Radio } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { LoginArea } from '@/components/auth/LoginArea';

const navigationItems = [
  {
    title: 'Home',
    url: '/',
    icon: Home,
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
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar className="border-r-2 border-foreground">
      <SidebarContent>
        <SidebarGroup>
          <div className="m-2 mb-4 border-2 border-foreground bg-primary p-3 text-primary-foreground shadow-[4px_4px_0_hsl(var(--foreground))]">
            <div className="flex items-center gap-2 font-black uppercase leading-none">
              <Radio className="h-5 w-5" />
              LAYER.systems
            </div>
            <p className="mt-2 text-xs font-bold uppercase">Relay dashboard</p>
          </div>
          <SidebarGroupLabel className="font-black uppercase text-foreground">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="rounded-none font-bold data-[active=true]:border-2 data-[active=true]:border-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                    >
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
