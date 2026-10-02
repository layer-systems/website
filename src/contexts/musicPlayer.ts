import { createContext } from 'react';
import type { Track } from '@/lib/music';

export interface MusicPlayerValue {
  queue: Track[];
  index: number;
  current: Track | undefined;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  error: string | undefined;
  playTracks: (tracks: Track[], index?: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  clear: () => void;
  /** Registers a mounted player UI; returns the cleanup for its unmount. */
  attach: () => () => void;
}

export const MusicPlayerContext = createContext<MusicPlayerValue | null>(null);
