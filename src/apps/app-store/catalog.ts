import { APPS, isDefaultEnabled } from '@/os/registry';
import type { AppCategory, AppDefinition } from '@/os/types';

export const CATEGORIES: { id: AppCategory; label: string; blurb: string }[] = [
  { id: 'social', label: 'Social', blurb: 'Notes, people, media and events from across Nostr' },
  { id: 'tools', label: 'Tools', blurb: 'Utilities for your files and power-user workflows' },
  { id: 'system', label: 'System', blurb: 'Relays, settings and the things that keep it running' },
];

export function categoryLabel(category: AppCategory): string {
  return CATEGORIES.find((entry) => entry.id === category)?.label ?? category;
}

/**
 * Icon tiles get a colour of their own, the way a store shelf would look.
 * Picked by position in the registry rather than a hash, so neighbours never
 * end up with the same colour. Listed in full so Tailwind can see each class.
 */
const TILE_GRADIENTS = [
  'from-violet-500 to-indigo-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-fuchsia-500 to-purple-600',
  'from-cyan-500 to-sky-600',
  'from-lime-500 to-green-600',
  'from-red-500 to-rose-600',
  'from-indigo-500 to-blue-700',
  'from-teal-500 to-cyan-700',
  'from-orange-500 to-red-600',
];

const SYSTEM_GRADIENT = 'from-zinc-500 to-zinc-700';

export function tileGradient(app: AppDefinition): string {
  if (app.category === 'system') return SYSTEM_GRADIENT;
  const index = APPS.findIndex((entry) => entry.id === app.id);
  return TILE_GRADIENTS[Math.max(index, 0) % TILE_GRADIENTS.length];
}

export function availabilityLabel(app: AppDefinition): string {
  if (app.locked) return 'Always on';
  return isDefaultEnabled(app) ? 'Basic' : 'Optional';
}
