import { lazy } from 'react';
import { Activity, Bookmark, BookOpen, CalendarDays, FileText, Image, Info, Link2, Radio, Rss, Search, Settings, Sparkles, User } from 'lucide-react';
import type { AppDefinition } from './types';

/**
 * The catalogue of every app the OS can open. Adding an entry here is all that
 * is needed to make an app appear on the desktop, in the menu bar and in the
 * command palette.
 */
export const APPS: AppDefinition[] = [
  {
    id: 'feed',
    title: 'Feed',
    description: 'Notes from the people you follow, and from the wider network',
    icon: Rss,
    category: 'social',
    component: lazy(() => import('@/apps/feed')),
    defaultSize: { width: 640, height: 720 },
    minSize: { width: 360, height: 320 },
  },
  {
    id: 'profile',
    title: 'Profile',
    description: 'Someone’s bio, links and notes',
    icon: User,
    category: 'social',
    component: lazy(() => import('@/apps/profile')),
    defaultSize: { width: 620, height: 700 },
    minSize: { width: 360, height: 320 },
  },
  {
    id: 'search',
    title: 'Search',
    description: 'Find notes, replies, hashtags and people across Nostr',
    icon: Search,
    category: 'social',
    component: lazy(() => import('@/apps/search')),
    defaultSize: { width: 680, height: 700 },
    minSize: { width: 360, height: 320 },
  },
  {
    id: 'notes',
    title: 'Note',
    description: 'A single note and its replies',
    icon: FileText,
    category: 'social',
    component: lazy(() => import('@/apps/notes')),
    defaultSize: { width: 600, height: 660 },
    minSize: { width: 340, height: 300 },
    singleton: false,
  },
  {
    id: 'articles',
    title: 'Reader',
    description: 'Long-form articles published on Nostr',
    icon: BookOpen,
    category: 'social',
    component: lazy(() => import('@/apps/articles')),
    defaultSize: { width: 780, height: 760 },
    minSize: { width: 360, height: 320 },
  },
  {
    id: 'images',
    title: 'Images',
    description: 'Discover and share picture posts on Nostr',
    icon: Image,
    category: 'social',
    component: lazy(() => import('@/apps/images')),
    defaultSize: { width: 820, height: 720 },
    minSize: { width: 360, height: 360 },
  },
  {
    id: 'bookmarks',
    title: 'Bookmarks',
    description: 'Notes and articles you have saved',
    icon: Bookmark,
    category: 'social',
    component: lazy(() => import('@/apps/bookmarks')),
    defaultSize: { width: 600, height: 660 },
    minSize: { width: 340, height: 300 },
  },
  {
    id: 'web-bookmarks',
    title: 'Web Bookmarks',
    description: 'Links you have saved from around the web',
    icon: Link2,
    category: 'social',
    component: lazy(() => import('@/apps/web-bookmarks')),
    defaultSize: { width: 600, height: 660 },
    minSize: { width: 340, height: 300 },
  },
  {
    id: 'live',
    title: 'Live',
    description: 'Live streams happening on Nostr right now',
    icon: Radio,
    category: 'social',
    component: lazy(() => import('@/apps/live')),
    defaultSize: { width: 780, height: 720 },
    minSize: { width: 360, height: 320 },
  },
  {
    id: 'calendar',
    title: 'Calendar',
    description: 'Nostr calendar events, browsed by month',
    icon: CalendarDays,
    category: 'social',
    component: lazy(() => import('@/apps/calendar')),
    defaultSize: { width: 900, height: 700 },
    minSize: { width: 420, height: 420 },
  },
  {
    id: 'spells',
    title: 'Spells',
    description: 'Saved, shareable Nostr queries you can re-run any time',
    icon: Sparkles,
    category: 'tools',
    component: lazy(() => import('@/apps/spells')),
    defaultSize: { width: 760, height: 700 },
    minSize: { width: 380, height: 320 },
  },
  {
    id: 'relays',
    title: 'Relays',
    description: 'Connection status, latency and throughput of your relays',
    icon: Activity,
    category: 'system',
    component: lazy(() => import('@/apps/relays')),
    defaultSize: { width: 720, height: 480 },
    minSize: { width: 380, height: 280 },
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Appearance, relays, media servers and your account',
    icon: Settings,
    category: 'system',
    component: lazy(() => import('@/apps/settings')),
    defaultSize: { width: 680, height: 600 },
    minSize: { width: 360, height: 320 },
  },
  {
    id: 'about',
    title: 'About',
    description: 'What this is and how it works',
    icon: Info,
    category: 'system',
    component: lazy(() => import('@/apps/about')),
    defaultSize: { width: 520, height: 560 },
    minSize: { width: 320, height: 320 },
  },
];

const APPS_BY_ID = new Map(APPS.map((app) => [app.id, app]));

export function getApp(id: string): AppDefinition | undefined {
  return APPS_BY_ID.get(id);
}

export function desktopApps(): AppDefinition[] {
  return APPS.filter((app) => app.showOnDesktop !== false);
}

/** Min sizes keyed by app id, used when the viewport shrinks. */
export function minSizeMap(): Record<string, { width: number; height: number }> {
  return Object.fromEntries(APPS.map((app) => [app.id, app.minSize]));
}
