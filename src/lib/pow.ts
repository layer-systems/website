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
