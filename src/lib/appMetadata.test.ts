import packageJson from '../../package.json';
import { describe, expect, test } from 'vitest';
import { APP_NAME, APP_VERSION } from './appMetadata';

describe('app metadata', () => {
  test('uses package metadata as the authoritative source', () => {
    expect(APP_NAME).toBe(packageJson.name);
    expect(APP_VERSION).toBe(packageJson.version);
    expect(APP_NAME).toBe('LAYER.systems');
    expect(APP_VERSION).toBe('1.0.0');
  });
});
