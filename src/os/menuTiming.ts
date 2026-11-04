/**
 * When an icon's long-press menu last opened. A finger resting on an icon
 * both opens that menu and (after lifting) can fire a click or end a drag;
 * icons consult this so the menu never also launches or drops the icon.
 */
let menuOpenedAt = 0;

export function markMenuOpened(): void {
  menuOpenedAt = Date.now();
}

export function menuJustOpened(windowMs = 700): boolean {
  return Date.now() - menuOpenedAt < windowMs;
}
