import { useContext } from 'react';
import { MusicPlayerContext } from '@/contexts/musicPlayer';

export function useMusicPlayer() {
  const value = useContext(MusicPlayerContext);
  if (!value) throw new Error('MusicPlayerProvider is missing');
  return value;
}
