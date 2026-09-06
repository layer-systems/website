import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultDesktopLayout,
  iconLayoutStorageKey,
  loadIconLayout,
  reconcileDesktopLayout,
  reconcileMobileLayout,
  resetIconLayout,
  saveIconLayout,
  type DesktopSlot,
  type GridGeometry,
  type IconLayout,
} from './iconLayout';

const SAVE_DELAY = 250;

export function useIconLayout(ids: string[], geometry: GridGeometry) {
  const idsKey = ids.join('|');
  const [layout, setLayout] = useState<IconLayout>(() => loadIconLayout(ids, geometry));
  const stableIds = useMemo(() => (idsKey ? idsKey.split('|') : []), [idsKey]);
  const stableGeometry = useMemo(
    () => ({ columns: geometry.columns, rows: geometry.rows }),
    [geometry.columns, geometry.rows],
  );
  const normalized = useMemo<IconLayout>(() => ({
    desktop: reconcileDesktopLayout(layout.desktop, stableIds, stableGeometry),
    mobile: reconcileMobileLayout(layout.mobile, stableIds),
  }), [layout, stableGeometry, stableIds]);

  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!dirty.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      dirty.current = false;
      saveIconLayout(normalized);
    }, SAVE_DELAY);
    return () => clearTimeout(saveTimer.current);
  }, [normalized]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== iconLayoutStorageKey) return;
      setLayout(loadIconLayout(stableIds, stableGeometry));
    };
    window.addEventListener('storage', onStorage);
    const onReset = () => setLayout(loadIconLayout(stableIds, stableGeometry));
    window.addEventListener('icon-layout-reset', onReset);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('icon-layout-reset', onReset);
    };
  }, [stableGeometry, stableIds]);

  const setDesktop = useCallback((updater: (slots: DesktopSlot[]) => DesktopSlot[]) => {
    dirty.current = true;
    setLayout((current) => ({
      ...current,
      desktop: updater(reconcileDesktopLayout(current.desktop, stableIds, stableGeometry)),
    }));
  }, [stableGeometry, stableIds]);
  const setMobile = useCallback((updater: (order: string[]) => string[]) => {
    dirty.current = true;
    setLayout((current) => ({ ...current, mobile: updater(reconcileMobileLayout(current.mobile, stableIds)) }));
  }, [stableIds]);
  const reset = useCallback((profile: 'desktop' | 'mobile' | 'both') => {
    resetIconLayout(profile);
    const next = {
      desktop: profile === 'mobile' ? normalized.desktop : defaultDesktopLayout(stableIds, stableGeometry),
      mobile: profile === 'desktop' ? normalized.mobile : [...stableIds],
    };
    dirty.current = false;
    clearTimeout(saveTimer.current);
    saveIconLayout(next);
    setLayout(next);
    window.dispatchEvent(new Event('icon-layout-reset'));
  }, [normalized.desktop, normalized.mobile, stableGeometry, stableIds]);

  return useMemo(() => ({ layout: normalized, setDesktop, setMobile, reset }), [normalized, reset, setDesktop, setMobile]);
}
