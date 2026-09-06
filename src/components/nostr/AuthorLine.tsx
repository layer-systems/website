import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import { useWindowManager } from '@/os/useWindowManager';
import { absoluteTime, displayName, relativeTime, sanitizeUrl } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';

interface AuthorLineProps {
  pubkey: string;
  createdAt?: number;
  size?: 'sm' | 'md';
  className?: string;
}

/** Avatar, name, optional timestamp — the header of every note. */
export function AuthorLine({ pubkey, createdAt, size = 'md', className }: AuthorLineProps) {
  const { openApp } = useWindowManager();
  const { data } = useAuthor(pubkey);
  const name = displayName(pubkey, data?.metadata);
  const picture = sanitizeUrl(data?.metadata?.picture);
  const nip05 = data?.metadata?.nip05;

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => openApp('profile', { pubkey })}
        className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={`Open the profile of ${name}`}
      >
        <Avatar className={size === 'sm' ? 'size-7' : 'size-9'}>
          {picture && <AvatarImage src={picture} alt="" />}
          <AvatarFallback className="text-xs">
            {name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </button>

      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <button
          type="button"
          onClick={() => openApp('profile', { pubkey })}
          className="truncate text-sm font-semibold hover:underline"
        >
          {name}
        </button>
        {nip05 && (
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {nip05}
          </span>
        )}
        {createdAt !== undefined && (
          <time
            dateTime={new Date(createdAt * 1000).toISOString()}
            title={absoluteTime(createdAt)}
            className="ml-auto shrink-0 text-xs text-muted-foreground"
          >
            {relativeTime(createdAt)}
          </time>
        )}
      </div>
    </div>
  );
}
