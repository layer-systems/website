import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { type Track } from '@/lib/music';
import { MusicPlayerContext, type MusicPlayerValue } from '@/contexts/musicPlayer';

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [wanted, setWanted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [error, setError] = useState<string>();
  const current = queue[index];

  const next = useCallback(() => {
    setTime(0);
    setError(undefined);
    setIndex((value) => {
      if (value + 1 >= queue.length) {
        setWanted(false);
        return value;
      }
      return value + 1;
    });
  }, [queue.length]);

  const previous = useCallback(() => {
    if ((audio.current?.currentTime ?? 0) > 3) {
      if (audio.current) audio.current.currentTime = 0;
      setTime(0);
      return;
    }
    setError(undefined);
    setIndex((value) => Math.max(0, value - 1));
    setWanted(true);
  }, []);

  useEffect(() => {
    if (!current || !wanted || !audio.current) return;
    const element = audio.current;
    element.play().catch((reason: unknown) => {
      setPlaying(false);
      setWanted(false);
      setError(reason instanceof Error && reason.name === 'NotAllowedError'
        ? 'Your browser blocked playback. Press Play to start.'
        : 'This audio could not be played. Try again or skip it.');
    });
  }, [current, wanted]);

  const playTracks = useCallback((tracks: Track[], start = 0) => {
    if (!tracks.length) return;
    setQueue(tracks);
    setIndex(Math.max(0, Math.min(start, tracks.length - 1)));
    setTime(0);
    setDuration(0);
    setError(undefined);
    setWanted(true);
  }, []);

  const toggle = useCallback(() => {
    if (!audio.current || !current) return;
    setError(undefined);
    if (audio.current.paused) {
      setWanted(true);
      audio.current.play().catch(() => {
        setPlaying(false);
        setWanted(false);
        setError('This audio could not be played. Try again or skip it.');
      });
    } else {
      audio.current.pause();
      setWanted(false);
    }
  }, [current]);

  const seek = useCallback((value: number) => {
    if (!audio.current || !Number.isFinite(value)) return;
    audio.current.currentTime = value;
    setTime(value);
  }, []);

  const setVolume = useCallback((value: number) => {
    const nextVolume = Math.max(0, Math.min(1, value));
    if (audio.current) audio.current.volume = nextVolume;
    setVolumeState(nextVolume);
  }, []);

  const clear = useCallback(() => {
    audio.current?.pause();
    setQueue([]);
    setIndex(0);
    setWanted(false);
    setPlaying(false);
    setError(undefined);
  }, []);

  const value = useMemo<MusicPlayerValue>(() => ({
    queue, index, current, playing, time, duration, volume, error,
    playTracks, toggle, next, previous, seek, setVolume, clear,
  }), [queue, index, current, playing, time, duration, volume, error, playTracks, toggle, next, previous, seek, setVolume, clear]);

  return <MusicPlayerContext.Provider value={value}>
    {children}
    <audio
      ref={audio}
      src={current?.audioUrl}
      preload="metadata"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
      onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onEnded={next}
      onError={() => {
        if (!current) return;
        setError('This audio is unavailable or uses an unsupported format. Try again or skip it.');
        setWanted(false);
        setPlaying(false);
      }}
    />
  </MusicPlayerContext.Provider>;
}
