import { CalendarClock, CalendarDays, Link2, MapPin } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { ParsedCalendarEvent } from '@/lib/calendarEvents';
import { formatEventTimeRange } from '@/lib/calendarEvents';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRelayHints } from '@/hooks/useRelayHints';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/nostrUtils';

export function EventDetail({ event }: { event: ParsedCalendarEvent }) {
  return (
    <div className="p-5">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {event.allDay ? <CalendarDays className="size-3.5" aria-hidden /> : <CalendarClock className="size-3.5" aria-hidden />}
        {formatEventTimeRange(event)}
      </div>
      <h1 className="text-lg font-semibold leading-tight">{event.title}</h1>
      {event.summary && <p className="mt-1 text-sm text-muted-foreground">{event.summary}</p>}

      <div className="mt-3">
        <AuthorLine pubkey={event.event.pubkey} size="sm" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyEventLink event={event} />
        {event.hashtags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-[11px]">
            #{tag}
          </Badge>
        ))}
      </div>

      {event.image && (
        <img
          src={event.image}
          alt=""
          className="mt-4 max-h-64 w-full rounded-lg object-cover"
          loading="lazy"
        />
      )}

      {event.locations.length > 0 && (
        <div className="mt-4 space-y-1">
          {event.locations.map((location, index) => {
            const url = sanitizeUrl(location);
            return (
              <div key={index} className="flex items-start gap-1.5 text-sm">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="break-words text-primary hover:underline">
                    {location}
                  </a>
                ) : (
                  <span className="break-words">{location}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {event.description.trim() && (
        <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/90">{event.description}</p>
      )}

      {event.references.length > 0 && (
        <div className="mt-4 space-y-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Links</h2>
          {event.references.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 truncate text-sm text-primary hover:underline"
            >
              <Link2 className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{url}</span>
            </a>
          ))}
        </div>
      )}

      {event.participants.length > 0 && (
        <div className="mt-4 space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Participants</h2>
          {event.participants.map((participant) => (
            <AuthorLine key={participant.pubkey} pubkey={participant.pubkey} size="sm" />
          ))}
        </div>
      )}
    </div>
  );
}

function CopyEventLink({ event }: { event: ParsedCalendarEvent }) {
  const hints = useRelayHints();
  const { toast } = useToast();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={async () => {
        try {
          const naddr = nip19.naddrEncode({
            pubkey: event.event.pubkey,
            kind: event.kind,
            identifier: event.id,
            relays: hints,
          });
          await navigator.clipboard.writeText(`${window.location.origin}/${naddr}`);
          toast({ title: 'Link copied' });
        } catch {
          toast({ title: 'Could not copy the link', variant: 'destructive' });
        }
      }}
    >
      <Link2 className="size-3.5" aria-hidden />
      Copy link
    </Button>
  );
}
