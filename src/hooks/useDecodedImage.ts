import { useEffect, useState } from 'react';

export type DecodedImageStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DecodedImageState {
  /**
   * The URL that most recently finished decoding successfully, or undefined
   * if none has yet. This intentionally lags behind `status` while a newer
   * request is loading or has failed, so a consumer can keep rendering it
   * as "the current working wallpaper" until a *new* url succeeds.
   */
  url: string | undefined;
  status: DecodedImageStatus;
  width: number | undefined;
  height: number | undefined;
}

/**
 * Decodes an image off-DOM before it is swapped into the page, so a slow or
 * broken URL never flashes a half-loaded image and never replaces a
 * currently-working wallpaper. If `url` changes while a previous decode is
 * still pending, the stale result is ignored — the newest request always
 * wins, and rapid re-selection cannot un-apply a later choice.
 */
export function useDecodedImage(url: string | undefined): DecodedImageState {
  const [state, setState] = useState<DecodedImageState>(() =>
    url
      ? { url: undefined, status: 'loading', width: undefined, height: undefined }
      : { url: undefined, status: 'idle', width: undefined, height: undefined },
  );
  const [trackedUrl, setTrackedUrl] = useState(url);

  // Mirrors the useLocalStorage "key changed" pattern: reset synchronously
  // during render rather than in an effect body, so there is no flash of
  // stale state before the new decode starts. `url` (the last *successful*
  // decode) is deliberately preserved here — only `status` moves to
  // 'loading'/'idle' — so a caller keeps showing the last working image
  // while a new one loads or if it fails.
  if (trackedUrl !== url) {
    setTrackedUrl(url);
    setState((prev) => (url ? { ...prev, status: 'loading' } : { url: undefined, status: 'idle', width: undefined, height: undefined }));
  }

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    img.decode()
      .then(() => {
        if (cancelled) return;
        setState({ url, status: 'ready', width: img.naturalWidth, height: img.naturalHeight });
      })
      .catch(() => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, status: 'error' }));
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
