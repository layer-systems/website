import { useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const fields = ['name', 'display_name', 'about', 'website', 'picture', 'banner', 'nip05', 'lud16'] as const;
const labels = ['Name', 'Display name', 'About', 'Website', 'Picture URL', 'Banner URL', 'Nostr address (nip05)', 'Lightning address (lud16)'];

export function EditProfileDialog() {
  const [open, setOpen] = useState(false);
  const { user } = useCurrentUser();
  return <><Button variant="outline" size="sm" onClick={() => setOpen(true)}>Edit profile</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
      {open && user && <ProfileForm key={user.pubkey} pubkey={user.pubkey} onSaved={() => setOpen(false)} />}
    </DialogContent></Dialog></>;
}

function ProfileForm({ pubkey, onSaved }: { pubkey: string; onSaved: () => void }) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const publish = useNostrPublish();
  const upload = useUploadFile();
  const cache = useQueryClient();
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function readLatest() {
    const urls = [...new Set(config.relayMetadata.relays.filter(r => r.read || r.write).map(r => r.url))];
    if (!urls.length) throw new Error('Configure a relay before editing your profile.');
    const results = await Promise.all(urls.map(async url => {
      const events: NostrEvent[] = [];
      for await (const msg of nostr.relay(url).req([{ kinds: [0], authors: [pubkey], limit: 1 }], { signal: AbortSignal.timeout(10000) })) {
        if (msg[0] === 'EVENT') events.push(msg[2]);
        if (msg[0] === 'EOSE') return events;
      }
      throw new Error(`Could not finish reading ${url}. Profile was not saved.`);
    }));
    const latest = results.flat().sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
    const parsed: unknown = latest ? JSON.parse(latest.content) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Existing profile metadata is invalid. Refusing to overwrite it.');
    return { metadata: parsed as Record<string, unknown>, event: latest };
  }
  const profile = useQuery({ queryKey: ['profile-editor', pubkey], queryFn: readLatest, retry: false, staleTime: 0 });
  if (profile.isPending) return <Skeleton className="h-64 w-full" />;
  if (profile.isError) return <div role="alert">Unable to read your complete profile. <Button onClick={() => profile.refetch()}>Retry</Button></div>;
  return <form className="space-y-4" onSubmit={async e => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const latest = await readLatest();
      const event = await publish.mutateAsync({ kind: 0, content: JSON.stringify({ ...latest.metadata, ...changes }), tags: latest.event?.tags ?? [], created_at: Math.max(Math.floor(Date.now() / 1000), (latest.event?.created_at ?? 0) + 1) });
      cache.setQueryData(['nostr', 'author', pubkey], { event, metadata: JSON.parse(event.content) });
      await cache.invalidateQueries({ queryKey: ['nostr', 'logins'] });
      await cache.invalidateQueries({ queryKey: ['nostr', 'author'] });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Profile could not be saved.'); }
    finally { setBusy(false); }
  }}>
    {fields.map((field, i) => <div key={field} className="space-y-2">
      <label htmlFor={`profile-${field}`} className="text-sm font-medium">{labels[i]}</label>
      <Input id={`profile-${field}`} disabled={busy || upload.isPending} value={changes[field] ?? (typeof profile.data.metadata[field] === 'string' ? profile.data.metadata[field] as string : '')}
        type={['picture', 'banner', 'website'].includes(field) ? 'url' : 'text'}
        pattern={field === 'lud16' || field === 'nip05' ? '[^@\\s]+@[^@\\s]+\\.[^@\\s]+' : undefined}
        onChange={e => setChanges(previous => ({ ...previous, [field]: e.target.value }))} />
      {(field === 'picture' || field === 'banner') && <Input aria-label={`Upload ${field}`} type="file" accept="image/*" disabled={busy || upload.isPending} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        try {
          const tags = await upload.mutateAsync(file);
          const url = tags.find(t => t[0] === 'url')?.[1];
          if (!url || !url.startsWith('https://')) throw new Error('Upload did not return an HTTPS URL.');
          setChanges(previous => ({ ...previous, [field]: url }));
        } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed.'); }
      }} />}
    </div>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy || upload.isPending}>{busy ? 'Saving…' : upload.isPending ? 'Uploading…' : 'Save profile'}</Button>
  </form>;
}
