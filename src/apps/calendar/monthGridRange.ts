/**
 * The inclusive/exclusive date range the grid actually renders for
 * `monthAnchor`, including the leading/trailing days of adjacent months that
 * complete the first and last week rows. Exported so the data layer can
 * request exactly what's on screen — no more, no less.
 */
export function monthGridRange(monthAnchor: Date): { start: Date; end: Date } {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const start = new Date(year, month, 1 - firstOfMonth.getDay());
  const end = new Date(year, month, lastOfMonth.getDate() + (6 - lastOfMonth.getDay()) + 1);
  return { start, end };
}
