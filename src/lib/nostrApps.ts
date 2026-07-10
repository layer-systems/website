import { Activity, Archive, Compass, Network, Sparkles } from 'lucide-react';

export const nostrApps = [
  { name: 'Discover', path: '/explore', icon: Compass, short: 'Find', detail: 'Explore the public network', hue: 'cyan' },
  { name: 'Activity', path: '/dashboard', icon: Activity, short: 'Me', detail: 'See your Nostr footprint', hue: 'amber' },
  { name: 'Studio', path: '/dashboard/events', icon: Sparkles, short: 'Studio', detail: 'Inspect your published events', hue: 'violet' },
  { name: 'Archive', path: '/dashboard/export', icon: Archive, short: 'Save', detail: 'Keep your social graph portable', hue: 'emerald' },
  { name: 'Network', path: '/network', icon: Network, short: 'Relay', detail: 'Manage signal routes', hue: 'rose' },
] as const;
