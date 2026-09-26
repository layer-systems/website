import { useCallback, useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import type { NPool, NRelay1 } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import type { RelayMetadata } from '@/contexts/AppContext';
import { APP_RELAYS } from '@/lib/appRelays';
import {
  modeBlocker,
  normalizeRelayUrl,
  relayListTags,
  removeBlocker,
  type RelayEntry,
  type RelayMode,
} from '@/lib/relayList';

/** NIP-65 relay list metadata. */
export const RELAY_LIST_KIND = 10002;

export type RelayListResult = { ok: true } | { ok: false; error: string };

/**
 * The one place the user's relay list is edited. Every change is written to
 * the local config straight away and, when signed in, published as a NIP-65
 * kind 10002 event, so the Relays app and anything else that edits the list
 * behave the same way.
 */
export function useRelayList() {
  const { nostr } = useNostr();
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  // Undo actions fire after later edits may have landed, so commits read the
  // freshest list from here rather than from a render-time closure.
  const latest = useRef<RelayMetadata>(config.relayMetadata);
  useEffect(() => {
    latest.current = config.relayMetadata;
  }, [config.relayMetadata]);

  const publish = useCallback(
    async (previous: RelayEntry[], next: RelayMetadata) => {
      if (!user) return;
      try {
        const tags = relayListTags(next.relays);
        if (location.protocol === 'https:') tags.push(['client', location.hostname]);
        const event = await user.signer.signEvent({
          kind: RELAY_LIST_KIND,
          content: '',
          tags,
          created_at: next.updatedAt,
        });
        // Announce the new list on the old write relays too, so readers that
        // still follow the previous list learn about the move.
        const targets = [...new Set([...previous, ...next.relays].filter((r) => r.write).map((r) => r.url))];
        const pool = nostr as NPool<NRelay1>;
        await pool.group(targets).event(event, { signal: AbortSignal.timeout(5000) });
      } catch (error) {
        toast({
          title: 'Saved here, but not published',
          description: error instanceof Error ? error.message : 'No relay accepted the updated relay list.',
          variant: 'destructive',
        });
      }
    },
    [nostr, toast, user],
  );

  const commit = useCallback(
    (relays: RelayEntry[]) => {
      const previous = latest.current;
      // Replaceable events are ordered by created_at, so two edits in the same
      // second must still produce strictly increasing timestamps.
      const updatedAt = Math.max(Math.floor(Date.now() / 1000), previous.updatedAt + 1);
      const next: RelayMetadata = { relays, updatedAt };
      latest.current = next;
      updateConfig((current) => ({ ...current, relayMetadata: next }));
      void publish(previous.relays, next);
    },
    [publish, updateConfig],
  );

  const add = useCallback(
    (input: string): RelayListResult => {
      const parsed = normalizeRelayUrl(input);
      if (!parsed.ok) return parsed;
      const relays = latest.current.relays;
      if (relays.some((r) => r.url === parsed.url)) {
        return { ok: false, error: 'That relay is already in your list.' };
      }
      commit([...relays, { url: parsed.url, read: true, write: true }]);
      return { ok: true };
    },
    [commit],
  );

  const remove = useCallback(
    (url: string): RelayListResult => {
      const relays = latest.current.relays;
      const blocker = removeBlocker(relays, url);
      if (blocker) return { ok: false, error: blocker };
      commit(relays.filter((r) => r.url !== url));
      return { ok: true };
    },
    [commit],
  );

  /** Puts a removed relay back where it was, unless it has been re-added since. */
  const restore = useCallback(
    (relay: RelayEntry, index: number) => {
      const relays = latest.current.relays;
      if (relays.some((r) => r.url === relay.url)) return;
      const next = [...relays];
      next.splice(Math.min(index, next.length), 0, relay);
      commit(next);
    },
    [commit],
  );

  const setMode = useCallback(
    (url: string, mode: RelayMode): RelayListResult => {
      const relays = latest.current.relays;
      const blocker = modeBlocker(relays, url, mode);
      if (blocker) return { ok: false, error: blocker };
      commit(relays.map((r) => (r.url === url ? { ...r, ...mode } : r)));
      return { ok: true };
    },
    [commit],
  );

  const resetToDefaults = useCallback(() => {
    commit(APP_RELAYS.relays.map((relay) => ({ ...relay })));
  }, [commit]);

  return {
    relays: config.relayMetadata.relays,
    add,
    remove,
    restore,
    setMode,
    resetToDefaults,
  };
}
