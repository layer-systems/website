import { useEffect } from 'react';
import { HardDrive, Images, Upload } from 'lucide-react';
import { LoginRequired } from '@/components/nostr/LoginRequired';
import { AppLayout, AppToolbar } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { useBlossomLibrary } from '@/hooks/useBlossom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';
import type { AppProps } from '@/os/types';
import { Library } from './Library';
import { ServersPanel } from './ServersPanel';
import { UploadPanel } from './UploadPanel';

type Tab = 'library' | 'upload' | 'servers';

const TABS: { value: Tab; label: string; icon: typeof Images }[] = [
  { value: 'library', label: 'Library', icon: Images },
  { value: 'upload', label: 'Upload', icon: Upload },
  { value: 'servers', label: 'Servers', icon: HardDrive },
];

/**
 * Blossom media manager: browse, upload, mirror and delete the signed-in
 * user's blobs across their servers. Param: `tab`.
 */
export default function MediaApp({ params, setParams, setTitle }: AppProps) {
  const { user } = useCurrentUser();
  const library = useBlossomLibrary();
  const tab: Tab = params.tab === 'upload' || params.tab === 'servers' ? params.tab : 'library';

  useEffect(() => setTitle('Media'), [setTitle]);

  const setTab = (next: Tab) => setParams(next === 'library' ? {} : { tab: next });

  if (!user) {
    return <LoginRequired action="manage your media" />;
  }

  return (
    <AppLayout>
      <AppToolbar>
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg bg-muted p-1 sm:max-w-sm" role="tablist" aria-label="Media sections">
          {TABS.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="sm"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn('h-7 flex-1 gap-1.5 px-2 text-xs', tab === value && 'bg-background shadow-sm')}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </Button>
          ))}
        </div>
      </AppToolbar>

      {tab === 'library' && <Library library={library} onUpload={() => setTab('upload')} onServers={() => setTab('servers')} />}
      {tab === 'upload' && <UploadPanel library={library} onDone={() => setTab('library')} onServers={() => setTab('servers')} />}
      {tab === 'servers' && <ServersPanel library={library} />}
    </AppLayout>
  );
}
