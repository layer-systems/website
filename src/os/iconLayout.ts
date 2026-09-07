import { z } from 'zod';
import { reconcileFolderState, type FolderState } from './folders';

const STORAGE_KEY = 'nostr:icon-layout';
const VERSION = 1;

/** Grid entries are app ids or folder entries (`folder:<id>`). */
export type GridEntryId = string;

export interface DesktopSlot {
  id: string;
  col: number;
  row: number;
}

export interface IconLayout {
  desktop: DesktopSlot[];
  mobile: string[];
}

export interface GridGeometry {
  columns: number;
  rows: number;
}

const SlotSchema = z.object({
  id: z.string().min(1),
  col: z.number().int().min(0),
  row: z.number().int().min(0),
});

const LayoutSchema = z.object({
  version: z.literal(VERSION),
  desktop: z.array(SlotSchema).max(250),
  mobile: z.array(z.string().min(1)).max(250),
  // Pre-folders saves have no `folders` field; it defaults to empty.
  folders: z.unknown().optional(),
});

function firstFree(occupied: Set<string>, geometry: GridGeometry): Omit<DesktopSlot, 'id'> {
  for (let row = 0; row < geometry.rows; row += 1) {
    for (let col = 0; col < geometry.columns; col += 1) {
      if (!occupied.has(`${col}:${row}`)) return { col, row };
    }
  }
  // A very small viewport can temporarily have fewer cells than apps. Keep
  // the remaining icons in the last stable row so they stay on-screen.
  return { col: 0, row: Math.max(0, geometry.rows - 1) };
}

export function defaultDesktopLayout(ids: string[], geometry: GridGeometry): DesktopSlot[] {
  const occupied = new Set<string>();
  return ids.map((id) => {
    const slot = firstFree(occupied, geometry);
    occupied.add(`${slot.col}:${slot.row}`);
    return { id, ...slot };
  });
}

/** Drops unknown IDs, clamps coordinates, resolves collisions, then adds new apps. */
export function reconcileDesktopLayout(
  saved: DesktopSlot[],
  ids: string[],
  geometry: GridGeometry,
): DesktopSlot[] {
  const eligible = new Set(ids);
  const seen = new Set<string>();
  const occupied = new Set<string>();
  const reconciled: DesktopSlot[] = [];

  for (const slot of saved) {
    if (!eligible.has(slot.id) || seen.has(slot.id)) continue;
    seen.add(slot.id);
    const col = Math.min(slot.col, Math.max(0, geometry.columns - 1));
    const row = Math.min(slot.row, Math.max(0, geometry.rows - 1));
    const key = `${col}:${row}`;
    const position = occupied.has(key) ? firstFree(occupied, geometry) : { col, row };
    occupied.add(`${position.col}:${position.row}`);
    reconciled.push({ id: slot.id, ...position });
  }

  for (const id of ids) {
    if (seen.has(id)) continue;
    const position = firstFree(occupied, geometry);
    occupied.add(`${position.col}:${position.row}`);
    reconciled.push({ id, ...position });
  }
  return reconciled;
}

export function reconcileMobileLayout(saved: string[], ids: string[]): string[] {
  const eligible = new Set(ids);
  const seen = new Set<string>();
  const ordered = saved.filter((id) => eligible.has(id) && !seen.has(id) && (seen.add(id), true));
  return [...ordered, ...ids.filter((id) => !seen.has(id))];
}

export function loadIconLayout(ids: string[], geometry: GridGeometry, folders?: FolderState): IconLayout {
  const entries = entryIds(ids, folders);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { desktop: defaultDesktopLayout(entries, geometry), mobile: [...entries] };
    const parsed = LayoutSchema.parse(JSON.parse(raw));
    return {
      desktop: reconcileDesktopLayout(parsed.desktop, entries, geometry),
      mobile: reconcileMobileLayout(parsed.mobile, entries),
    };
  } catch {
    return { desktop: defaultDesktopLayout(entries, geometry), mobile: [...entries] };
  }
}

/** Reconciles persisted folder state against the current app catalogue. */
export function reconcileFolders(folders: FolderState | undefined, ids: string[]): FolderState {
  return reconcileFolderState(folders ?? { folders: [], membership: {} }, ids);
}

/** The grid entry ids: top-level apps plus one entry per folder. */
export function entryIds(ids: string[], folders?: FolderState): string[] {
  if (!folders) return ids;
  const clean = reconcileFolderState(folders, ids);
  return [...ids.filter((id) => !clean.membership[id]), ...clean.folders.map((folder) => `folder:${folder.id}`)];
}

export function saveIconLayout(layout: IconLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...layout }));
  } catch {
    // Storage can be unavailable in private browsing; the in-memory layout remains usable.
  }
}

export function resetIconLayout(profile: 'desktop' | 'mobile' | 'both'): void {
  try {
    if (profile === 'both') localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The caller still resets its in-memory state.
  }
}

export function swapDesktopSlots(slots: DesktopSlot[], id: string, target: Omit<DesktopSlot, 'id'>): DesktopSlot[] {
  const source = slots.find((slot) => slot.id === id);
  if (!source) return slots;
  const displaced = slots.find((slot) => slot.col === target.col && slot.row === target.row && slot.id !== id);
  return slots.map((slot) => {
    if (slot.id === id) return { ...slot, ...target };
    if (slot.id === displaced?.id) return { ...slot, col: source.col, row: source.row };
    return slot;
  });
}

export const iconLayoutStorageKey = STORAGE_KEY;
