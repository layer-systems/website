import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { formatDuration, isWorkout, parseWorkout, WORKOUT_KIND } from './workouts';

function event(tags: string[][], kind = WORKOUT_KIND): NostrEvent {
  return { id: 'id', pubkey: 'author', created_at: 0, kind, tags, content: '', sig: '' };
}

describe('workouts', () => {
  it('parses a NIP-101e workout with metrics and topics', () => {
    const workout = parseWorkout(event([
      ['exercise', ' running '], ['duration', '00:45:30'], ['workout_start_time', '1700000000'],
      ['distance', '5.2', 'mi'], ['elevation_gain', '120'], ['calories', '420'],
      ['avg_heart_rate', '150'], ['max_heart_rate', '175'], ['cadence', '88'], ['source', 'manual'], ['t', 'training'], ['t', ''],
    ]));
    expect(workout).toEqual({
      activity: 'running', duration: 2730, startedAt: 1700000000, endedAt: undefined,
      distance: { value: 5.2, unit: 'mi' }, elevationGain: { value: 120, unit: 'm' }, calories: 420,
      averageHeartRate: 150, maximumHeartRate: 175, cadence: 88, source: 'manual', topics: ['training'],
    });
  });

  it('accepts RUNSTR-style type, start tags, MM:SS and plain-second durations', () => {
    expect(parseWorkout(event([['type', 'cycling'], ['start', '100'], ['duration', '12:05']]))).toMatchObject({ activity: 'cycling', startedAt: 100, duration: 725 });
    expect(parseWorkout(event([['exercise', 'yoga'], ['duration', '900']]))?.duration).toBe(900);
    expect(parseWorkout(event([['exercise', 'yoga'], ['duration', '0']]))?.duration).toBe(0);
  });

  it('derives duration from start and end when the duration tag is missing', () => {
    expect(parseWorkout(event([['exercise', 'walking'], ['workout_start_time', '0'], ['end', '600']]))).toMatchObject({ startedAt: 0, endedAt: 600, duration: 600 });
  });

  it('rejects wrong kinds, missing activity, and missing or invalid durations', () => {
    expect(isWorkout(event([['exercise', 'running'], ['duration', '600']], 1))).toBe(false);
    expect(isWorkout(event([['exercise', '  '], ['duration', '600']]))).toBe(false);
    expect(isWorkout(event([['exercise', 'running']]))).toBe(false);
    expect(isWorkout(event([['exercise', 'running'], ['start', '600'], ['end', '100']]))).toBe(false);
    for (const duration of ['1:2:3:4', '1', 'a:b', '-5', '10:-1', '1.5:00', 'abc']) {
      expect(isWorkout(event([['exercise', 'running'], ['duration', duration]]))).toBe(duration === '1');
    }
  });

  it('ignores negative or non-numeric optional metrics', () => {
    const workout = parseWorkout(event([['exercise', 'running'], ['duration', '600'], ['calories', '-1'], ['distance', 'far'], ['avg_heart_rate', 'NaN']]));
    expect(workout).toMatchObject({ calories: undefined, distance: undefined, averageHeartRate: undefined });
  });

  it('formats durations as HH:MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(2730)).toBe('00:45:30');
    expect(formatDuration(36061.9)).toBe('10:01:01');
  });
});
