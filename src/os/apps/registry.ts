import { Compass, LayoutDashboard, FolderSearch, DownloadCloud, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { WindowBounds } from '../window-manager/types';
import { Explore } from '@/pages/Explore';
import { Dashboard } from '@/pages/Dashboard';
import { DashboardEvents } from '@/pages/DashboardEvents';
import { DashboardExport } from '@/pages/DashboardExport';
import { Messages } from '@/pages/Messages';

export interface AppDefinition {
  /** Stable identifier used as the window/dock key. */
  id: string;
  /** Window title / dock tooltip. */
  title: string;
  /** Short description used in the mobile home screen and dock tooltips. */
  description: string;
  /** Path segment matched under /os/* for deep linking, e.g. "dashboard/events". */
  path: string;
  icon: LucideIcon;
  Component: ComponentType;
  defaultSize: { width: number; height: number };
}

function defaultBoundsFor(app: AppDefinition, index: number): WindowBounds {
  const offset = index * 28;
  return {
    x: 96 + offset,
    y: 72 + offset,
    width: app.defaultSize.width,
    height: app.defaultSize.height,
  };
}

export const APPS: AppDefinition[] = [
  {
    id: 'explore',
    title: 'Browser',
    description: 'Discover notes and profiles on the relay',
    path: 'explore',
    icon: Compass,
    Component: Explore,
    defaultSize: { width: 720, height: 620 },
  },
  {
    id: 'dashboard',
    title: 'Stats',
    description: 'Your Nostr activity at a glance',
    path: 'dashboard',
    icon: LayoutDashboard,
    Component: Dashboard,
    defaultSize: { width: 820, height: 640 },
  },
  {
    id: 'events',
    title: 'Finder',
    description: 'Browse and manage your published events',
    path: 'dashboard/events',
    icon: FolderSearch,
    Component: DashboardEvents,
    defaultSize: { width: 780, height: 600 },
  },
  {
    id: 'export',
    title: 'Export',
    description: 'Back up your following list',
    path: 'dashboard/export',
    icon: DownloadCloud,
    Component: DashboardExport,
    defaultSize: { width: 560, height: 620 },
  },
  {
    id: 'messages',
    title: 'Messages',
    description: 'Private encrypted Nostr direct messages',
    path: 'messages',
    icon: MessageCircle,
    Component: Messages,
    defaultSize: { width: 760, height: 600 },
  },
];

export function findAppById(appId: string): AppDefinition | undefined {
  return APPS.find((app) => app.id === appId);
}

export function findAppByPath(path: string): AppDefinition | undefined {
  const normalized = path.replace(/^\/+|\/+$/g, '');
  return APPS.find((app) => app.path === normalized);
}

export { defaultBoundsFor };
