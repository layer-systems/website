import type { NostrSigner } from '@nostrify/nostrify';

/**
 * A small Blossom client covering the BUDs the Media app needs: listing
 * (BUD-02 `GET /list`), uploading (`PUT /upload`), deleting (`DELETE /<sha256>`)
 * and mirroring (BUD-04 `PUT /mirror`). Every request that needs
 * authorization carries a kind 24242 event that is short-lived and scoped to
 * one verb, and to one blob hash wherever the verb acts on a blob.
 */

export const BLOSSOM_AUTH_KIND = 24242;

const SHA256_RE = /^[0-9a-f]{64}$/;

/** Blob descriptor as returned by Blossom servers (BUD-02). */
export interface BlobDescriptor {
  url: string;
  sha256: string;
  size: number;
  type?: string;
  /** Unix seconds. */
  uploaded?: number;
  /** NIP-94 tags some servers attach (BUD-08). */
  nip94?: string[][];
}

/** A blob as the user sees it: one hash, stored on one or more servers. */
export interface LibraryBlob {
  sha256: string;
  size: number;
  type?: string;
  uploaded?: number;
  /** URL on the first server (in server-list order) that holds it. */
  url: string;
  nip94?: string[][];
  /** Normalized server URL -> blob URL on that server. */
  locations: Map<string, string>;
}

export type BlossomVerb = 'upload' | 'list' | 'delete';

/** The server answered, but not with success. */
export class BlossomHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'BlossomHttpError';
    this.status = status;
  }
}

/** Normalize a server URL to `https://host[:port]/` so it can be used as a key. */
export function normalizeServerUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    return `${parsed.origin}/`.toLowerCase();
  } catch {
    return undefined;
  }
}

/** `blossom.example.com` from `https://blossom.example.com/`. */
export function serverLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function isSha256(value: string): boolean {
  return SHA256_RE.test(value);
}

export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Sign a kind 24242 authorization event and return it as an `Authorization`
 * header value. `x` scopes it to one blob; `expiresIn` keeps it short-lived.
 */
export async function createAuthHeader(
  signer: NostrSigner,
  opts: { verb: BlossomVerb; content: string; x?: string; expiresIn?: number },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tags = [
    ['t', opts.verb],
    ['expiration', String(now + (opts.expiresIn ?? 60))],
  ];
  if (opts.x) tags.push(['x', opts.x]);

  const event = await signer.signEvent({
    kind: BLOSSOM_AUTH_KIND,
    content: opts.content,
    tags,
    created_at: now,
  });

  return `Nostr ${base64Utf8(JSON.stringify(event))}`;
}

function parseNip94(value: unknown): string[][] | undefined {
  if (Array.isArray(value)) {
    const tags = value.filter(
      (tag): tag is string[] => Array.isArray(tag) && tag.length >= 2 && tag.every((item) => typeof item === 'string'),
    );
    return tags.length ? tags : undefined;
  }
  if (value && typeof value === 'object') {
    const tags = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    return tags.length ? tags : undefined;
  }
  return undefined;
}

/** Validate an untrusted descriptor from a server. Returns undefined if unusable. */
export function parseDescriptor(value: unknown): BlobDescriptor | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const { url, sha256, size, type, uploaded } = record;

  if (typeof url !== 'string' || typeof sha256 !== 'string' || !isSha256(sha256)) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
  } catch {
    return undefined;
  }

  return {
    url,
    sha256,
    size: typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : 0,
    type: typeof type === 'string' && type ? type : undefined,
    uploaded: typeof uploaded === 'number' && Number.isFinite(uploaded) ? uploaded : undefined,
    nip94: parseNip94(record.nip94),
  };
}

async function errorFromResponse(response: Response): Promise<BlossomHttpError> {
  // BUD-01: servers explain failures in the X-Reason header.
  const reason = response.headers.get('x-reason');
  let text = '';
  if (!reason) {
    try {
      text = (await response.text()).slice(0, 200);
    } catch {
      // Ignore unreadable bodies.
    }
  }
  return new BlossomHttpError(response.status, reason || text || `Server responded with ${response.status}`);
}

async function descriptorFromResponse(response: Response, expectedHash: string): Promise<BlobDescriptor> {
  if (!response.ok) throw await errorFromResponse(response);
  const descriptor = parseDescriptor(await response.json());
  if (!descriptor) throw new Error('The server returned an invalid blob descriptor');
  if (descriptor.sha256 !== expectedHash) throw new Error('The server stored a blob with a different hash');
  return descriptor;
}

/**
 * `GET /list/<pubkey>`. Tries without authorization first, since most servers
 * list publicly, and only asks for a signature when the server demands one.
 */
export async function listBlobs(
  server: string,
  pubkey: string,
  opts: { signal?: AbortSignal; authorize?: () => Promise<string> } = {},
): Promise<BlobDescriptor[]> {
  const url = new URL(`/list/${pubkey}`, server);
  const withAuth = async () =>
    fetch(url, { signal: opts.signal, headers: { authorization: await opts.authorize!() } });

  let response: Response;
  try {
    response = await fetch(url, { signal: opts.signal });
  } catch (error) {
    // Some servers send their "authorization required" reply without CORS
    // headers, which the browser reports as a network error. Retry signed.
    if (!opts.authorize || opts.signal?.aborted) throw error;
    response = await withAuth();
  }

  // Servers disagree on how to say "authorization required": 401, 403 and 400 are all seen in the wild.
  if ((response.status === 400 || response.status === 401 || response.status === 403) && opts.authorize) {
    response = await withAuth();
  }

  if (!response.ok) throw await errorFromResponse(response);

  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error('The server returned an invalid blob list');
  return body.map(parseDescriptor).filter((descriptor): descriptor is BlobDescriptor => Boolean(descriptor));
}

/** A blob we have reason to believe the user stored, before any server confirms it. */
export interface BlobHint {
  sha256: string;
  url?: string;
  type?: string;
  size?: number;
  /** Unix seconds: when it was uploaded, or first referenced. */
  seen?: number;
}

function extensionOf(url: string | undefined): string {
  if (!url) return '';
  try {
    const match = /\.[a-z0-9]{1,8}$/i.exec(new URL(url).pathname);
    return match ? match[0].toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * `HEAD /<sha256>` (BUD-01): does `server` hold this blob? Used for servers
 * that don't offer `/list`. Resolves undefined when the server doesn't have it.
 */
export async function headBlob(server: string, hint: BlobHint, signal?: AbortSignal): Promise<BlobDescriptor | undefined> {
  const url = new URL(`/${hint.sha256}${extensionOf(hint.url)}`, server).href;
  const response = await fetch(url, { method: 'HEAD', signal });
  if (response.status === 404) return undefined;
  if (!response.ok) throw await errorFromResponse(response);

  const length = Number(response.headers.get('content-length'));
  const type = response.headers.get('content-type')?.split(';')[0].trim();
  return {
    url,
    sha256: hint.sha256,
    size: Number.isFinite(length) && length > 0 ? length : hint.size ?? 0,
    type: type && type !== 'application/octet-stream' ? type : hint.type,
    uploaded: hint.seen,
  };
}

const BLOB_URL_RE = /https?:\/\/[^\s"'<>]+?\/([0-9a-f]{64})(\.[a-z0-9]{1,8})?(?=[\s"'<>?#]|$)/gi;

/**
 * Find blobs referenced by the user's own events: NIP-92 `imeta` tags, NIP-94
 * file metadata tags, and Blossom-style URLs (`/<sha256>.ext`) in content.
 */
export function extractBlobHints(events: { content: string; tags: string[][]; created_at: number }[]): BlobHint[] {
  const hints = new Map<string, BlobHint>();

  const add = (hint: BlobHint) => {
    if (!isSha256(hint.sha256)) return;
    const existing = hints.get(hint.sha256);
    if (!existing) {
      hints.set(hint.sha256, hint);
      return;
    }
    existing.url ??= hint.url;
    existing.type ??= hint.type;
    existing.size ??= hint.size;
    if (hint.seen !== undefined && (existing.seen === undefined || hint.seen < existing.seen)) existing.seen = hint.seen;
  };

  for (const event of events) {
    for (const tag of event.tags) {
      if (tag[0] !== 'imeta') continue;
      const fields = new Map(tag.slice(1).map((entry) => {
        const space = entry.indexOf(' ');
        return [entry.slice(0, space), entry.slice(space + 1)] as const;
      }));
      const url = fields.get('url');
      const sha256 = fields.get('x') ?? (url ? /\/([0-9a-f]{64})(?:\.[a-z0-9]+)?$/i.exec(url)?.[1] : undefined);
      const size = Number(fields.get('size'));
      if (sha256) {
        add({ sha256: sha256.toLowerCase(), url, type: fields.get('m'), size: Number.isFinite(size) ? size : undefined, seen: event.created_at });
      }
    }

    // NIP-94 file metadata events carry the fields as plain tags.
    const x = event.tags.find(([name]) => name === 'x')?.[1];
    if (x) {
      const size = Number(event.tags.find(([name]) => name === 'size')?.[1]);
      add({
        sha256: x.toLowerCase(),
        url: event.tags.find(([name]) => name === 'url')?.[1],
        type: event.tags.find(([name]) => name === 'm')?.[1],
        size: Number.isFinite(size) ? size : undefined,
        seen: event.created_at,
      });
    }

    for (const match of event.content.matchAll(BLOB_URL_RE)) {
      add({ sha256: match[1].toLowerCase(), url: match[0], seen: event.created_at });
    }
  }

  return [...hints.values()];
}

const HISTORY_LIMIT = 500;

function historyKey(pubkey: string) {
  return `media:history:${pubkey}`;
}

/** Blobs this browser uploaded or mirrored for `pubkey`, newest first. */
export function loadUploadHistory(pubkey: string): BlobHint[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(historyKey(pubkey)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (item): item is BlobHint => Boolean(item) && typeof item === 'object' && typeof item.sha256 === 'string' && isSha256(item.sha256),
    );
  } catch {
    return [];
  }
}

export function rememberUpload(pubkey: string, descriptor: BlobDescriptor): void {
  const hint: BlobHint = {
    sha256: descriptor.sha256,
    url: descriptor.url,
    type: descriptor.type,
    size: descriptor.size,
    seen: descriptor.uploaded ?? Math.floor(Date.now() / 1000),
  };
  const next = [hint, ...loadUploadHistory(pubkey).filter((item) => item.sha256 !== hint.sha256)].slice(0, HISTORY_LIMIT);
  try {
    localStorage.setItem(historyKey(pubkey), JSON.stringify(next));
  } catch {
    // Storage full or unavailable: discovery just falls back to events.
  }
}

export function forgetUpload(pubkey: string, sha256: string): void {
  try {
    localStorage.setItem(historyKey(pubkey), JSON.stringify(loadUploadHistory(pubkey).filter((item) => item.sha256 !== sha256)));
  } catch {
    // Ignore.
  }
}

/** `PUT /upload` via XHR so the caller gets upload progress. */
export function uploadBlob(
  server: string,
  file: File,
  opts: { sha256: string; authorization: string; onProgress?: (fraction: number) => void; signal?: AbortSignal },
): Promise<BlobDescriptor> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', new URL('/upload', server));
    xhr.setRequestHeader('authorization', opts.authorization);
    xhr.setRequestHeader('x-sha-256', opts.sha256);
    if (file.type) xhr.setRequestHeader('content-type', file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) opts.onProgress?.(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new TypeError('Network error while uploading'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    xhr.onload = () => {
      const response = new Response(xhr.status === 204 ? null : xhr.responseText, {
        status: xhr.status,
        headers: { 'x-reason': xhr.getResponseHeader('x-reason') ?? '' },
      });
      descriptorFromResponse(response, opts.sha256).then(resolve, reject);
    };

    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** `PUT /mirror` (BUD-04): ask `server` to fetch the blob from `sourceUrl`. */
export async function mirrorBlob(
  server: string,
  sourceUrl: string,
  opts: { sha256: string; authorization: string; signal?: AbortSignal },
): Promise<BlobDescriptor> {
  const response = await fetch(new URL('/mirror', server), {
    method: 'PUT',
    body: JSON.stringify({ url: sourceUrl }),
    headers: { authorization: opts.authorization, 'content-type': 'application/json' },
    signal: opts.signal,
  });
  return descriptorFromResponse(response, opts.sha256);
}

/** `DELETE /<sha256>`. */
export async function deleteBlob(
  server: string,
  sha256: string,
  opts: { authorization: string; signal?: AbortSignal },
): Promise<void> {
  const response = await fetch(new URL(`/${sha256}`, server), {
    method: 'DELETE',
    headers: { authorization: opts.authorization },
    signal: opts.signal,
  });
  if (!response.ok) throw await errorFromResponse(response);
}

/**
 * Merge per-server lists into one library keyed by hash. `servers` must be
 * normalized and in the user's preference order.
 */
export function mergeLibrary(lists: { server: string; blobs: BlobDescriptor[] }[]): LibraryBlob[] {
  const byHash = new Map<string, LibraryBlob>();

  for (const { server, blobs } of lists) {
    for (const blob of blobs) {
      const existing = byHash.get(blob.sha256);
      if (existing) {
        existing.locations.set(server, blob.url);
        existing.type ??= blob.type;
        existing.nip94 ??= blob.nip94;
        if (!existing.size && blob.size) existing.size = blob.size;
        if (blob.uploaded !== undefined && (existing.uploaded === undefined || blob.uploaded < existing.uploaded)) {
          existing.uploaded = blob.uploaded;
        }
      } else {
        byHash.set(blob.sha256, {
          sha256: blob.sha256,
          size: blob.size,
          type: blob.type,
          uploaded: blob.uploaded,
          url: blob.url,
          nip94: blob.nip94,
          locations: new Map([[server, blob.url]]),
        });
      }
    }
  }

  return [...byHash.values()].sort((a, b) => (b.uploaded ?? 0) - (a.uploaded ?? 0));
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', pdf: 'application/pdf',
};

/** The blob's MIME type, falling back to its URL extension. */
export function blobMimeType(blob: { type?: string; url: string }): string | undefined {
  if (blob.type && blob.type !== 'application/octet-stream') return blob.type;
  try {
    const extension = new URL(blob.url).pathname.split('.').pop()?.toLowerCase();
    return (extension && EXTENSION_TYPES[extension]) ?? blob.type;
  } catch {
    return blob.type;
  }
}

export type MediaCategory = 'image' | 'video' | 'audio' | 'other';

export function mediaCategory(mime: string | undefined): MediaCategory {
  if (!mime) return 'other';
  // SVG can carry script; never render it as a preview.
  if (mime === 'image/svg+xml') return 'other';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}

/** A NIP-94 `imeta` tag (NIP-92) describing the blob. */
export function buildImetaTag(blob: { url: string; sha256: string; size: number; type?: string; nip94?: string[][] }): string[] {
  const tag = ['imeta', `url ${blob.url}`];
  const mime = blobMimeType(blob);
  if (mime) tag.push(`m ${mime}`);
  tag.push(`x ${blob.sha256}`);
  if (blob.size) tag.push(`size ${blob.size}`);
  for (const name of ['dim', 'blurhash', 'alt']) {
    const value = blob.nip94?.find(([key]) => key === name)?.[1];
    if (value) tag.push(`${name} ${value}`);
  }
  return tag;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}
