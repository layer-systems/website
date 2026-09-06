import { useEffect, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { nip05 } from 'nostr-tools';
import { Hash, Loader2, Search, UserRound } from 'lucide-react';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { NoteCard } from '@/components/nostr/NoteCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { displayName, sanitizeUrl } from '@/lib/nostrUtils';
import { useWindowManager } from '@/os/useWindowManager';
import type { AppProps } from '@/os/types';
import { parseSearchInput, type SearchInput } from './searchUtils';

const LIMIT = 50;

interface SearchResults {
  notes: NostrEvent[];
  profiles: NostrEvent[];
}

function profileMatches(event: NostrEvent, term: string): boolean {
  try {
    const metadata = JSON.parse(event.content) as NostrMetadata;
    const query = term.toLowerCase();
    return [metadata.name, metadata.display_name, metadata.nip05]
      .some((value) => value?.toLowerCase()?.includes(query));
  } catch {
    return false;
  }
}

function useSearch(input: SearchInput) {
  const { nostr } = useNostr();

  return useQuery<SearchResults>({
    queryKey: ['nostr', 'search', input],
    enabled: input.type !== 'empty',
    queryFn: async ({ signal }) => {
      const options = { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) };
      if (input.type === 'profile') {
        const events = await nostr.query(
          [
            { kinds: [0], authors: [input.pubkey], limit: LIMIT },
            { kinds: [1], authors: [input.pubkey], limit: LIMIT },
          ],
          { ...options, relays: input.relays },
        );
        return { notes: events.filter((event) => event.kind === 1), profiles: events.filter((event) => event.kind === 0) };
      }

      if (input.type === 'nip05') {
        const pointer = await nip05.queryProfile(input.value);
        if (!pointer || !/^[0-9a-f]{64}$/.test(pointer.pubkey)) return { notes: [], profiles: [] };
        const events = await nostr.query(
          [
            { kinds: [0], authors: [pointer.pubkey], limit: LIMIT },
            { kinds: [1], authors: [pointer.pubkey], limit: LIMIT },
          ],
          options,
        );
        return { notes: events.filter((event) => event.kind === 1), profiles: events.filter((event) => event.kind === 0) };
      }

      if (input.type === 'empty') return { notes: [], profiles: [] };
      const filters = input.type === 'hashtag'
        ? [{ kinds: [1], '#t': [input.value], limit: LIMIT }]
        : [{ kinds: [1], search: input.value, limit: LIMIT }, { kinds: [0], search: input.value, limit: LIMIT }];
      const events = await nostr.query(filters, options);
      const profiles = events.filter((event) => event.kind === 0);
      return {
        notes: events.filter((event) => event.kind === 1),
        profiles: input.type === 'text' ? profiles.filter((event) => profileMatches(event, input.value)) : profiles,
      };
    },
    staleTime: 30_000,
  });
}

export default function SearchApp({ setTitle }: AppProps) {
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState<SearchInput>({ type: 'empty' });
  const results = useSearch(submitted);

  useEffect(() => setTitle('Search'), [setTitle]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(parseSearchInput(term));
  };

  return (
    <AppLayout>
      <AppToolbar className="h-auto min-h-11 py-1.5">
        <form className="flex w-full gap-2" onSubmit={submit}>
          <Input
            aria-label="Search Nostr"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search notes, people, #hashtags, npub, or name@domain"
            className="h-8 min-w-0"
          />
          <Button type="submit" size="sm" className="h-8 gap-1.5" disabled={!term.trim()}>
            <Search className="size-3.5" aria-hidden />
            Search
          </Button>
        </form>
      </AppToolbar>
      <AppBody>
        {submitted.type === 'empty' ? (
          <EmptyState title="Search the Nostr network" hint="Try a phrase, #hashtag, npub, NIP-05 address, or a profile name." />
        ) : results.isLoading ? (
          <SearchSkeleton />
        ) : results.isError ? (
          <EmptyState title="Search unavailable" hint="Your relays could not complete this search. Try again in a moment." action={<Button size="sm" variant="outline" onClick={() => results.refetch()}>Try again</Button>} />
        ) : (results.data?.notes.length ?? 0) + (results.data?.profiles.length ?? 0) === 0 ? (
          <EmptyState title="No results found" hint="Try a broader phrase, another relay, or check the spelling of the identifier." />
        ) : (
          <>
            {results.data && results.data.profiles.length > 0 && (
              <section aria-labelledby="profile-results">
                <ResultHeading id="profile-results" icon={<UserRound className="size-3.5" aria-hidden />}>People</ResultHeading>
                {results.data.profiles.map((event) => <ProfileResult key={event.id} event={event} />)}
              </section>
            )}
            {results.data && results.data.notes.length > 0 && (
              <section aria-labelledby="content-results">
                <ResultHeading id="content-results" icon={submitted.type === 'hashtag' ? <Hash className="size-3.5" aria-hidden /> : <Search className="size-3.5" aria-hidden />}>
                  {submitted.type === 'hashtag' ? `Posts tagged #${submitted.value}` : 'Notes & replies'}
                </ResultHeading>
                {results.data.notes.map((event) => <NoteCard key={event.id} event={event} />)}
              </section>
            )}
          </>
        )}
      </AppBody>
    </AppLayout>
  );
}

function ResultHeading({ id, icon, children }: { id: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <h2 id={id} className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{icon}{children}</h2>;
}

function ProfileResult({ event }: { event: NostrEvent }) {
  const { openApp } = useWindowManager();
  let metadata: NostrMetadata | undefined;
  try { metadata = JSON.parse(event.content) as NostrMetadata; } catch { /* invalid metadata is rendered safely with a fallback */ }
  const name = displayName(event.pubkey, metadata);
  const picture = sanitizeUrl(metadata?.picture);
  return (
    <button type="button" onClick={() => openApp('profile', { pubkey: event.pubkey })} className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
      <Avatar className="size-10"><AvatarImage src={picture} alt="" /><AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{name}</span>{metadata?.nip05 && <span className="block truncate text-xs text-muted-foreground">{metadata.nip05}</span>}</span>
    </button>
  );
}

function SearchSkeleton() {
  return <div className="space-y-3 p-4"><Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Searching" />{Array.from({ length: 4 }).map((_, index) => <div key={index} className="space-y-2"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-4 w-full" /></div>)}</div>;
}
