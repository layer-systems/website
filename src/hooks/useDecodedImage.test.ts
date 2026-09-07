import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDecodedImage } from './useDecodedImage';

/**
 * A controllable stand-in for the browser's `Image` constructor. Each
 * instance's `decode()` promise is only resolved/rejected when the test
 * explicitly does so, so we can assert on the intermediate "loading" state
 * and on stale-request ordering.
 */
class FakeImage {
  decoding = '';
  src = '';
  naturalWidth = 100;
  naturalHeight = 50;
  private resolveDecode!: () => void;
  private rejectDecode!: (error: unknown) => void;
  readonly decodePromise = new Promise<void>((resolve, reject) => {
    this.resolveDecode = resolve;
    this.rejectDecode = reject;
  });

  constructor() {
    instances.push(this);
  }

  decode() {
    return this.decodePromise;
  }

  finish() {
    this.resolveDecode();
  }

  fail() {
    this.rejectDecode(new Error('decode failed'));
  }
}

let instances: FakeImage[] = [];

describe('useDecodedImage', () => {
  let originalImage: typeof Image;

  beforeEach(() => {
    instances = [];
    originalImage = globalThis.Image;
    globalThis.Image = FakeImage as unknown as typeof Image;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
  });

  it('starts idle when there is no url', () => {
    const { result } = renderHook(() => useDecodedImage(undefined));
    expect(result.current.status).toBe('idle');
    expect(result.current.url).toBeUndefined();
  });

  it('transitions loading -> ready once the image decodes', async () => {
    const { result } = renderHook(() => useDecodedImage('https://example.com/a.png'));
    expect(result.current.status).toBe('loading');

    instances[0].finish();

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.url).toBe('https://example.com/a.png');
    expect(result.current.width).toBe(100);
  });

  it('keeps the last successfully decoded url when a new decode fails', async () => {
    const { result, rerender } = renderHook(({ url }) => useDecodedImage(url), {
      initialProps: { url: 'https://example.com/good.png' },
    });
    instances[0].finish();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.url).toBe('https://example.com/good.png');

    rerender({ url: 'https://example.com/bad.png' });
    expect(result.current.status).toBe('loading');

    instances[1].fail();
    await waitFor(() => expect(result.current.status).toBe('error'));
    // The previously-working wallpaper must not be un-applied by a failed swap.
    expect(result.current.url).toBe('https://example.com/good.png');
  });

  it('ignores a stale decode that resolves after a newer request replaced it', async () => {
    const { result, rerender } = renderHook(({ url }) => useDecodedImage(url), {
      initialProps: { url: 'https://example.com/first.png' },
    });
    rerender({ url: 'https://example.com/second.png' });
    expect(instances).toHaveLength(2);

    instances[1].finish();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.url).toBe('https://example.com/second.png');

    // The stale first request resolving afterwards must not overwrite the
    // newer, already-applied selection.
    instances[0].finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.url).toBe('https://example.com/second.png');
  });

  it('resets to idle when the url is cleared', async () => {
    const { result, rerender } = renderHook(({ url }) => useDecodedImage(url), {
      initialProps: { url: 'https://example.com/a.png' as string | undefined },
    });
    instances[0].finish();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ url: undefined });
    expect(result.current.status).toBe('idle');
    expect(result.current.url).toBeUndefined();
  });
});
