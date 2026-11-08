import { z } from 'zod';
import type { AppDefinition } from './types';
import { isDefaultEnabled } from './registry';

export const APP_SELECTION_STORAGE_KEY = 'nostr:app-selection';

/**
 * Only the user's explicit choices are stored. An app that appears in neither
 * list follows its registry default, so apps added in a later release start
 * out the way their author intended instead of being frozen off (or on) by a
 * snapshot taken today.
 */
export interface AppSelection {
  enabled: string[];
  disabled: string[];
}

export const EMPTY_APP_SELECTION: AppSelection = { enabled: [], disabled: [] };

const AppSelectionSchema = z.object({
  enabled: z.array(z.string()),
  disabled: z.array(z.string()),
}) satisfies z.ZodType<AppSelection>;

export function serializeAppSelection(selection: AppSelection): string {
  return JSON.stringify(selection);
}

/** Throws on malformed input; `useLocalStorage` then falls back to the defaults. */
export function deserializeAppSelection(raw: string): AppSelection {
  return AppSelectionSchema.parse(JSON.parse(raw));
}

export function isAppEnabled(app: AppDefinition, selection: AppSelection): boolean {
  if (app.locked) return true;
  if (selection.enabled.includes(app.id)) return true;
  if (selection.disabled.includes(app.id)) return false;
  return isDefaultEnabled(app);
}

/** Records a choice, dropping it again when it just restates the default. */
export function withAppEnabled(
  selection: AppSelection,
  app: AppDefinition,
  enabled: boolean,
): AppSelection {
  if (app.locked) return selection;
  const enabledIds = selection.enabled.filter((id) => id !== app.id);
  const disabledIds = selection.disabled.filter((id) => id !== app.id);
  if (enabled !== isDefaultEnabled(app)) {
    (enabled ? enabledIds : disabledIds).push(app.id);
  }
  return { enabled: enabledIds, disabled: disabledIds };
}
