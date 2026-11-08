import { useSyncExternalStore } from 'react';
import type { AudioSource } from './podcasts';

/**
 * The podcast player lives outside React: one `HTMLAudioElement`, created on
 * first use and never attached to the DOM. Windows remount when the shell
 * switches between desktop and mobile, apps unmount when another app takes the
 * phone screen — none of that may stop the episode playing.
 *
 * Listening progress is local only and keyed by account, so switching
 * accounts on a shared browser never mixes or reveals another account's
 * history. Nothing about playback is ever published.
 */

export interface QueueItem {
  id: string;
  showPubkey: string;
  title: string;
  showTitle?: string;
  image?: string;
  sources: AudioSource[];
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error' | 'ended';

export interface PlayerState {
  queue: QueueItem[];
  /** Index of the current item in `queue`, -1 when nothing is loaded. */
  index: number;
  status: PlayerStatus;
  error?: string;
  /** Which of the current item's sources is loaded. */
  sourceIndex: number;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
}

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

const PROGRESS_PREFIX = 'layer:podcast-progress:';
const PROGRESS_LIMIT = 300;
const SAVE_INTERVAL_MS = 5000;

interface Progress {
  t: number;
  d: number;
  at: number;
}

let state: PlayerState = {
  queue: [],
  index: -1,
  status: 'idle',
  sourceIndex: 0,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  rate: 1,
};

const listeners = new Set<() => void>();
let audio: HTMLAudioElement | undefined;
let account: string | undefined;
let lastSave = 0;
/** Seconds to seek to once the newly loaded source knows its duration. */
let pendingSeek: number | undefined;

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPlayerState(): PlayerState {
  return state;
}

export function usePodcastPlayer(): PlayerState {
  return useSyncExternalStore(subscribe, getPlayerState, getPlayerState);
}

export function currentItem(snapshot: PlayerState = state): QueueItem | undefined {
  return snapshot.index >= 0 ? snapshot.queue[snapshot.index] : undefined;
}

// ---------------------------------------------------------------------------
// Local, account-scoped progress
// ---------------------------------------------------------------------------

function progressKey(pubkey: string | undefined) {
  return `${PROGRESS_PREFIX}${pubkey ?? 'signed-out'}`;
}

function readProgress(pubkey: string | undefined): Record<string, Progress> {
  try {
    const raw = localStorage.getItem(progressKey(pubkey));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, Progress> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const { t, d, at } = value as Record<string, unknown>;
      if (typeof t === 'number' && typeof d === 'number' && typeof at === 'number' && Number.isFinite(t)) {
        result[id] = { t, d, at };
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeProgress(pubkey: string | undefined, id: string, progress: Progress | undefined) {
  try {
    const all = readProgress(pubkey);
    if (progress) all[id] = progress;
    else delete all[id];
    const kept = Object.entries(all).sort(([, a], [, b]) => b.at - a.at).slice(0, PROGRESS_LIMIT);
    localStorage.setItem(progressKey(pubkey), JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage full or blocked: progress is a convenience, playback goes on.
  }
}

/** Every saved position under the given account, keyed by episode id. */
export function progressMap(pubkey: string | undefined): Record<string, { position: number; duration: number }> {
  return Object.fromEntries(Object.entries(readProgress(pubkey)).map(([id, entry]) => [id, { position: entry.t, duration: entry.d }]));
}

/** Saved position for an episode under the given account, in seconds, or undefined. */
export function savedProgress(pubkey: string | undefined, id: string): { position: number; duration: number } | undefined {
  const entry = readProgress(pubkey)[id];
  return entry ? { position: entry.t, duration: entry.d } : undefined;
}

function saveCurrent(force = false) {
  const item = currentItem();
  if (!item || !audio) return;
  const now = Date.now();
  if (!force && now - lastSave < SAVE_INTERVAL_MS) return;
  lastSave = now;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const finished = duration > 0 && audio.currentTime >= duration - 15;
  writeProgress(account, item.id, finished ? undefined : { t: audio.currentTime, d: duration, at: now });
}

/** Called whenever the signed-in account changes; progress is saved under the account it was made with. */
export function setPlayerAccount(pubkey: string | undefined) {
  if (pubkey === account) return;
  saveCurrent(true);
  account = pubkey;
}

// ---------------------------------------------------------------------------
// The media element
// ---------------------------------------------------------------------------

function errorMessage(element: HTMLAudioElement): string {
  switch (element.error?.code) {
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This audio format isn’t supported by your browser, or the file is unavailable.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'The audio stopped loading because of a network problem.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'The audio file appears to be damaged.';
    default:
      return 'The audio couldn’t be loaded.';
  }
}

function element(): HTMLAudioElement {
  if (audio) return audio;
  const el = new Audio();
  el.preload = 'metadata';
  el.volume = state.volume;
  el.muted = state.muted;
  el.addEventListener('timeupdate', () => {
    set({ currentTime: el.currentTime });
    saveCurrent();
  });
  el.addEventListener('durationchange', () => set({ duration: Number.isFinite(el.duration) ? el.duration : 0 }));
  el.addEventListener('loadedmetadata', () => {
    if (pendingSeek !== undefined && Number.isFinite(el.duration) && pendingSeek < el.duration - 10) {
      el.currentTime = pendingSeek;
    }
    pendingSeek = undefined;
    el.playbackRate = state.rate;
  });
  // A source loaded without autoplay (queued, or autoplay refused) is ready, not loading.
  el.addEventListener('canplay', () => {
    if (el.paused && state.status === 'loading') set({ status: 'paused' });
  });
  el.addEventListener('waiting', () => set({ status: 'loading' }));
  el.addEventListener('playing', () => set({ status: 'playing', error: undefined }));
  el.addEventListener('pause', () => {
    if (state.status !== 'error' && state.status !== 'ended') set({ status: 'paused' });
    saveCurrent(true);
  });
  el.addEventListener('ended', () => {
    saveCurrent(true);
    if (state.index < state.queue.length - 1) playIndex(state.index + 1);
    else set({ status: 'ended' });
  });
  el.addEventListener('error', () => {
    // Ignore errors from a source we've already moved away from.
    if (!el.getAttribute('src')) return;
    const item = currentItem();
    if (item && state.sourceIndex < item.sources.length - 1) {
      loadSource(state.sourceIndex + 1, el.currentTime || pendingSeek, true);
      return;
    }
    set({ status: 'error', error: errorMessage(el) });
  });
  el.addEventListener('volumechange', () => set({ volume: el.volume, muted: el.muted }));
  el.addEventListener('ratechange', () => set({ rate: el.playbackRate }));
  audio = el;
  setupMediaSession();
  return el;
}

/** Sources the browser says it may play first, unknown types next, "no" last. */
function orderedSources(sources: AudioSource[]): AudioSource[] {
  const el = element();
  const score = (source: AudioSource) => (!source.type ? 1 : el.canPlayType(source.type) ? 0 : 2);
  return [...sources].sort((a, b) => score(a) - score(b));
}

function attemptPlay() {
  const el = element();
  // Media failures arrive through the `error` event, and an AbortError only
  // means a newer load replaced this one; the autoplay policy is what's left.
  el.play().catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      set({ status: 'blocked', error: 'Your browser blocked autoplay. Press play to start listening.' });
    }
  });
}

function loadSource(sourceIndex: number, startAt: number | undefined, autoplay: boolean) {
  const item = currentItem();
  if (!item) return;
  const el = element();
  const source = item.sources[sourceIndex];
  if (!source) return;
  pendingSeek = startAt && startAt > 5 ? startAt : undefined;
  set({ sourceIndex, status: 'loading', error: undefined, currentTime: startAt ?? 0, duration: 0 });
  el.src = source.url;
  el.load();
  updateMediaSession();
  if (autoplay) attemptPlay();
}

export function playIndex(index: number, autoplay = true) {
  const item = state.queue[index];
  if (!item) return;
  saveCurrent(true);
  set({ index, queue: state.queue.map((entry, i) => (i === index ? { ...entry, sources: orderedSources(entry.sources) } : entry)) });
  const saved = savedProgress(account, item.id);
  loadSource(0, saved?.position, autoplay);
}

/** Starts an episode now. It is inserted after the current item, or brought forward if already queued. */
export function playNow(item: QueueItem) {
  const existing = state.queue.findIndex((entry) => entry.id === item.id);
  if (existing >= 0) {
    if (existing === state.index) {
      play();
      return;
    }
    playIndex(existing);
    return;
  }
  const insertAt = state.index + 1;
  set({ queue: [...state.queue.slice(0, insertAt), item, ...state.queue.slice(insertAt)] });
  playIndex(insertAt);
}

export function enqueue(item: QueueItem) {
  if (state.queue.some((entry) => entry.id === item.id)) return;
  set({ queue: [...state.queue, item] });
  if (state.index < 0) playIndex(state.queue.length - 1, false);
}

export function isQueued(id: string): boolean {
  return state.queue.some((entry) => entry.id === id);
}

export function removeFromQueue(id: string) {
  const index = state.queue.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  if (index === state.index) {
    saveCurrent(true);
    const queue = state.queue.filter((entry) => entry.id !== id);
    set({ queue, index: -1 });
    if (queue[index]) playIndex(index, state.status === 'playing');
    else if (queue[index - 1]) playIndex(index - 1, false);
    else stop();
    return;
  }
  set({ queue: state.queue.filter((entry) => entry.id !== id), index: index < state.index ? state.index - 1 : state.index });
}

export function moveInQueue(id: string, direction: -1 | 1) {
  const from = state.queue.findIndex((entry) => entry.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= state.queue.length) return;
  const queue = [...state.queue];
  [queue[from], queue[to]] = [queue[to], queue[from]];
  const index = state.index === from ? to : state.index === to ? from : state.index;
  set({ queue, index });
}

export function clearQueue() {
  const current = currentItem();
  set({ queue: current ? [current] : [], index: current ? 0 : -1 });
}

export function stop() {
  saveCurrent(true);
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  set({ queue: [], index: -1, status: 'idle', error: undefined, currentTime: 0, duration: 0, sourceIndex: 0 });
  updateMediaSession();
}

export function play() {
  if (!currentItem()) return;
  if (state.status === 'error' || !audio?.getAttribute('src')) {
    retry();
    return;
  }
  if (state.status === 'ended') element().currentTime = 0;
  attemptPlay();
}

export function pause() {
  audio?.pause();
}

export function togglePlay() {
  if (state.status === 'playing' || state.status === 'loading') pause();
  else play();
}

/**
 * Reloads from where playback stopped. After every source failed, starts over
 * at the first one, so the automatic fallback gets another full pass.
 */
export function retry() {
  if (!currentItem()) return;
  loadSource(state.status === 'error' ? 0 : state.sourceIndex, state.currentTime, true);
}

/** Tries the next audio source of the current episode, if it has one. */
export function tryNextSource(): boolean {
  const item = currentItem();
  if (!item || state.sourceIndex >= item.sources.length - 1) return false;
  loadSource(state.sourceIndex + 1, state.currentTime, true);
  return true;
}

export function next() {
  if (state.index < state.queue.length - 1) playIndex(state.index + 1);
}

export function previous() {
  if (audio && audio.currentTime > 5) {
    seek(0);
    return;
  }
  if (state.index > 0) playIndex(state.index - 1);
  else seek(0);
}

export function seek(seconds: number) {
  if (!audio || !Number.isFinite(seconds)) return;
  const max = Number.isFinite(audio.duration) ? audio.duration : seconds;
  audio.currentTime = Math.min(Math.max(0, seconds), max);
  set({ currentTime: audio.currentTime });
  saveCurrent(true);
}

export function skipBy(seconds: number) {
  if (audio) seek(audio.currentTime + seconds);
}

export function setVolume(volume: number) {
  const el = element();
  el.volume = Math.min(1, Math.max(0, volume));
  if (el.volume > 0 && el.muted) el.muted = false;
}

export function toggleMute() {
  const el = element();
  el.muted = !el.muted;
}

export function setRate(rate: number) {
  if (!PLAYBACK_RATES.includes(rate)) return;
  set({ rate });
  if (audio) audio.playbackRate = rate;
}

// ---------------------------------------------------------------------------
// Media Session: OS media keys and lock-screen controls
// ---------------------------------------------------------------------------

function setupMediaSession() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const session = navigator.mediaSession;
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => play()],
    ['pause', () => pause()],
    ['previoustrack', () => previous()],
    ['nexttrack', () => next()],
    ['seekbackward', () => skipBy(-15)],
    ['seekforward', () => skipBy(30)],
    ['seekto', (details) => details.seekTime !== undefined && seek(details.seekTime)],
  ];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // Unsupported action in this browser.
    }
  }
}

function updateMediaSession() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  const item = currentItem();
  navigator.mediaSession.metadata = item
    ? new MediaMetadata({
      title: item.title,
      artist: item.showTitle ?? 'Podcast',
      artwork: item.image ? [{ src: item.image }] : [],
    })
    : null;
}
