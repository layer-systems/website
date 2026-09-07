import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { WallpaperSection } from './index';

// Radix's Slider (used for the dimming control) measures its track via
// ResizeObserver. The vi.fn()-based mock in src/test/setup.ts cannot be
// used with `new` on this environment/vitest combination, so provide a
// minimal real constructor for just this file.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// A controllable stand-in for the browser's `Image` constructor, mirroring
// the one in useDecodedImage.test.ts, so a preview can be resolved on demand.
class FakeImage {
  decoding = '';
  src = '';
  naturalWidth = 40;
  naturalHeight = 30;
  private resolveDecode!: () => void;
  readonly decodePromise = new Promise<void>((resolve) => {
    this.resolveDecode = resolve;
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
}

let instances: FakeImage[] = [];

describe('WallpaperSection', () => {
  let originalImage: typeof Image;
  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(() => {
    originalResizeObserver = global.ResizeObserver;
    global.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
    instances = [];
    originalImage = globalThis.Image;
    globalThis.Image = FakeImage as unknown as typeof Image;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
    global.ResizeObserver = originalResizeObserver;
  });

  it('shows the dot-grid curated wallpaper selected by default', async () => {
    render(<WallpaperSection />, { wrapper: TestApp });

    const dotGrid = await screen.findByRole('radio', { name: 'Dot grid' });
    expect(dotGrid).toBeChecked();
    const aurora = screen.getByRole('radio', { name: 'Aurora bands' });
    expect(aurora).not.toBeChecked();
  });

  it('selects a different curated wallpaper when clicked', async () => {
    render(<WallpaperSection />, { wrapper: TestApp });

    const aurora = await screen.findByRole('radio', { name: 'Aurora bands' });
    fireEvent.click(aurora);

    await waitFor(() => expect(aurora).toBeChecked());
    expect(screen.getByRole('radio', { name: 'Dot grid' })).not.toBeChecked();
  });

  it('does not enable saving a custom URL until it has been previewed', async () => {
    render(<WallpaperSection />, { wrapper: TestApp });

    const saveButton = await screen.findByRole('button', { name: 'Save wallpaper' });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Custom image'), {
      target: { value: 'http://not-https.example.com/a.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    // An insecure URL must never start a preview/decode.
    expect(saveButton).toBeDisabled();
    expect(screen.queryByAltText('Wallpaper preview')).not.toBeInTheDocument();
  });

  it('previews and saves a valid https custom URL, switching off the curated selection', async () => {
    render(<WallpaperSection />, { wrapper: TestApp });

    const urlInput = await screen.findByLabelText('Custom image');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/wallpaper.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => expect(instances).toHaveLength(1));
    instances[0].finish();

    const previewImg = await screen.findByAltText('Wallpaper preview');
    expect(previewImg).toHaveAttribute('src', 'https://example.com/wallpaper.jpg');

    const saveButton = screen.getByRole('button', { name: 'Save wallpaper' });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Dot grid' })).not.toBeChecked());
  });
});
