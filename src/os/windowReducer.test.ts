import { lazy } from 'react';
import { describe, expect, it } from 'vitest';
import { Info } from 'lucide-react';
import { initialState, windowReducer } from './windowReducer';
import type { AppDefinition } from './types';

const viewport = { width: 1280, height: 800 };

const app: AppDefinition = {
  id: 'about',
  title: 'About',
  description: 'What this is and how it works',
  icon: Info,
  category: 'system',
  component: lazy(async () => ({ default: () => null })),
  defaultSize: { width: 400, height: 400 },
  minSize: { width: 200, height: 200 },
};

function openOne() {
  const state = windowReducer(initialState, { type: 'OPEN_APP', app, viewport });
  return { state, id: state.windows[0].id };
}

describe('windowReducer', () => {
  it('opens an app and focuses it', () => {
    const { state, id } = openOne();
    expect(state.windows).toHaveLength(1);
    expect(state.focusedId).toBe(id);
  });

  // Apps set their window title from an effect that re-runs whenever the
  // callback identity changes. Handing back a fresh state for a title that did
  // not change re-renders every context consumer, which re-runs the effect,
  // which dispatches again — an endless render loop.
  it('returns the same state when a no-op title is set', () => {
    const { state, id } = openOne();
    const next = windowReducer(state, { type: 'SET_TITLE', id, title: 'About' });
    expect(next).toBe(state);
  });

  it('still applies a title that differs', () => {
    const { state, id } = openOne();
    const next = windowReducer(state, { type: 'SET_TITLE', id, title: 'About — v2' });
    expect(next).not.toBe(state);
    expect(next.windows[0].title).toBe('About — v2');
  });

  it('returns the same state for an unknown window id', () => {
    const { state } = openOne();
    expect(windowReducer(state, { type: 'SET_TITLE', id: 'nope', title: 'x' })).toBe(state);
  });
});
