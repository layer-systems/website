import type { LibraryBlob } from '@/lib/blossom';

export function blobDisplayName(blob: LibraryBlob): string {
  try {
    const last = new URL(blob.url).pathname.split('/').pop();
    if (last) return last;
  } catch {
    // Fall through to the hash.
  }
  return blob.sha256;
}

export function formatUploaded(uploaded: number | undefined): string {
  if (!uploaded) return 'Unknown';
  return new Date(uploaded * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
