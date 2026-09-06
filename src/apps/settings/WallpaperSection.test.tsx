import { beforeEach, describe, expect, it } from 'vitest';
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

describe('WallpaperSection', () => {
  beforeEach(() => {
    global.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
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
});
