/** Only known public content gets automatic attribution. Unknown kinds fail closed. */
const PUBLIC_CONTENT_KINDS = new Set([1, 6, 7, 16, 20, 30023]);

/**
 * NIP-89 permits a client name without a handler reference. Add an address and
 * relay hint only once an app-owned kind 31990 handler has been published.
 * Always copy tags: callers may reuse templates after publishing.
 */
export function clientTags(kind: number, tags: string[][], enabled: boolean): string[][] {
  const result = tags.filter(([name]) => enabled || name !== 'client').map((tag) => [...tag]);
  if (enabled && PUBLIC_CONTENT_KINDS.has(kind) && !result.some(([name]) => name === 'client')) {
    result.push(['client', 'LAYER.systems']);
  }
  return result;
}
