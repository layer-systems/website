import { useCallback, useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import type { NPool, NRelay1 } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { relayListSyncKey, useRelayListSync } from '@/hooks/useRelayListSync';
import { useToast } from '@/hooks/useToast';
import type { RelayMetadata } from '@/contexts/AppContext';
import { APP_RELAYS, INDEXER_RELAYS } from '@/lib/appRelays';
import {
  modeBlocker,
  normalizeRelayUrl,
  relayListTags,
  removeBlocker,
  type RelayEntry,
  type RelayMode,
} from '@/lib/relayList';
import { planRelayListEdit, type RemoteRelayListState } from '@/lib/relayListSync';

/** NIP-65 relay list metadata. */
export const RELAY_LIST_KIND = 10002;

export type RelayListResult = { ok: true } | { ok: false; error: string };

/**
 * The one place the user's relay list is edited. Every change is written to
 * the local config straight away and, when signed in, published as a NIP-65
 * kind 10002 event, so the Relays app and anything else that edits the list
 * behave the same way.
 *
 * Publishing replaces the user's list everywhere, so it only happens once the
 * published list is known (see `planRelayListEdit`): edits wait for the
 * lookup, apply to the published list when it is newer than the local one,
 * and stay on this device when the local list never came from the published
 * one (e.g. the app defaults) until the user publishes it explicitly.
 */
export function useRelayList() {
  const { nostr } = useNostr();
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sync = useRelayListSync();
  const pubkey = user?.pubkey;

  const remote: RemoteRelayListState = !pubkey
    ? { status: 'signed-out' }
    : sync.data
      ? { status: 'success', event: sync.data.event }
      : sync.isError
        ? { status: 'error' }
        : { status: 'pending' };

  // Undo actions fire after later edits may have landed, so commits read the
  // freshest list and lookup state from here rather than from a render-time closure.
  const latest = useRef<RelayMetadata>(config.relayMetadata);
  useEffect(() => {
    latest.current = config.relayMetadata;
  }, [config.relayMetadata]);
  const latestRemote = useRef<RemoteRelayListState>(remote);
  useEffect(() => {
    latestRemote.current = remote;
  });

  // The `updatedAt` of a local list this device derived from the published
  // list or published on the user's explicit request, so edits to it may be
  // published without waiting for the lookup to see the previous publish.
  const trusted = useRef<{ pubkey: string; updatedAt: number } | null>(null);
  const trustedUpdatedAt = useCallback(
    () => (pubkey && trusted.current?.pubkey === pubkey ? trusted.current.updatedAt : null),
    [pubkey],
  );

  const publish = useCallback(
    async (previous: RelayEntry[], next: RelayMetadata) => {
      if (!user) return;
      try {
        const tags = relayListTags(next.relays);
        const event = await user.signer.signEvent({
          kind: RELAY_LIST_KIND,
          content: '',
          tags,
          created_at: next.updatedAt,
        });
        // Announce the new list on the old write relays too, so readers that
        // still follow the previous list learn about the move, and on the
        // indexer relays other clients (and new devices) bootstrap from.
        const targets = [
          ...new Set([
            ...[...previous, ...next.relays].filter((r) => r.write).map((r) => r.url),
            ...INDEXER_RELAYS,
          ]),
        ];
        const pool = nostr as NPool<NRelay1>;
        // Wait for every relay, not just the first to accept, so the sync
        // status refreshed below reflects where the list actually landed.
        const signal = AbortSignal.timeout(5000);
        const results = await Promise.allSettled(targets.map((url) => pool.relay(url).event(event, { signal })));
        void queryClient.invalidateQueries({ queryKey: relayListSyncKey(user.pubkey) });
        if (!results.some((result) => result.status === 'fulfilled')) {
          throw new Error('No relay accepted the updated relay list.');
        }
      } catch (error) {
        toast({
          title: 'Saved here, but not published',
          description: error instanceof Error ? error.message : 'No relay accepted the updated relay list.',
          variant: 'destructive',
        });
      }
    },
    [nostr, queryClient, toast, user],
  );

  /**
   * Applies `edit` to the list the plan says to edit, saves it locally and
   * publishes it when allowed. `explicit` marks a user-confirmed replacement
   * of the published list (Publish, Reset to defaults).
   */
  const commit = useCallback(
    (edit: (relays: RelayEntry[]) => RelayListResult & { relays?: RelayEntry[] }, explicit = false): RelayListResult => {
      const plan = planRelayListEdit(latest.current, latestRemote.current, trustedUpdatedAt());
      if (!plan.ok) return plan;
      const edited = edit(plan.base.relays);
      if (!edited.ok) return edited;
      const relays = edited.relays ?? plan.base.relays;

      const previous = latest.current;
      // Replaceable events are ordered by created_at, so two edits in the same
      // second must still produce strictly increasing timestamps.
      const updatedAt = Math.max(
        Math.floor(Date.now() / 1000),
        previous.updatedAt + 1,
        plan.base.updatedAt + 1,
      );
      const next: RelayMetadata = { relays, updatedAt };
      latest.current = next;
      updateConfig((current) => ({ ...current, relayMetadata: next }));

      const shouldPublish = Boolean(pubkey) && (plan.publish || explicit);
      if (shouldPublish && pubkey) {
        trusted.current = { pubkey, updatedAt };
        void publish(previous.relays, next);
      } else if (plan.reason) {
        toast({ title: 'Not published', description: plan.reason });
      }
      return { ok: true };
    },
    [publish, pubkey, toast, trustedUpdatedAt, updateConfig],
  );

  const add = useCallback(
    (input: string): RelayListResult => {
      const parsed = normalizeRelayUrl(input);
      if (!parsed.ok) return parsed;
      return commit((relays) => {
        if (relays.some((r) => r.url === parsed.url)) {
          return { ok: false, error: 'That relay is already in your list.' };
        }
        return { ok: true, relays: [...relays, { url: parsed.url, read: true, write: true }] };
      });
    },
    [commit],
  );

  const remove = useCallback(
    (url: string): RelayListResult =>
      commit((relays) => {
        const blocker = removeBlocker(relays, url);
        if (blocker) return { ok: false, error: blocker };
        return { ok: true, relays: relays.filter((r) => r.url !== url) };
      }),
    [commit],
  );

  /** Puts a removed relay back where it was, unless it has been re-added since. */
  const restore = useCallback(
    (relay: RelayEntry, index: number): RelayListResult =>
      commit((relays) => {
        if (relays.some((r) => r.url === relay.url)) return { ok: false, error: 'That relay is already in your list.' };
        const next = [...relays];
        next.splice(Math.min(index, next.length), 0, relay);
        return { ok: true, relays: next };
      }),
    [commit],
  );

  const setMode = useCallback(
    (url: string, mode: RelayMode): RelayListResult =>
      commit((relays) => {
        const blocker = modeBlocker(relays, url, mode);
        if (blocker) return { ok: false, error: blocker };
        return { ok: true, relays: relays.map((r) => (r.url === url ? { ...r, ...mode } : r)) };
      }),
    [commit],
  );

  /**
   * Replaces the list with the app defaults. The caller must have asked the
   * user to confirm: when signed in, this replaces the published list even if
   * it could not be looked up.
   */
  const resetToDefaults = useCallback((): RelayListResult => {
    const previous = latest.current;
    const current = latestRemote.current;
    // Newer than anything published, so readers take the reset list.
    const updatedAt = Math.max(
      Math.floor(Date.now() / 1000),
      previous.updatedAt + 1,
      current.status === 'success' && current.event ? current.event.created_at + 1 : 0,
    );
    const next: RelayMetadata = { relays: APP_RELAYS.relays.map((relay) => ({ ...relay })), updatedAt };
    latest.current = next;
    updateConfig((current) => ({ ...current, relayMetadata: next }));
    if (pubkey) {
      trusted.current = { pubkey, updatedAt };
      void publish(previous.relays, next);
    }
    return { ok: true };
  }, [publish, pubkey, updateConfig]);

  /**
   * Publishes the current list unchanged, on the user's explicit request,
   * e.g. when none is published yet. Waits for the published list to be known.
   */
  const publishCurrent = useCallback(
    (): RelayListResult => commit(() => ({ ok: true }), true),
    [commit],
  );

  const plan = planRelayListEdit(config.relayMetadata, remote, null);

  return {
    relays: config.relayMetadata.relays,
    /** Why edits are refused right now, or `null` when they are accepted. */
    blocked: plan.ok ? null : plan.error,
    publishCurrent,
    add,
    remove,
    restore,
    setMode,
    resetToDefaults,
  };
}
