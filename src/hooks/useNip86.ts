import { useCallback, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { NostrSigner } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import {
  fetchRelayInfo,
  isBlockedIpList,
  isEventRefList,
  isKindList,
  isPubkeyList,
  isStringArray,
  Nip86Error,
  nip86Call,
  nip86Params,
  normalizeRelayHttpUrl,
  partitionMethods,
  type AllowedPubkey,
  type BannedEvent,
  type BannedPubkey,
  type BlockedIp,
  type ModeratedEventRef,
  type Nip86CoreMethod,
  type RelayInfo,
} from '@/lib/nip86';

/**
 * Session state for the NIP-86 management console.
 *
 * A "session" is one connected relay: the normalized HTTP endpoint, the
 * NIP-11 identity document (when the relay publishes one), and the method
 * list the relay advertised for the *signed-in key*. Nothing here is
 * persisted — and no key material ever enters this state. Reconnecting to
 * the same relay re-runs discovery, so a rotated method list is picked up.
 */
export interface Nip86Session {
  /** Normalized `https://` management endpoint. */
  url: string;
  /** NIP-11 relay information document, when available. */
  info?: RelayInfo;
  /** Standard NIP-86 methods the relay advertised (including `stat`). */
  methods: string[];
  /** Advertised names that are not standard NIP-86 — relay-specific extensions. */
  extensions: string[];
  /** Whether `listroles` (a common non-standard companion to the role methods) is advertised. */
  canListRoles: boolean;
}

/** Which side of the blocklist/allowlist model the advertised data suggests. */
export type PolicyMode = 'blocklist' | 'allowlist' | 'unknown';

export function usePolicyMode(methods: string[]): PolicyMode {
  return useMemo(() => {
    const set = new Set(methods);
    const blocklist =
      set.has('listbannedpubkeys') || set.has('listblockedips') || set.has('listbannedevents');
    const allowlist = set.has('listallowedpubkeys') || set.has('listallowedkinds');
    if (allowlist && !blocklist) return 'allowlist';
    if (blocklist && !allowlist) return 'blocklist';
    // Both or neither: the method list alone cannot tell — the operator's
    // relay documentation has to answer this.
    return 'unknown';
  }, [methods]);
}

/** One line in the session audit log. Never contains secrets or auth headers. */
export interface AuditEntry {
  id: number;
  /** Unix milliseconds. */
  at: number;
  method: string;
  /** Operator-facing target description (pubkey, IP, role id, ...), not raw params. */
  target: string;
  status: 'ok' | 'failed' | 'cancelled';
  detail?: string;
}

/** Human-readable target for the audit log and confirm dialogs. */
export function auditTarget(method: string, params: unknown[]): string {
  const [first] = params;
  switch (method) {
    case 'banpubkey':
    case 'unbanpubkey':
    case 'allowpubkey':
    case 'unallowpubkey':
      return `pubkey ${String(first).slice(0, 16)}…`;
    case 'banevent':
    case 'allowevent':
      return `event ${String(first).slice(0, 16)}…`;
    case 'blockip':
    case 'unblockip':
      return `IP ${String(first)}`;
    case 'allowkind':
    case 'disallowkind':
      return `kind ${String(first)}`;
    case 'createrole':
    case 'editrole':
    case 'deleterole':
      return `role ${String(first)}`;
    case 'assignrole':
    case 'unassignrole':
      return `role ${String(params[1])} for pubkey ${String(first).slice(0, 16)}…`;
    case 'changerelayname':
      return 'the relay name';
    case 'changerelaydescription':
      return 'the relay description';
    case 'changerelayicon':
      return 'the relay icon';
    default:
      return 'the relay';
  }
}

export interface Nip86Connection {
  session: Nip86Session | undefined;
  connect: (input: string) => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  error: Nip86Error | undefined;
  /** True when a signer is available; discovery itself decides authorization. */
  canAuthorize: boolean;
  audit: AuditEntry[];
  record: (entry: Omit<AuditEntry, 'id' | 'at'>) => void;
  clearAudit: () => void;
}

/**
 * Connect/disconnect state plus the audit log. Kept deliberately separate from
 * the query/mutation hooks below so the console shell and every section share
 * one connection object (created once in the app root).
 */
export function useNip86Connection(): Nip86Connection {
  const { user } = useCurrentUser();
  const [session, setSession] = useState<Nip86Session | undefined>(undefined);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Nip86Error | undefined>(undefined);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const queryClient = useQueryClient();

  const record = useCallback((entry: Omit<AuditEntry, 'id' | 'at'>) => {
    setAudit((prev) => [...prev.slice(-99), { ...entry, id: (prev[prev.length - 1]?.id ?? 0) + 1, at: Date.now() }]);
  }, []);

  const clearAudit = useCallback(() => setAudit([]), []);

  const disconnect = useCallback(() => {
    setSession(undefined);
    setError(undefined);
  }, []);

  const connect = useCallback(
    async (input: string) => {
      const url = normalizeRelayHttpUrl(input);
      if (!url) {
        setError(new Nip86Error('invalid-url', 'That is not a valid relay URL.'));
        return;
      }

      const signer: NostrSigner | undefined = user?.signer;
      if (!signer) {
        setError(
          new Nip86Error(
            'not-logged-in',
            'Sign in with the key that manages this relay, then connect again.',
          ),
        );
        return;
      }

      setIsConnecting(true);
      setError(undefined);
      try {
        // Identity is nice-to-have and deliberately raced with discovery:
        // plenty of relays answer NIP-86 but publish no NIP-11 document.
        const [info, methodsResult] = await Promise.all([
          fetchRelayInfo(url),
          nip86Call<unknown>(url, { signer, method: 'supportedmethods' }),
        ]);

        if (!isStringArray(methodsResult)) {
          throw new Nip86Error(
            'malformed',
            'The relay answered supportedmethods with an unexpected shape.',
          );
        }

        const { core, extensions } = partitionMethods(methodsResult);
        setSession({
          url,
          info,
          methods: core,
          extensions,
          canListRoles: methodsResult.includes('listroles'),
        });
        // A different relay must never show the previous relay's policy lists.
        queryClient.removeQueries({ queryKey: ['nip86'] });
        record({
          method: 'supportedmethods',
          target: 'discovery',
          status: 'ok',
          detail: `${methodsResult.length} method${methodsResult.length === 1 ? '' : 's'} advertised`,
        });
      } catch (cause) {
        setSession(undefined);
        setError(
          cause instanceof Nip86Error
            ? cause
            : new Nip86Error('unreachable', 'The connection failed unexpectedly.'),
        );
        record({
          method: 'supportedmethods',
          target: 'discovery',
          status: cause instanceof DOMException && cause.name === 'AbortError' ? 'cancelled' : 'failed',
          detail: cause instanceof Nip86Error ? cause.message : 'Connection failed.',
        });
      } finally {
        setIsConnecting(false);
      }
    },
    [user, queryClient, record],
  );

  return {
    session,
    connect,
    disconnect,
    isConnecting,
    error,
    canAuthorize: Boolean(user),
    audit,
    record,
    clearAudit,
  };
}

/* --------------------------------------------------------------------------
 * List queries and mutations, keyed by relay URL so two windows managing
 * different relays never share cache entries.
 * ------------------------------------------------------------------------ */

const STALE_TIME = 15_000;

function useSessionGuard(session: Nip86Session | undefined) {
  const { user } = useCurrentUser();
  const signer = user?.signer;
  return { session, signer, ready: Boolean(session && signer) };
}

type ListMethod =
  | 'listbannedpubkeys'
  | 'listallowedpubkeys'
  | 'listeventsneedingmoderation'
  | 'listbannedevents'
  | 'listallowedkinds'
  | 'listblockedips'
  | 'listroles';

const LIST_GUARDS = {
  listbannedpubkeys: isPubkeyList,
  listallowedpubkeys: isPubkeyList,
  listeventsneedingmoderation: isEventRefList,
  listbannedevents: isEventRefList,
  listallowedkinds: isKindList,
  listblockedips: isBlockedIpList,
} as const;

interface Nip86ListOptions {
  /** Audit + cache only — mutations refresh their own list automatically. */
  onResult?: (entry: Omit<AuditEntry, 'id' | 'at'>) => void;
}

function useNip86List<T>(
  session: Nip86Session | undefined,
  method: ListMethod,
  options?: Nip86ListOptions,
): UseQueryResult<T, Nip86Error> {
  const { signer, ready } = useSessionGuard(session);
  // `listroles` is a relay-specific extension, not standard NIP-86.
  const advertised =
    method === 'listroles' ? session?.canListRoles === true : session?.methods.includes(method) === true;

  return useQuery<T, Nip86Error>({
    queryKey: ['nip86', session?.url, method],
    enabled: ready && advertised,
    staleTime: STALE_TIME,
    queryFn: async ({ signal }) => {
      if (!session || !signer) throw new Nip86Error('not-logged-in', 'Sign in to manage this relay.');

      let result: unknown;
      try {
        result = await nip86Call<unknown>(session.url, { signer, method, signal });
      } catch (error) {
        options?.onResult?.({
          method,
          target: 'list',
          status: error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed',
          detail: error instanceof Nip86Error ? error.message : 'Request failed.',
        });
        throw error instanceof Nip86Error
          ? error
          : new Nip86Error('unreachable', 'The request failed unexpectedly.');
      }

      // `listroles` shapes vary by relay; parsing happens in the UI layer.
      if (method !== 'listroles') {
        const guard = LIST_GUARDS[method];
        if (!guard(result)) {
          const failure = {
            method,
            target: 'list',
            status: 'failed' as const,
            detail: 'The relay returned an unexpected list shape.',
          };
          options?.onResult?.(failure);
          throw new Nip86Error('malformed', failure.detail);
        }
      }

      options?.onResult?.({ method, target: 'list', status: 'ok' });
      return result as T;
    },
  });
}

export function useBannedPubkeys(session: Nip86Session | undefined, opts?: Nip86ListOptions) {
  return useNip86List<BannedPubkey[]>(session, 'listbannedpubkeys', opts);
}

export function useAllowedPubkeys(session: Nip86Session | undefined, opts?: Nip86ListOptions) {
  return useNip86List<AllowedPubkey[]>(session, 'listallowedpubkeys', opts);
}

export function useEventsNeedingModeration(session: Nip86Session | undefined, opts?: Nip86ListOptions) {
  return useNip86List<ModeratedEventRef[]>(session, 'listeventsneedingmoderation', opts);
}

export function useBannedEvents(session: Nip86Session | undefined, opts?: Nip86ListOptions) {
  return useNip86List<BannedEvent[]>(session, 'listbannedevents', opts);
}

export function useAllowedKinds(session: Nip86Session | undefined, opts?: Nip86ListOptions) {
  return useNip86List<number[]>(session, 'listallowedkinds', opts);
}

export function useBlockedIps(session: Nip86Session | undefined, opts?: Nip86ListOptions) {
  return useNip86List<BlockedIp[]>(session, 'listblockedips', opts);
}

/** `listroles` is NOT part of NIP-86 — only called when explicitly advertised. */
export function useRelayRoles(session: Nip86Session | undefined, opts?: Nip86ListOptions) {
  return useNip86List<unknown>(session, 'listroles', opts);
}

export interface Nip86MutationInput {
  method: Nip86CoreMethod | (string & {});
  params: unknown[];
  /** Lists to refresh after the mutation succeeds. */
  refresh?: ListMethod[];
}

/**
 * One mutation hook for every management call. The audit entry and the list
 * refresh happen here, so a section can never forget either one.
 */
export function useNip86Mutation(
  session: Nip86Session | undefined,
  options?: Nip86ListOptions,
): UseMutationResult<unknown, Nip86Error, Nip86MutationInput> {
  const { signer } = useSessionGuard(session);
  const queryClient = useQueryClient();

  return useMutation<unknown, Nip86Error, Nip86MutationInput>({
    mutationFn: async ({ method, params }) => {
      if (!session || !signer) throw new Nip86Error('not-logged-in', 'Sign in to manage this relay.');
      const supported =
        session.methods.includes(method) || session.extensions.includes(method);
      if (!supported) {
        throw new Nip86Error('unsupported', `${method} is not advertised by this relay.`);
      }
      try {
        return await nip86Call<unknown>(session.url, { signer, method, params });
      } catch (error) {
        throw error instanceof Nip86Error
          ? error
          : new Nip86Error('unreachable', 'The request failed unexpectedly.');
      }
    },
    onSuccess: (_data, { method, params, refresh }) => {
      options?.onResult?.({ method, target: auditTarget(method, params), status: 'ok' });
      if (session && refresh) {
        for (const list of refresh) {
          queryClient.invalidateQueries({ queryKey: ['nip86', session.url, list] });
        }
      }
    },
    onError: (error, { method, params }) => {
      options?.onResult?.({
        method,
        target: auditTarget(method, params),
        status: 'failed',
        detail: error.message,
      });
    },
  });
}

/** Convenience: build params for a core method with the shared builder. */
export { nip86Params };
