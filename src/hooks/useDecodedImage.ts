import { useEffect, useState } from 'react';

export type DecodedImageStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DecodedImageState {
  /** The URL that finished decoding successfully, or undefined if none has yet. */
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
  // stale state before the new decode starts.
  if (trackedUrl !== url) {
    setTrackedUrl(url);
    setState(url ? { url: undefined, status: 'loading', width: undefined, height: undefined } : { url: undefined, status: 'idle', width: undefined, height: undefined });
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
        setState((prev) => ({ url: prev.status === 'ready' ? prev.url : undefined, status: 'error', width: undefined, height: undefined }));
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
