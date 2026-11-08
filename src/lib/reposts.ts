import type { NostrEvent } from '@nostrify/nostrify';

/** NIP-18: kind 6 reposts kind 1 notes; kind 16 is the generic repost for every other kind. */
export const REPOST_KIND = 6;
export const GENERIC_REPOST_KIND = 16;

/** The repost kind NIP-18 reserves for `target`. */
export function repostKindFor(target: Pick<NostrEvent, 'kind'>): number {
  return target.kind === 1 ? REPOST_KIND : GENERIC_REPOST_KIND;
}

/** NIP-70 protected events carry a bare `["-"]` tag. */
function isProtected(event: NostrEvent): boolean {
  return event.tags.some((tag) => tag.length === 1 && tag[0] === '-');
}

function isAddressable(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

function isReplaceable(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
}

/**
 * Builds the unsigned repost template for `target`.
 *
 * The `e` tag always carries a relay URL as its third entry, as NIP-18
 * requires; pass an empty string only if the client knows no relay at all.
 */
export function buildRepost(target: NostrEvent, relayHint: string): { kind: number; content: string; tags: string[][] } {
  const kind = repostKindFor(target);
  const tags: string[][] = [
    ['e', target.id, relayHint],
    ['p', target.pubkey],
  ];
  if (kind === GENERIC_REPOST_KIND) {
    tags.push(['k', String(target.kind)]);
    const identifier = target.tags.find(([name]) => name === 'd')?.[1];
    if (isAddressable(target.kind) && identifier !== undefined) {
      tags.push(['a', `${target.kind}:${target.pubkey}:${identifier}`, relayHint]);
    } else if (isReplaceable(target.kind)) {
      tags.push(['a', `${target.kind}:${target.pubkey}:`, relayHint]);
    }
  }
  return {
    kind,
    // Reposts of protected events must not republish them inside `content`.
    content: isProtected(target) ? '' : JSON.stringify(target),
    tags,
  };
}

/**
 * True when `event` is a well-formed repost pointing at `targetId`. Rejects
 * kind 6 reposts of non-kind-1 targets and kind 16 reposts whose `k` tag
 * names a different kind than the target's (when the target kind is known).
 */
export function isRepostOf(event: NostrEvent, targetId: string, targetKind?: number): boolean {
  if (event.kind !== REPOST_KIND && event.kind !== GENERIC_REPOST_KIND) return false;
  if (!event.tags.some(([name, value]) => name === 'e' && value === targetId)) return false;
  if (targetKind === undefined) return true;
  if (event.kind !== repostKindFor({ kind: targetKind })) return false;
  if (event.kind === GENERIC_REPOST_KIND) {
    const k = event.tags.find(([name]) => name === 'k')?.[1];
    if (k !== undefined && k !== String(targetKind)) return false;
  }
  return true;
}
