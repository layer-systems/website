import { describe, expect, it } from 'vitest';
import { defaultDesktopLayout, reconcileDesktopLayout, reconcileMobileLayout, swapDesktopSlots } from './iconLayout';

const geometry = { columns: 4, rows: 4 };

describe('defaultDesktopLayout', () => {
  it('places apps in row-major order starting from the first cell', () => {
    const slots = defaultDesktopLayout(['a', 'b', 'c'], geometry);
    expect(slots).toEqual([
      { id: 'a', col: 0, row: 0 },
      { id: 'b', col: 1, row: 0 },
      { id: 'c', col: 2, row: 0 },
    ]);
  });

  it('keeps overflow icons on the last row when there are more apps than cells', () => {
    const ids = Array.from({ length: 18 }, (_, i) => `app-${i}`);
    const slots = defaultDesktopLayout(ids, geometry);
    for (const slot of slots) {
      expect(slot.row).toBeLessThan(geometry.rows);
    }
  });
});

describe('reconcileDesktopLayout', () => {
  it('drops unknown ids and keeps known ones in place', () => {
    const saved = [
      { id: 'a', col: 0, row: 0 },
      { id: 'stale', col: 1, row: 0 },
    ];
    const reconciled = reconcileDesktopLayout(saved, ['a'], geometry);
    expect(reconciled).toEqual([{ id: 'a', col: 0, row: 0 }]);
  });

  it('clamps out-of-bounds coordinates to the grid', () => {
    const saved = [{ id: 'a', col: 99, row: 99 }];
    const reconciled = reconcileDesktopLayout(saved, ['a'], geometry);
    expect(reconciled[0].col).toBeLessThan(geometry.columns);
    expect(reconciled[0].row).toBeLessThan(geometry.rows);
  });

  it('resolves collisions by moving the later slot to the next free cell', () => {
    const saved = [
      { id: 'a', col: 0, row: 0 },
      { id: 'b', col: 0, row: 0 },
    ];
    const reconciled = reconcileDesktopLayout(saved, ['a', 'b'], geometry);
    const a = reconciled.find((slot) => slot.id === 'a');
    const b = reconciled.find((slot) => slot.id === 'b');
    expect(a).toEqual({ id: 'a', col: 0, row: 0 });
    expect(b).not.toEqual({ id: 'b', col: 0, row: 0 });
  });

  it('appends new apps to the first free cell after known ones', () => {
    const saved = [{ id: 'a', col: 0, row: 0 }];
    const reconciled = reconcileDesktopLayout(saved, ['a', 'b'], geometry);
    expect(reconciled).toEqual([
      { id: 'a', col: 0, row: 0 },
      { id: 'b', col: 1, row: 0 },
    ]);
  });

  it('drops duplicate saved entries for the same id', () => {
    const saved = [
      { id: 'a', col: 0, row: 0 },
      { id: 'a', col: 1, row: 0 },
    ];
    const reconciled = reconcileDesktopLayout(saved, ['a'], geometry);
    expect(reconciled).toEqual([{ id: 'a', col: 0, row: 0 }]);
  });

  it('keeps overflow icons within the grid when there are more apps than cells', () => {
    const ids = Array.from({ length: 18 }, (_, i) => `app-${i}`);
    const reconciled = reconcileDesktopLayout([], ids, geometry);
    for (const slot of reconciled) {
      expect(slot.row).toBeLessThan(geometry.rows);
      expect(slot.col).toBeLessThan(geometry.columns);
    }
  });
});

describe('reconcileMobileLayout', () => {
  it('keeps known ids in their saved order and drops unknown ones', () => {
    const ordered = reconcileMobileLayout(['b', 'stale', 'a'], ['a', 'b']);
    expect(ordered).toEqual(['b', 'a']);
  });

  it('appends new apps that were not in the saved order', () => {
    const ordered = reconcileMobileLayout(['a'], ['a', 'b']);
    expect(ordered).toEqual(['a', 'b']);
  });

  it('drops duplicate saved entries for the same id', () => {
    const ordered = reconcileMobileLayout(['a', 'a', 'b'], ['a', 'b']);
    expect(ordered).toEqual(['a', 'b']);
  });
});

describe('swapDesktopSlots', () => {
  it('swaps the moved icon with the icon occupying the target cell', () => {
    const slots = [
      { id: 'a', col: 0, row: 0 },
      { id: 'b', col: 1, row: 0 },
    ];
    const next = swapDesktopSlots(slots, 'a', { col: 1, row: 0 });
    expect(next).toEqual([
      { id: 'a', col: 1, row: 0 },
      { id: 'b', col: 0, row: 0 },
    ]);
  });

  it('moves the icon to an empty cell without disturbing others', () => {
    const slots = [
      { id: 'a', col: 0, row: 0 },
      { id: 'b', col: 1, row: 0 },
    ];
    const next = swapDesktopSlots(slots, 'a', { col: 2, row: 0 });
    expect(next).toEqual([
      { id: 'a', col: 2, row: 0 },
      { id: 'b', col: 1, row: 0 },
    ]);
  });

  it('returns the original slots unchanged when the id is not found', () => {
    const slots = [{ id: 'a', col: 0, row: 0 }];
    const next = swapDesktopSlots(slots, 'missing', { col: 1, row: 0 });
    expect(next).toBe(slots);
  });
});
