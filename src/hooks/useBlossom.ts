import { useCallback, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { getEffectiveBlossomServers } from '@/lib/appBlossom';
import {
  BlossomHttpError,
  createAuthHeader,
  deleteBlob,
  extractBlobHints,
  forgetUpload,
  headBlob,
  listBlobs,
  loadUploadHistory,
  mergeLibrary,
  mirrorBlob,
  normalizeServerUrl,
  rememberUpload,
  sha256Hex,
  uploadBlob,
  type BlobDescriptor,
  type BlobHint,
  type LibraryBlob,
} from '@/lib/blossom';
import { sanitizeUrl } from '@/lib/nostrUtils';

export type ServerStatus = 'checking' | 'online' | 'probed' | 'offline';

export interface ServerState {
  url: string;
  /**
   * `online`: listed the user's blobs. `probed`: reachable but won't list, so
   * known blobs were checked one by one. `offline`: no response at all.
   */
  status: ServerStatus;
  /** Why listing failed, when it did. */
  error?: string;
  blobCount?: number;
}

/** Most blobs we'll check one by one on a server that won't list. */
const PROBE_LIMIT = 300;
const PROBE_CONCURRENCY = 6;

function listKey(pubkey: string | undefined, server: string) {
  return ['blossom', 'list', pubkey ?? '', server] as const;
}

function probeKey(pubkey: string | undefined, server: string) {
  return ['blossom', 'probe', pubkey ?? '', server] as const;
}

function knownKey(pubkey: string | undefined) {
  return ['blossom', 'known', pubkey ?? ''] as const;
}

/** Cheap, stable fingerprint of a hash list, so probe queries re-run when it changes. */
function fingerprint(values: string[]): string {
  let hash = 5381;
  for (const value of values) {
    for (let index = 0; index < value.length; index++) hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return `${values.length}:${(hash >>> 0).toString(36)}`;
}

async function probeServer(server: string, hints: BlobHint[], signal: AbortSignal): Promise<BlobDescriptor[]> {
  const found: BlobDescriptor[] = [];
  let next = 0;
  const worker = async () => {
    while (next < hints.length) {
      const hint = hints[next++];
      try {
        const descriptor = await headBlob(server, hint, signal);
        if (descriptor) found.push(descriptor);
      } catch (error) {
        if (signal.aborted) throw error;
        // One failed check says nothing about the rest; carry on.
      }
    }
  };
  await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
  return found;
}

/** The effective, normalized, de-duplicated Blossom servers, in preference order. */
export function useBlossomServers(): string[] {
  const { config } = useAppContext();
  return useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const url of getEffectiveBlossomServers(config.blossomServerMetadata, config.useAppBlossomServers)) {
      const normalized = normalizeServerUrl(url);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
    return result;
  }, [config.blossomServerMetadata, config.useAppBlossomServers]);
}

/**
 * Blobs the user is known to have stored: everything this browser uploaded,
 * plus every blob referenced by their own recent events.
 */
function useKnownBlobs(pubkey: string | undefined) {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: knownKey(pubkey),
    enabled: Boolean(pubkey),
    queryFn: async ({ signal }) => {
      let events: NostrEvent[] = [];
      try {
        events = await nostr.query(
          [{ kinds: [1, 20, 21, 22, 1063, 30023], authors: [pubkey!], limit: 500 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
        );
      } catch {
        // Relays unavailable: the local history is still worth checking.
      }
      const hints = new Map<string, BlobHint>();
      for (const hint of [...loadUploadHistory(pubkey!), ...extractBlobHints(events)]) {
        if (!hints.has(hint.sha256)) hints.set(hint.sha256, hint);
      }
      return [...hints.values()].sort((a, b) => (b.seen ?? 0) - (a.seen ?? 0)).slice(0, PROBE_LIMIT);
    },
    staleTime: 60_000,
  });
}

/**
 * The signed-in user's blobs on every effective server, merged by hash.
 * Servers that list (`GET /list`) are listed; servers that refuse are asked
 * about each known blob with `HEAD /<sha256>` instead. Any HTTP response
 * counts as reachable; only a network failure counts as offline.
 */
export function useBlossomLibrary() {
  const { user } = useCurrentUser();
  const servers = useBlossomServers();
  const pubkey = user?.pubkey;

  // One list authorization, shared by every server and reused until shortly
  // before it expires, so a refresh never prompts the signer once per server.
  const listAuth = useRef<{ pubkey: string; header: Promise<string>; expires: number } | null>(null);
  const authorize = useCallback(() => {
    if (!user) return Promise.reject(new Error('Sign in to list your media'));
    const now = Date.now();
    const cached = listAuth.current;
    if (cached && cached.pubkey === user.pubkey && cached.expires > now + 10_000) return cached.header;
    const header = createAuthHeader(user.signer, { verb: 'list', content: 'List my media', expiresIn: 120 });
    listAuth.current = { pubkey: user.pubkey, header, expires: now + 120_000 };
    header.catch(() => {
      listAuth.current = null;
    });
    return header;
  }, [user]);

  const lists = useQueries({
    queries: servers.map((server) => ({
      queryKey: listKey(pubkey, server),
      enabled: Boolean(pubkey),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        listBlobs(server, pubkey!, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), authorize }),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const known = useKnownBlobs(pubkey);
  const hints = known.data ?? [];
  const hintsKey = fingerprint(hints.map((hint) => hint.sha256));
  const unlisted = servers.filter((_, index) => lists[index].error instanceof BlossomHttpError);

  const probes = useQueries({
    queries: unlisted.map((server) => ({
      queryKey: [...probeKey(pubkey, server), hintsKey],
      enabled: Boolean(pubkey) && known.isSuccess,
      queryFn: ({ signal }: { signal: AbortSignal }) => probeServer(server, hints, signal),
      placeholderData: keepPreviousData,
      staleTime: 60_000,
      retry: false,
    })),
  });

  const perServer = servers.map((url, index) => {
    const list = lists[index];
    const probeIndex = unlisted.indexOf(url);
    const probe = probeIndex >= 0 ? probes[probeIndex] : undefined;

    let state: ServerState;
    let blobs: BlobDescriptor[] = [];
    if (list.isSuccess) {
      blobs = list.data;
      state = { url, status: 'online', blobCount: blobs.length };
    } else if (list.error instanceof BlossomHttpError) {
      blobs = probe?.data ?? [];
      state = { url, status: probe?.data ? 'probed' : 'checking', error: list.error.message, blobCount: probe?.data?.length };
    } else if (list.isError) {
      state = { url, status: 'offline', error: list.error instanceof Error ? list.error.message : undefined };
    } else {
      state = { url, status: 'checking' };
    }
    return { state, blobs, pending: list.isPending || Boolean(probe?.isPending) || (Boolean(probe) && known.isPending) };
  });

  const blobs = mergeLibrary(perServer.map((entry, index) => ({ server: servers[index], blobs: entry.blobs })));

  return {
    servers,
    states: perServer.map((entry) => entry.state),
    blobs,
    isLoading: Boolean(pubkey) && servers.length > 0 && blobs.length === 0 && perServer.some((entry) => entry.pending),
    isFetching: lists.some((query) => query.isFetching) || probes.some((query) => query.isFetching) || known.isFetching,
    refetch: async () => {
      await Promise.all([known.refetch(), ...lists.map((query) => query.refetch())]);
    },
  };
}

/** Keep cached lists and probes in step with a mutation that just succeeded. */
function useListCache() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  return useMemo(() => {
    const update = (server: string, fn: (current: BlobDescriptor[]) => BlobDescriptor[]) => {
      for (const queryKey of [listKey(user?.pubkey, server), probeKey(user?.pubkey, server)]) {
        queryClient.setQueriesData<BlobDescriptor[]>({ queryKey }, (current) => (current ? fn(current) : current));
      }
    };
    return {
      add(server: string, descriptor: BlobDescriptor) {
        if (user) rememberUpload(user.pubkey, descriptor);
        update(server, (current) => [descriptor, ...current.filter((blob) => blob.sha256 !== descriptor.sha256)]);
      },
      remove(server: string, sha256: string) {
        update(server, (current) => current.filter((blob) => blob.sha256 !== sha256));
      },
      /** The blob is gone from every server; stop checking for it. */
      forget(sha256: string) {
        if (!user) return;
        forgetUpload(user.pubkey, sha256);
        queryClient.setQueryData<BlobHint[]>(knownKey(user.pubkey), (current) => current?.filter((hint) => hint.sha256 !== sha256));
      },
    };
  }, [queryClient, user]);
}

export interface ServerResult {
  server: string;
  ok: boolean;
  error?: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof TypeError) return 'Server unreachable';
  return error instanceof Error ? error.message : 'Unknown error';
}

export interface UploadProgress {
  phase: 'hashing' | 'signing' | 'uploading' | 'mirroring';
  fraction: number;
}

/**
 * Upload one file: send it to the first target that accepts it (with
 * progress), then mirror it to the remaining targets, falling back to a direct
 * upload where a server doesn't support mirroring.
 */
export function useBlossomUpload() {
  const { user } = useCurrentUser();
  const cache = useListCache();

  return useMutation({
    mutationFn: async ({
      file,
      servers,
      onProgress,
    }: {
      file: File;
      servers: string[];
      onProgress?: (progress: UploadProgress) => void;
    }): Promise<{ descriptor: BlobDescriptor; results: ServerResult[] }> => {
      if (!user) throw new Error('Sign in to upload');
      if (servers.length === 0) throw new Error('Choose at least one server');

      onProgress?.({ phase: 'hashing', fraction: 0 });
      const sha256 = await sha256Hex(file);

      onProgress?.({ phase: 'signing', fraction: 0 });
      // Long enough to cover a big upload followed by mirroring.
      const authorization = await createAuthHeader(user.signer, {
        verb: 'upload',
        content: `Upload ${file.name}`,
        x: sha256,
        expiresIn: 600,
      });

      const results: ServerResult[] = [];
      let descriptor: BlobDescriptor | undefined;
      let remaining = [...servers];

      while (!descriptor && remaining.length > 0) {
        const [server, ...rest] = remaining;
        remaining = rest;
        try {
          descriptor = await uploadBlob(server, file, {
            sha256,
            authorization,
            onProgress: (fraction) => onProgress?.({ phase: 'uploading', fraction }),
          });
          cache.add(server, descriptor);
          results.push({ server, ok: true });
        } catch (error) {
          results.push({ server, ok: false, error: errorMessage(error) });
        }
      }

      if (!descriptor) {
        throw new Error(results.map((result) => `${new URL(result.server).host}: ${result.error}`).join('; '));
      }

      const source = sanitizeUrl(descriptor.url) ?? descriptor.url;
      for (const [index, server] of remaining.entries()) {
        onProgress?.({ phase: 'mirroring', fraction: index / remaining.length });
        try {
          let mirrored: BlobDescriptor;
          try {
            mirrored = await mirrorBlob(server, source, { sha256, authorization });
          } catch {
            mirrored = await uploadBlob(server, file, { sha256, authorization });
          }
          cache.add(server, mirrored);
          results.push({ server, ok: true });
        } catch (error) {
          results.push({ server, ok: false, error: errorMessage(error) });
        }
      }

      return { descriptor, results };
    },
  });
}

/** BUD-04: copy a blob the user already stores onto more of their servers. */
export function useBlossomMirror() {
  const { user } = useCurrentUser();
  const cache = useListCache();

  return useMutation({
    mutationFn: async ({ blob, servers }: { blob: LibraryBlob; servers: string[] }): Promise<ServerResult[]> => {
      if (!user) throw new Error('Sign in to mirror media');
      const source = sanitizeUrl(blob.url);
      if (!source) throw new Error('This blob has no usable URL');

      const authorization = await createAuthHeader(user.signer, {
        verb: 'upload',
        content: 'Mirror blob',
        x: blob.sha256,
        expiresIn: 300,
      });

      return Promise.all(
        servers.map(async (server): Promise<ServerResult> => {
          try {
            const descriptor = await mirrorBlob(server, source, { sha256: blob.sha256, authorization });
            cache.add(server, { ...descriptor, uploaded: descriptor.uploaded ?? blob.uploaded });
            return { server, ok: true };
          } catch (error) {
            return { server, ok: false, error: errorMessage(error) };
          }
        }),
      );
    },
  });
}

/** Delete a blob from some or all of the servers that store it. */
export function useBlossomDelete() {
  const { user } = useCurrentUser();
  const cache = useListCache();

  return useMutation({
    /** `everywhere`: these are all the servers holding it, so forget it once they all succeed. */
    mutationFn: async ({
      sha256,
      servers,
      everywhere = false,
    }: {
      sha256: string;
      servers: string[];
      everywhere?: boolean;
    }): Promise<ServerResult[]> => {
      if (!user) throw new Error('Sign in to delete media');

      const authorization = await createAuthHeader(user.signer, {
        verb: 'delete',
        content: 'Delete blob',
        x: sha256,
        expiresIn: 60,
      });

      const results = await Promise.all(
        servers.map(async (server): Promise<ServerResult> => {
          try {
            await deleteBlob(server, sha256, { authorization });
            cache.remove(server, sha256);
            return { server, ok: true };
          } catch (error) {
            return { server, ok: false, error: errorMessage(error) };
          }
        }),
      );
      if (everywhere && results.every((result) => result.ok)) cache.forget(sha256);
      return results;
    },
  });
}

/** Publish the user's kind 10063 server list (BUD-03) and store it locally. */
export function usePublishBlossomServers() {
  const { updateConfig } = useAppContext();
  const publish = useNostrPublish();

  return useMutation({
    mutationFn: async (servers: string[]) => {
      const event = await publish.mutateAsync({
        kind: 10063,
        content: '',
        tags: servers.map((server) => ['server', server]),
      });
      updateConfig((current) => ({
        ...current,
        blossomServerMetadata: { servers, updatedAt: event.created_at },
      }));
      return event;
    },
  });
}

export type BlossomLibrary = ReturnType<typeof useBlossomLibrary>;
