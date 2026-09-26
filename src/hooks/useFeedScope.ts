import { useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type FollowSet, useMyFollowSets } from '@/hooks/useFollowSets';
import { useMyFollows } from '@/hooks/useFollows';
import { useLocalStorage } from '@/hooks/useLocalStorage';

/** `list:<d-tag>` selects one of the user's NIP-51 follow sets. */
export type FeedScope = 'following' | 'global' | `list:${string}`;

export const LIST_SCOPE_PREFIX = 'list:';

/** Relays reject oversized filters, so author lists are capped. */
const MAX_AUTHORS = 500;

/** A compact, order-independent fingerprint of an author list for query keys. */
function authorsFingerprint(authors: string[]): string {
  let hash = 5381;
  for (const pubkey of [...authors].sort()) {
    for (let index = 0; index < pubkey.length; index++) {
      hash = ((hash << 5) + hash + pubkey.charCodeAt(index)) | 0;
    }
  }
  return `${authors.length}:${(hash >>> 0).toString(36)}`;
}

function isFeedScope(value: unknown): value is FeedScope {
  return value === 'following' || value === 'global' || (typeof value === 'string' && value.startsWith(LIST_SCOPE_PREFIX));
}

export interface FeedScopeState {
  /** The effective scope: falls back to Global when signed out and to Following when the chosen list is gone. */
  scope: FeedScope;
  setScope: (scope: FeedScope) => void;
  isList: boolean;
  /** The follow set behind a list scope, once lists have loaded. */
  selectedList: FollowSet | undefined;
  followSets: FollowSet[] | undefined;
  /** Human-readable name of the effective scope, for window titles. */
  label: string;
  /**
   * Pubkeys to pass as the relay `authors` filter. `null` means Global (no
   * author filter); `undefined` means the author list is still loading.
   */
  authors: string[] | null | undefined;
  /**
   * A stable query-key fragment identifying the scope and its authors, so
   * caches never mix between scopes or between edits of the same list.
   */
  queryKey: readonly unknown[];
}

/**
 * The Following / Global / list scope shared by feed-style apps. The chosen
 * scope is remembered per app under `storageKey`.
 */
export function useFeedScope(storageKey: string): FeedScopeState {
  const { user } = useCurrentUser();
  const follows = useMyFollows();
  const followSets = useMyFollowSets();
  const [storedScope, setScope] = useLocalStorage<FeedScope>(storageKey, 'following');
  const requestedScope: FeedScope = isFeedScope(storedScope) ? storedScope : 'following';

  // Signing out mid-session (or deleting the selected list elsewhere) must not
  // strand the user on an empty feed, so the effective scope is derived rather
  // than corrected after render. While lists are still loading, a list scope is
  // kept so the feed simply shows its skeleton.
  const requestedList = requestedScope.startsWith(LIST_SCOPE_PREFIX);
  const selectedList = requestedList
    ? followSets.data?.find((set) => set.identifier === requestedScope.slice(LIST_SCOPE_PREFIX.length))
    : undefined;
  const scope: FeedScope = !user
    ? 'global'
    : requestedList && followSets.data && !selectedList
      ? 'following'
      : requestedScope;
  const isList = scope.startsWith(LIST_SCOPE_PREFIX);

  const authors = useMemo(() => {
    if (scope === 'global') return null;
    if (isList) return selectedList?.pubkeys.slice(0, MAX_AUTHORS);
    // A failed contact list lookup counts as "follows nobody" rather than
    // leaving the feed loading forever.
    if (follows.data) return follows.data.slice(0, MAX_AUTHORS);
    return follows.isError ? [] : undefined;
  }, [scope, isList, selectedList, follows.data, follows.isError]);

  const queryKey = useMemo(
    () => [scope, authors ? authorsFingerprint(authors) : authors ?? null] as const,
    [scope, authors],
  );

  const label = scope === 'following' ? 'Following' : scope === 'global' ? 'Global' : selectedList?.title ?? 'List';

  return { scope, setScope, isList, selectedList, followSets: followSets.data, label, authors, queryKey };
}
