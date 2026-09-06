import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Parameters handed to an app instance, e.g. from a deep link. */
export type AppParams = Record<string, string>;

export interface AppProps {
  /** Id of the window this app instance lives in. */
  windowId: string;
  /** Deep-link parameters (npub, nevent, naddr, ...). */
  params: AppParams;
  /** Lets the app override its window title. */
  setTitle: (title: string) => void;
  /**
   * Replaces the window's parameters. Apps use this for navigation inside
   * themselves, which keeps the deep link in the URL in step with what the
   * window is actually showing.
   */
  setParams: (params: AppParams) => void;
}

export type AppCategory = 'social' | 'tools' | 'system';

export interface AppDefinition {
  id: string;
  title: string;
  /** Short line shown in the command palette and the About app. */
  description: string;
  icon: LucideIcon;
  category: AppCategory;
  component: LazyExoticComponent<ComponentType<AppProps>>;
  defaultSize: Size;
  minSize: Size;
  /** Whether the window can be resized. Defaults to true. */
  resizable?: boolean;
  /** Only one instance may exist at a time. Defaults to true. */
  singleton?: boolean;
  /** Show an icon on the desktop. Defaults to true. */
  showOnDesktop?: boolean;
  /** Render a login prompt instead of the app when signed out. */
  requiresAuth?: boolean;
}

export interface WindowState {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  /** Geometry before maximizing, restored on un-maximize. */
  prevRect?: Rect;
  params: AppParams;
}

export interface WindowManagerState {
  windows: WindowState[];
  /** Id of the focused window, or null when the desktop itself has focus. */
  focusedId: string | null;
  /** Monotonic counter used to mint unique window ids. */
  counter: number;
  /** Highest z-index currently in use. */
  maxZ: number;
}
