import type { NostrEvent } from '@nostrify/nostrify';

export const WORKOUT_KIND = 1301;

export interface Workout {
  activity: string;
  duration?: number;
  startedAt?: number;
  endedAt?: number;
  distance?: { value: number; unit: string };
  elevationGain?: { value: number; unit: string };
  calories?: number;
  averageHeartRate?: number;
  maximumHeartRate?: number;
  cadence?: number;
  source?: string;
  topics: string[];
}

function firstTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([tag]) => tag === name)?.[1];
}

function numberTag(event: NostrEvent, name: string): number | undefined {
  const value = firstTag(event, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function durationSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (!value.includes(':')) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  }
  const parts = value.split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
}

/** Parses the deployed NIP-101e/RUNSTR dialect without trusting optional tags. */
export function parseWorkout(event: NostrEvent): Workout | null {
  if (event.kind !== WORKOUT_KIND) return null;
  const activity = firstTag(event, 'exercise') ?? firstTag(event, 'type');
  if (!activity?.trim()) return null;

  const duration = durationSeconds(firstTag(event, 'duration'));
  const startedAt = numberTag(event, 'workout_start_time') ?? numberTag(event, 'start');
  const endedAt = numberTag(event, 'end');
  if (duration === undefined && !(startedAt !== undefined && endedAt !== undefined && endedAt >= startedAt)) return null;

  const distanceValue = numberTag(event, 'distance');
  const elevationValue = numberTag(event, 'elevation_gain');
  const distanceTag = event.tags.find(([tag]) => tag === 'distance');
  const elevationTag = event.tags.find(([tag]) => tag === 'elevation_gain');
  return {
    activity: activity.trim(),
    duration: duration ?? (endedAt! - startedAt!),
    startedAt,
    endedAt,
    distance: distanceValue === undefined ? undefined : { value: distanceValue, unit: distanceTag?.[2] || 'km' },
    elevationGain: elevationValue === undefined ? undefined : { value: elevationValue, unit: elevationTag?.[2] || 'm' },
    calories: numberTag(event, 'calories'),
    averageHeartRate: numberTag(event, 'avg_heart_rate'),
    maximumHeartRate: numberTag(event, 'max_heart_rate'),
    cadence: numberTag(event, 'cadence'),
    source: firstTag(event, 'source'),
    topics: event.tags.filter(([tag, value]) => tag === 't' && Boolean(value)).map(([, value]) => value),
  };
}

export function isWorkout(event: NostrEvent): boolean {
  return parseWorkout(event) !== null;
}
