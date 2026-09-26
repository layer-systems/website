import { useEffect, useRef, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { generateIdentifier } from '@/lib/nip51';
import { secureMediaUrl, TRACK_KIND, type Track } from '@/lib/music';

export function PublishTrack({ existing, onPublished }: { existing?: Track; onPublished: (pubkey: string, identifier: string) => void }) {
  const { user } = useCurrentUser();
  const upload = useUploadFile();
  const publish = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const previewRef = useRef<string | undefined>(undefined);
  const [uploadedMediaTag, setUploadedMediaTag] = useState<string[]>();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [artist, setArtist] = useState(existing?.artist === 'Unknown artist' ? '' : existing?.artist ?? '');
  const [album, setAlbum] = useState(existing?.album ?? '');
  const [artwork, setArtwork] = useState(existing?.artwork ?? '');
  const [audioUrl, setAudioUrl] = useState(existing?.audioUrl ?? '');
  const [description, setDescription] = useState(existing?.event.content ?? '');
  const [duration, setDuration] = useState(existing?.duration ? String(existing.duration) : '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); };
  }, []);

  const chooseFile = (next: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : undefined;
    setPreviewUrl(previewRef.current);
    setFile(next);
    if (next) setUploadedMediaTag(undefined);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    try {
      if (!title.trim() || !artist.trim()) throw new Error('Add a title and artist.');
      if (artwork.trim() && !secureMediaUrl(artwork.trim())) throw new Error('Artwork must use an https:// URL.');
      if (file && !file.type.startsWith('audio/')) throw new Error('Choose an audio file.');
      const parsedDuration = duration.trim() ? Number(duration) : undefined;
      if (parsedDuration !== undefined && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)) throw new Error('Duration must be a positive number of seconds.');

      let url = secureMediaUrl(audioUrl.trim());
      let mediaTag: string[] | undefined = uploadedMediaTag;
      if (file) {
        const tags = await upload.mutateAsync(file);
        url = secureMediaUrl(tags.find(([name]) => name === 'url')?.[1]);
        if (!url) throw new Error('Upload succeeded but returned no secure audio URL.');
        mediaTag = ['imeta', `url ${url}`, ...tags.filter(([name, value]) => name !== 'url' && value).map(([name, value]) => `${name} ${value}`)];
        setAudioUrl(url);
        setUploadedMediaTag(mediaTag);
        chooseFile(null);
      }
      if (!url) throw new Error('Choose an audio file or enter an https:// audio URL.');
      if (!mediaTag) mediaTag = ['imeta', `url ${url}`, ...(existing?.mime ? [`m ${existing.mime}`] : [])];
      const identifier = existing?.identifier ?? generateIdentifier(title.trim());
      const tags: string[][] = [
        ['d', identifier], ['title', title.trim()], ['c', artist.trim(), 'artist'], mediaTag,
        ['url', url], ['alt', `Music track: ${title.trim()} by ${artist.trim()}`],
      ];
      if (album.trim()) tags.push(['c', album.trim(), 'album']);
      if (artwork.trim()) tags.push(['image', secureMediaUrl(artwork.trim())!]);
      if (parsedDuration) tags.push(['duration', String(Math.round(parsedDuration))]);
      const oldCreatedAt = existing?.event.created_at ?? 0;
      await publish.mutateAsync({ kind: TRACK_KIND, content: description.trim(), tags, created_at: Math.max(Math.floor(Date.now() / 1000), oldCreatedAt + 1) });
      await queryClient.invalidateQueries({ queryKey: ['nostr', 'music'] });
      toast({ title: existing ? 'Track updated' : 'Track published' });
      onPublished(user.pubkey, identifier);
    } catch (error) {
      toast({ title: 'Could not publish track', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <div className="mx-auto max-w-xl p-6 text-center text-sm text-muted-foreground">Sign in to publish music under your Nostr identity.</div>;
  if (existing && existing.event.pubkey !== user.pubkey) return <div className="p-6 text-sm text-muted-foreground">Only the track author can edit it.</div>;

  return <form onSubmit={(event) => void submit(event)} className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
    <div className="border-b border-border pb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Artist desk</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight">{existing ? 'Edit your track' : 'Release a track'}</h2>
      <p className="mt-2 text-sm text-muted-foreground">Upload to your Blossom servers, then publish the track metadata to Nostr relays.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2"><Label htmlFor="music-title">Title</Label><Input id="music-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} placeholder="Track title" /></div>
      <div className="flex flex-col gap-2"><Label htmlFor="music-artist">Artist</Label><Input id="music-artist" value={artist} onChange={(event) => setArtist(event.target.value)} required maxLength={120} placeholder="Artist name" /></div>
      <div className="flex flex-col gap-2"><Label htmlFor="music-album">Album (optional)</Label><Input id="music-album" value={album} onChange={(event) => setAlbum(event.target.value)} maxLength={120} /></div>
      <div className="flex flex-col gap-2"><Label htmlFor="music-duration">Duration in seconds (optional)</Label><Input id="music-duration" type="number" min="1" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} /></div>
    </div>
    <div className="flex flex-col gap-2"><Label htmlFor="music-file">Audio file</Label><div className="rounded-xl border border-dashed border-border bg-muted/40 p-4"><label htmlFor="music-file" className="flex cursor-pointer items-center gap-3 text-sm"><UploadCloud aria-hidden className="text-primary" /><span>{file?.name ?? 'Choose an audio file to upload'}</span></label><Input id="music-file" type="file" accept="audio/*" className="mt-3" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /></div>{(previewUrl || secureMediaUrl(audioUrl)) && <audio controls preload="metadata" src={previewUrl || secureMediaUrl(audioUrl)} className="w-full" aria-label="Audio preview" />}</div>
    <div className="flex flex-col gap-2"><Label htmlFor="music-url">Or use an existing HTTPS audio URL</Label><Input id="music-url" type="url" value={audioUrl} onChange={(event) => setAudioUrl(event.target.value)} placeholder="https://…/track.mp3" /><p className="text-xs text-muted-foreground">The audio must be publicly reachable for listeners on other clients.</p></div>
    <div className="flex flex-col gap-2"><Label htmlFor="music-artwork">Artwork URL (optional)</Label><Input id="music-artwork" type="url" value={artwork} onChange={(event) => setArtwork(event.target.value)} placeholder="https://…/cover.jpg" /></div>
    <div className="flex flex-col gap-2"><Label htmlFor="music-description">Description (optional)</Label><Textarea id="music-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={2000} /></div>
    <Button type="submit" disabled={busy} className="self-start">{busy && <Loader2 className="animate-spin" aria-hidden />}{busy ? 'Uploading and publishing…' : existing ? 'Save changes' : 'Publish track'}</Button>
  </form>;
}
