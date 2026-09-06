import { Bell, BellRing, Heart, MessageCircle, Repeat2, UserPlus, Zap } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthor } from '@/hooks/useAuthor';
import { useNotificationReadState, useNotifications, type Notification, type NotificationKind } from '@/hooks/useNotifications';
import { useWindowManager } from '@/os/useWindowManager';
import { displayName, relativeTime, rootReference } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';

const ICONS: Record<NotificationKind, typeof Bell> = {
  mention: MessageCircle,
  reply: MessageCircle,
  reaction: Heart,
  repost: Repeat2,
  follow: UserPlus,
  zap: Zap,
};

const LABELS: Record<NotificationKind, string> = {
  mention: 'mentioned you',
  reply: 'replied to you',
  reaction: 'reacted to your note',
  repost: 'reposted your note',
  follow: 'followed you',
  zap: 'sent you a zap',
};

/** A desktop popover and mobile sheet backed by the same notification feed. */
export function NotificationsPopover() {
  const state = useNotificationState();
  if (!state) return null;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <NotificationButton unreadCount={state.unreadCount} />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-1rem))] overflow-hidden p-0">
        <NotificationFeed state={state} />
      </PopoverContent>
    </Popover>
  );
}

/** On compact layouts a sheet gives notification rows room to breathe. */
export function NotificationsSheet() {
  const state = useNotificationState();
  const [open, setOpen] = useState(false);
  if (!state) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <NotificationButton unreadCount={state.unreadCount} />
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[calc(100dvh-3rem)] max-h-none gap-0 rounded-t-xl p-0">
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>Recent activity around your notes and profile.</SheetDescription>
        </SheetHeader>
        <NotificationFeed state={state} onNavigate={() => setOpen(false)} showHeading={false} />
      </SheetContent>
    </Sheet>
  );
}

function useNotificationState() {
  const query = useNotifications();
  const { lastReadAt, markAllRead } = useNotificationReadState();
  const notifications = query.data ?? [];
  const unreadCount = notifications.filter(({ event }) => event.created_at > lastReadAt).length;

  return query.isFetching || query.isError || notifications.length > 0 || query.isSuccess
    ? { ...query, notifications, unreadCount, lastReadAt, markAllRead }
    : null;
}

function NotificationButton({ unreadCount }: { unreadCount: number }) {
  const label = unreadCount > 0
    ? `Notifications, ${unreadCount > 99 ? '99 or more' : unreadCount} unread`
    : 'Notifications, no unread notifications';

  return (
    <button
      type="button"
      className="relative flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={label}
    >
      {unreadCount > 0 ? <BellRing className="size-3.5" aria-hidden /> : <Bell className="size-3.5" aria-hidden />}
      {unreadCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground tabular-nums">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

type NotificationState = NonNullable<ReturnType<typeof useNotificationState>>;

function NotificationFeed({
  state,
  onNavigate,
  showHeading = true,
}: {
  state: NotificationState;
  onNavigate?: () => void;
  showHeading?: boolean;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Notifications">
      {showHeading && (
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <PopoverHeader>
            <PopoverTitle>Notifications</PopoverTitle>
            <PopoverDescription>Activity around your notes and profile.</PopoverDescription>
          </PopoverHeader>
          <MarkAllReadButton state={state} />
        </div>
      )}
      {!showHeading && (
        <div className="flex justify-end border-b px-4 py-2">
          <MarkAllReadButton state={state} />
        </div>
      )}

      <div className="os-scroll min-h-0 flex-1 overflow-y-auto">
        {state.isLoading ? <LoadingNotifications /> : null}
        {state.isError ? <NotificationError /> : null}
        {state.isSuccess && state.notifications.length === 0 ? <EmptyNotifications /> : null}
        {state.isSuccess && state.notifications.map((notification) => (
          <NotificationRow
            key={notification.event.id}
            notification={notification}
            unread={notification.event.created_at > state.lastReadAt}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}

function MarkAllReadButton({ state }: { state: NotificationState }) {
  if (state.unreadCount === 0) return null;
  return (
    <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={state.markAllRead}>
      Mark all read
    </Button>
  );
}

function NotificationRow({ notification, unread, onNavigate }: { notification: Notification; unread: boolean; onNavigate?: () => void }) {
  const { openApp } = useWindowManager();
  const { data } = useAuthor(notification.event.pubkey);
  const Icon = ICONS[notification.kind];
  const author = displayName(notification.event.pubkey, data?.metadata);
  const preview = notification.event.content.replace(/\s+/g, ' ').trim();
  const targetEvent = notification.kind === 'mention' || notification.kind === 'reply'
    ? notification.event.id
    : rootReference(notification.event);

  const openNotification = () => {
    if (targetEvent) openApp('notes', { id: targetEvent });
    else openApp('profile', { pubkey: notification.event.pubkey });
    onNavigate?.();
  };

  return (
    <button
      type="button"
      onClick={openNotification}
      className={cn(
        'flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-ring',
        unread && 'bg-primary/[0.06]',
      )}
    >
      <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground', unread && 'bg-primary/15 text-primary')}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{author}</span>
          <time className="ml-auto shrink-0 text-xs text-muted-foreground" dateTime={new Date(notification.event.created_at * 1000).toISOString()}>
            {relativeTime(notification.event.created_at)}
          </time>
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{LABELS[notification.kind]}</span>
        {preview && <span className="mt-1 block line-clamp-2 text-sm text-foreground/80">{preview}</span>}
      </span>
      {unread && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
    </button>
  );
}

function LoadingNotifications() {
  return <div className="space-y-4 p-4" aria-label="Loading notifications"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-4/5" /><Skeleton className="h-12 w-11/12" /></div>;
}

function EmptyNotifications() {
  return <div className="m-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No notifications yet. When someone interacts with your notes or profile, they’ll appear here.</div>;
}

function NotificationError() {
  return <div className="m-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Notifications could not be loaded. Check your relay connection and try again.</div>;
}
