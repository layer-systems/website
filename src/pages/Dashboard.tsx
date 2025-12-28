import { useSeoMeta } from '@unhead/react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useAppContext } from '@/hooks/useAppContext';
import type { NostrMetadata } from '@nostrify/nostrify';
import type { AppConfig } from '@/contexts/AppContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  LayoutDashboard, 
  User, 
  Settings, 
  MessageSquare,
  Activity,
  Server,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { genUserName } from '@/lib/genUserName';
import { nip19 } from 'nostr-tools';

const DashboardPage = () => {
  const location = useLocation();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const author = useAuthor(user?.pubkey ?? '');
  const metadata = author.data?.metadata;

  useSeoMeta({
    title: 'Dashboard - LAYER.systems',
    description: 'Your personal Nostr dashboard',
  });

  const displayName = metadata?.display_name ?? metadata?.name ?? (user ? genUserName(user.pubkey) : 'Anonymous');
  const profileImage = metadata?.picture;

  const sidebarItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
    { path: '/dashboard/profile', icon: User, label: 'Profile' },
    { path: '/dashboard/messages', icon: MessageSquare, label: 'Messages' },
    { path: '/dashboard/relays', icon: Server, label: 'Relays' },
    { path: '/dashboard/settings', icon: Settings, label: 'Settings' },
  ];

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-md mx-auto border-2 shadow-xl">
            <CardHeader className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4">
                <LayoutDashboard className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl">Access Dashboard</CardTitle>
              <p className="text-sm text-muted-foreground">
                Please log in to view your personal dashboard
              </p>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
              <LoginArea className="flex w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isExactPath = location.pathname === '/dashboard';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center transform group-hover:scale-110 transition-transform">
              <span className="text-white font-bold text-sm">L</span>
            </div>
            <span className="font-semibold text-lg hidden sm:inline">LAYER.systems</span>
          </Link>
          
          <div className="flex items-center space-x-4">
            <Link to="/explore">
              <Button variant="ghost" size="sm" className="hidden sm:flex">
                <Activity className="h-4 w-4 mr-2" />
                Explore
              </Button>
            </Link>
            <LoginArea className="max-w-60" />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <Card className="sticky top-24 border-2 shadow-lg overflow-hidden">
              {/* Profile Section */}
              <div className="relative h-24 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700">
                <div className="absolute inset-0 bg-black/10" />
              </div>
              
              <CardContent className="pt-0 pb-4">
                <div className="flex flex-col items-center -mt-12 mb-4">
                  <Avatar className="h-20 w-20 border-4 border-white dark:border-slate-950 shadow-xl ring-2 ring-blue-500/20">
                    <AvatarImage src={profileImage} alt={displayName} />
                    <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                      {displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <h3 className="mt-3 font-semibold text-lg text-center">{displayName}</h3>
                  {metadata?.nip05 && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      ✓ {metadata.nip05}
                    </Badge>
                  )}
                </div>

                <Separator className="my-4" />

                {/* Navigation */}
                <nav className="space-y-1">
                  {sidebarItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    const Icon = item.icon;
                    
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${
                          isActive
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Icon className={`h-4 w-4 ${isActive ? 'text-white' : ''}`} />
                          <span className="font-medium text-sm">{item.label}</span>
                        </div>
                        {isActive && <ChevronRight className="h-4 w-4" />}
                      </Link>
                    );
                  })}
                </nav>
              </CardContent>
            </Card>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-3">
            {isExactPath ? (
              <DashboardOverview user={user} metadata={metadata} config={config} />
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

interface DashboardOverviewProps {
  user: { pubkey: string; signer: unknown };
  metadata: NostrMetadata | undefined;
  config: AppConfig;
}

const DashboardOverview = ({ user, metadata, config }: DashboardOverviewProps) => {
  const displayName = metadata?.display_name ?? metadata?.name ?? genUserName(user.pubkey);
  const npub = nip19.npubEncode(user.pubkey);
  const relays = config.relayMetadata?.relays ?? [];
  const readRelays = relays.filter((r) => r.read);
  const writeRelays = relays.filter((r) => r.write);

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 shadow-2xl">
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-400/20 rounded-full -ml-24 -mb-24 blur-2xl" />
        
        <div className="relative">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Welcome back, {displayName}! 👋
          </h1>
          <p className="text-blue-100 text-lg">
            Here's an overview of your Nostr identity and connected relays
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-2 shadow-md hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Relays</p>
                <p className="text-3xl font-bold mt-1">{relays.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 shadow-md hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Read Relays</p>
                <p className="text-3xl font-bold mt-1">{readRelays.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <Activity className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 shadow-md hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Write Relays</p>
                <p className="text-3xl font-bold mt-1">{writeRelays.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Personal Data Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Information */}
        <Card className="border-2 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Profile Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataRow label="Display Name" value={metadata?.display_name ?? metadata?.name ?? 'Not set'} />
            <DataRow label="Username" value={metadata?.name ?? 'Not set'} />
            <DataRow label="NIP-05" value={metadata?.nip05 ?? 'Not verified'} />
            <DataRow label="About" value={metadata?.about ?? 'No bio provided'} multiline />
            <DataRow label="Website" value={metadata?.website ?? 'Not set'} link />
            <DataRow label="Lightning" value={metadata?.lud16 ?? metadata?.lud06 ?? 'Not set'} />
          </CardContent>
        </Card>

        {/* Identity & Keys */}
        <Card className="border-2 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="h-5 w-5" />
              <span>Identity & Keys</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Public Key (npub)</p>
              <div className="flex items-center space-x-2">
                <code className="flex-1 text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded border overflow-x-auto">
                  {npub}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(npub)}
                  className="shrink-0"
                >
                  Copy
                </Button>
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Hex Public Key</p>
              <div className="flex items-center space-x-2">
                <code className="flex-1 text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded border overflow-x-auto">
                  {user.pubkey}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(user.pubkey)}
                  className="shrink-0"
                >
                  Copy
                </Button>
              </div>
            </div>

            <Link to={`/${npub}`}>
              <Button variant="outline" className="w-full" size="sm">
                <ExternalLink className="h-4 w-4 mr-2" />
                View Public Profile
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Connected Relays */}
      <Card className="border-2 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="h-5 w-5" />
            <span>Connected Relays</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {relays.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No relays configured</p>
          ) : (
            <div className="space-y-2">
              {relays.map((relay: { url: string; read: boolean; write: boolean }, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 dark:bg-slate-900 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
                    <span className="text-sm font-mono truncate">{relay.url}</span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0 ml-2">
                    {relay.read && (
                      <Badge variant="secondary" className="text-xs">
                        Read
                      </Badge>
                    )}
                    {relay.write && (
                      <Badge variant="secondary" className="text-xs">
                        Write
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

interface DataRowProps {
  label: string;
  value: string;
  multiline?: boolean;
  link?: boolean;
}

const DataRow = ({ label, value, multiline, link }: DataRowProps) => (
  <div>
    <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
    {link && value !== 'Not set' ? (
      <a
        href={value.startsWith('http') ? value : `https://${value}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
      >
        <span className={multiline ? '' : 'truncate'}>{value}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    ) : (
      <p className={`text-sm ${multiline ? 'whitespace-pre-wrap' : 'truncate'}`}>{value}</p>
    )}
  </div>
);

export default DashboardPage;
