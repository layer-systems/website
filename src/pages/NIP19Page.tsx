import { nip19 } from 'nostr-tools';
import { Copy, Fingerprint, MapPin, Radio } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { OsShell } from '@/components/navigation/OsShell';
import { useToast } from '@/hooks/useToast';
import NotFound from './NotFound';

const labels: Record<string, { title: string; detail: string }> = {
  npub: { title: 'Profile pointer', detail: 'A public key that identifies a person or service on Nostr.' },
  nprofile: { title: 'Profile pointer', detail: 'A profile pointer with relay hints for faster discovery.' },
  note: { title: 'Note pointer', detail: 'A pointer to a short text note on the Nostr network.' },
  nevent: { title: 'Event pointer', detail: 'A portable pointer to a Nostr event and its relay hints.' },
  naddr: { title: 'Address pointer', detail: 'A durable address for a replaceable Nostr event.' },
};

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();
  const { toast } = useToast();

  if (!identifier) return <NotFound />;

  let decoded: ReturnType<typeof nip19.decode>;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  const presentation = labels[decoded.type];
  if (!presentation) return <NotFound />;

  const detail = typeof decoded.data === 'string' ? decoded.data : JSON.stringify(decoded.data, null, 2);

  const copyPointer = async () => {
    try {
      await navigator.clipboard.writeText(identifier);
      toast({ title: 'Nostr pointer copied' });
    } catch {
      toast({ title: 'Could not copy pointer', variant: 'destructive' });
    }
  };

  return (
    <OsShell title="Pointer" eyebrow="NIP-19 resolver">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-3xl border border-primary/25 bg-primary/[0.07] p-6 sm:p-8">
          <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><Fingerprint className="h-5 w-5" /></span><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Resolved {decoded.type}</p><h2 className="mt-1 text-3xl font-semibold tracking-tight">{presentation.title}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{presentation.detail}</p></div></div>
        </section>
        <Card className="mt-5 border-border/70 bg-card/70"><CardContent className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold"><Radio className="h-4 w-4 text-primary" /> Nostr address</div><button type="button" onClick={copyPointer} className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold transition-colors hover:bg-primary hover:text-primary-foreground"><Copy className="h-3.5 w-3.5" /> Copy</button></div><code className="mt-4 block overflow-x-auto rounded-xl border border-border bg-background/60 p-4 font-mono text-xs leading-6 text-muted-foreground">{identifier}</code></CardContent></Card>
        <Card className="mt-5 border-border/70 bg-card/70"><CardContent className="p-5 sm:p-6"><div className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> Decoded route</div><pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-background/60 p-4 font-mono text-xs leading-6 text-muted-foreground">{detail}</pre></CardContent></Card>
      </div>
    </OsShell>
  );
}
