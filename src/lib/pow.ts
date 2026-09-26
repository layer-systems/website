import { getEventHash } from 'nostr-tools/pure';
import { getPow } from 'nostr-tools/nip13';

/** NIP-13 difficulty bounds offered in the composer UI. */
export const POW_MIN_DIFFICULTY = 1;
export const POW_MAX_DIFFICULTY = 32;
export const POW_DEFAULT_DIFFICULTY = 16;

export interface PowTemplate {
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

export interface PowChunkResult {
  /** The mined template, set once an id meeting the target was found. */
  event?: PowTemplate & { id: string };
  /** Next nonce to try when resuming. */
  nonce: number;
}

export { getPow };

/**
 * Tries `count` consecutive nonces starting at `nonce`, per NIP-13: the last
 * `nonce` tag is `["nonce", "<n>", "<target>"]` and the event id must have at
 * least `difficulty` leading zero bits. Any existing `nonce` tag is replaced.
 */
export function mineChunk(
  template: PowTemplate,
  difficulty: number,
  nonce: number,
  count: number,
): PowChunkResult {
  const tag = ['nonce', '0', String(difficulty)];
  const event = {
    ...template,
    tags: [...template.tags.filter(([name]) => name !== 'nonce'), tag],
  };

  const end = nonce + count;
  for (; nonce < end; nonce++) {
    tag[1] = String(nonce);
    const id = getEventHash(event);
    if (getPow(id) >= difficulty) {
      return { event: { ...event, tags: event.tags.map((t) => [...t]), id }, nonce: nonce + 1 };
    }
  }
  return { nonce };
}

/** Expected number of hashes to reach `difficulty` bits (2^difficulty). */
export function expectedHashes(difficulty: number): number {
  return 2 ** difficulty;
}

/** Below this, a note's leading zero bits are as likely luck as effort. */
export const POW_DISPLAY_THRESHOLD = 8;

/**
 * The proof of work an event actually carries, per NIP-13: the id's leading
 * zero bits, capped at the committed target in its `nonce` tag so a lucky
 * hash doesn't count as extra work. Events without a `nonce` tag score 0 —
 * the id is what can't be faked, the tag is only a claim.
 */
export function eventPow(event: { id: string; tags: string[][] }): number {
  const nonce = event.tags.findLast(([name]) => name === 'nonce');
  if (!nonce) return 0;
  const actual = getPow(event.id);
  const target = Number.parseInt(nonce[2] ?? '', 10);
  return Number.isFinite(target) && target >= 0 ? Math.min(actual, target) : actual;
}
