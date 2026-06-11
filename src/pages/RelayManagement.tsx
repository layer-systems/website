import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  Check,
  CircleAlert,
  FileWarning,
  Globe2,
  KeyRound,
  Loader2,
  Network,
  RefreshCw,
  Save,
  ServerCog,
  ShieldX,
  Tags,
  Wifi,
  X,
} from 'lucide-react';
import { AppSidebar } from '@/components/navigation/AppSidebar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { callNip86, isHex64, type Nip86Method, normalizeRelayManagementUrl } from '@/lib/nip86';

interface ReasonEntry { reason?: string }
interface PubkeyEntry extends ReasonEntry { pubkey: string }
interface EventEntry extends ReasonEntry { id: string }
interface IpEntry extends ReasonEntry { ip: string }

const STORAGE_KEY = 'nostr:nip86-relay';

function MethodBadge({ method, supported }: { method: Nip86Method; supported: Set<string> }) {
  const available = supported.has(method);
  return (
    <Badge variant={available ? 'default' : 'outline'} className={available ? 'bg-emerald-600 hover:bg-emerald-600' : 'text-muted-foreground'}>
      {available ? <Check className="mr-1 h-3 w-3" /> : <X className="mr-1 h-3 w-3" />}
      {method}
    </Badge>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

function EntryList<T extends ReasonEntry>({
  entries,
  value,
  actionLabel,
  onAction,
  disabled,
}: {
  entries: T[];
  value: (entry: T) => string;
  actionLabel: string;
  onAction: (entry: T) => void;
  disabled?: boolean;
}) {
  if (!entries.length) return <EmptyState>No entries returned by the relay.</EmptyState>;
  return (
    <div className="divide-y rounded-md border">
      {entries.map((entry) => {
        const entryValue = value(entry);
        return (
          <div key={entryValue} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs" title={entryValue}>{entryValue}</p>
              <p className="mt-1 text-xs text-muted-foreground">{entry.reason || 'No reason provided'}</p>
            </div>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAction(entry)}>{actionLabel}</Button>
          </div>
        );
      })}
    </div>
  );
}

export function RelayManagement() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [relayInput, setRelayInput] = useState(() => localStorage.getItem(STORAGE_KEY) || 'wss://');
  const [relayUrl, setRelayUrl] = useState('');
  const [supportedMethods, setSupportedMethods] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [pubkey, setPubkey] = useState('');
  const [pubkeyReason, setPubkeyReason] = useState('');
  const [pubkeyAction, setPubkeyAction] = useState<'banpubkey' | 'allowpubkey'>('banpubkey');
  const [bannedPubkeys, setBannedPubkeys] = useState<PubkeyEntry[]>([]);
  const [allowedPubkeys, setAllowedPubkeys] = useState<PubkeyEntry[]>([]);
  const [eventId, setEventId] = useState('');
  const [eventReason, setEventReason] = useState('');
  const [eventAction, setEventAction] = useState<'banevent' | 'allowevent'>('banevent');
  const [moderationEvents, setModerationEvents] = useState<EventEntry[]>([]);
  const [bannedEvents, setBannedEvents] = useState<EventEntry[]>([]);
  const [kind, setKind] = useState('');
  const [allowedKinds, setAllowedKinds] = useState<number[]>([]);
  const [ip, setIp] = useState('');
  const [ipReason, setIpReason] = useState('');
  const [blockedIps, setBlockedIps] = useState<IpEntry[]>([]);
  const [relayName, setRelayName] = useState('');
  const [relayDescription, setRelayDescription] = useState('');
  const [relayIcon, setRelayIcon] = useState('');

  const supported = useMemo(() => new Set(supportedMethods), [supportedMethods]);

  const invoke = useCallback(async <T,>(method: Nip86Method, params: unknown[] = []): Promise<T> => {
    if (!user) throw new Error('Log in with a Nostr account first.');
    if (!relayUrl) throw new Error('Connect to a relay first.');
    setBusy(method);
    setError('');
    try {
      return await callNip86<T>(user, relayUrl, method, params);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Relay management request failed.';
      setError(message);
      throw caught;
    } finally {
      setBusy('');
    }
  }, [relayUrl, user]);

  const refreshPubkeys = useCallback(async () => {
    const requests: Promise<void>[] = [];
    if (supported.has('listbannedpubkeys')) requests.push(invoke<PubkeyEntry[]>('listbannedpubkeys').then(setBannedPubkeys));
    if (supported.has('listallowedpubkeys')) requests.push(invoke<PubkeyEntry[]>('listallowedpubkeys').then(setAllowedPubkeys));
    await Promise.all(requests);
  }, [invoke, supported]);

  const refreshEvents = useCallback(async () => {
    const requests: Promise<void>[] = [];
    if (supported.has('listeventsneedingmoderation')) requests.push(invoke<EventEntry[]>('listeventsneedingmoderation').then(setModerationEvents));
    if (supported.has('listbannedevents')) requests.push(invoke<EventEntry[]>('listbannedevents').then(setBannedEvents));
    await Promise.all(requests);
  }, [invoke, supported]);

  const refreshKinds = useCallback(async () => {
    if (supported.has('listallowedkinds')) setAllowedKinds(await invoke<number[]>('listallowedkinds'));
  }, [invoke, supported]);

  const refreshIps = useCallback(async () => {
    if (supported.has('listblockedips')) setBlockedIps(await invoke<IpEntry[]>('listblockedips'));
  }, [invoke, supported]);

  const connect = async () => {
    if (!user) return;
    try {
      const normalized = normalizeRelayManagementUrl(relayInput);
      setBusy('supportedmethods');
      setError('');
      const methods = await callNip86<string[]>(user, normalized.websocket, 'supportedmethods');
      setRelayUrl(normalized.websocket);
      setSupportedMethods(methods);
      localStorage.setItem(STORAGE_KEY, normalized.websocket);
      toast({ title: 'Relay connected', description: `${methods.length} management methods detected.` });
    } catch (caught) {
      setRelayUrl('');
      setSupportedMethods([]);
      setError(caught instanceof Error ? caught.message : 'Could not connect to the relay.');
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    setBannedPubkeys([]);
    setAllowedPubkeys([]);
    setModerationEvents([]);
    setBannedEvents([]);
    setAllowedKinds([]);
    setBlockedIps([]);
  }, [relayUrl]);

  const runAction = async (method: Nip86Method, params: unknown[], success: string, refresh?: () => Promise<void>) => {
    try {
      await invoke(method, params);
      toast({ title: success });
      await refresh?.();
    } catch {
      // The shared request handler exposes the relay error in the page alert.
    }
  };

  const submitPubkey = async () => {
    if (!isHex64(pubkey)) return setError('Pubkeys must be 64-character hexadecimal values.');
    await runAction(pubkeyAction, [pubkey.trim(), pubkeyReason.trim()], pubkeyAction === 'banpubkey' ? 'Pubkey banned' : 'Pubkey allowed', refreshPubkeys);
    setPubkey('');
    setPubkeyReason('');
  };

  const submitEvent = async () => {
    if (!isHex64(eventId)) return setError('Event IDs must be 64-character hexadecimal values.');
    await runAction(eventAction, [eventId.trim(), eventReason.trim()], eventAction === 'banevent' ? 'Event banned' : 'Event allowed', refreshEvents);
    setEventId('');
    setEventReason('');
  };

  const connectedHost = relayUrl ? new URL(relayUrl).host : '';

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full overflow-x-hidden bg-muted/20">
        <AppSidebar />
        <main className="min-w-0 flex-1">
          <div className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur lg:h-[60px] lg:px-6">
            <SidebarTrigger />
            <h1 className="truncate text-lg font-semibold md:text-xl">Relay Management</h1>
            {relayUrl && <Badge variant="outline" className="ml-auto hidden gap-1.5 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{connectedHost}</Badge>}
          </div>

          <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
            <section className="relative overflow-hidden rounded-xl border bg-zinc-950 px-5 py-8 text-zinc-50 shadow-xl md:px-8">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(245,158,11,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,.16)_1px,transparent_1px)] [background-size:32px_32px]" />
              <div className="relative grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-end">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-400"><Network className="h-4 w-4" />NIP-86 control plane</div>
                  <h2 className="max-w-xl text-3xl font-bold tracking-tight md:text-5xl">Operate your relay from one console.</h2>
                  <p className="max-w-xl text-sm leading-6 text-zinc-400 md:text-base">Inspect supported methods, moderate events, manage access rules, and update relay settings through signed NIP-98 requests.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                  <Label htmlFor="relay-url" className="text-xs uppercase tracking-wider text-zinc-400">Relay endpoint</Label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input id="relay-url" value={relayInput} onChange={(event) => setRelayInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void connect()} placeholder="wss://relay.example.com" className="border-white/15 bg-black/40 font-mono text-zinc-100 placeholder:text-zinc-600" />
                    <Button onClick={() => void connect()} disabled={!user || !!busy} className="shrink-0 bg-amber-500 text-black hover:bg-amber-400">
                      {busy === 'supportedmethods' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
                      Connect
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">The WebSocket URL is converted to HTTP(S) for NIP-86 requests.</p>
                </div>
              </div>
            </section>

            {!user && <Alert><KeyRound className="h-4 w-4" /><AlertTitle>Nostr login required</AlertTitle><AlertDescription>Use the account control in the sidebar to sign NIP-98 authorization events.</AlertDescription></Alert>}
            {error && <Alert variant="destructive"><CircleAlert className="h-4 w-4" /><AlertTitle>Management request failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

            {!relayUrl ? (
              <Card className="border-dashed bg-background/70"><CardContent className="flex flex-col items-center py-16 text-center"><ServerCog className="mb-4 h-10 w-10 text-muted-foreground" /><h3 className="font-semibold">Connect a NIP-86 relay</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">The console first calls <code className="font-mono">supportedmethods</code> and only enables controls advertised by that relay.</p></CardContent></Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Methods', value: supportedMethods.length, icon: Activity },
                    { label: 'Banned pubkeys', value: bannedPubkeys.length, icon: ShieldX },
                    { label: 'Moderation queue', value: moderationEvents.length, icon: FileWarning },
                    { label: 'Allowed kinds', value: allowedKinds.length, icon: Tags },
                  ].map((stat) => <Card key={stat.label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p><p className="mt-1 text-3xl font-bold tabular-nums">{stat.value}</p></div><div className="rounded-md bg-primary/10 p-2.5 text-primary"><stat.icon className="h-5 w-5" /></div></CardContent></Card>)}
                </div>

                <Tabs defaultValue="access" className="space-y-4">
                  <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-5">
                    <TabsTrigger value="access">Access</TabsTrigger><TabsTrigger value="events">Events</TabsTrigger><TabsTrigger value="kinds">Kinds</TabsTrigger><TabsTrigger value="network">Network</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger>
                  </TabsList>

                  <TabsContent value="access" className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                    <Card><CardHeader><CardTitle>Pubkey rule</CardTitle><CardDescription>Ban a key or add it to the relay allowlist.</CardDescription></CardHeader><CardContent className="space-y-4">
                      <div className="space-y-2"><Label>Action</Label><Select value={pubkeyAction} onValueChange={(value) => setPubkeyAction(value as typeof pubkeyAction)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="banpubkey" disabled={!supported.has('banpubkey')}>Ban pubkey</SelectItem><SelectItem value="allowpubkey" disabled={!supported.has('allowpubkey')}>Allow pubkey</SelectItem></SelectContent></Select></div>
                      <div className="space-y-2"><Label htmlFor="pubkey">Pubkey hex</Label><Input id="pubkey" className="font-mono" maxLength={64} value={pubkey} onChange={(event) => setPubkey(event.target.value)} placeholder="64-character public key" /></div>
                      <div className="space-y-2"><Label htmlFor="pubkey-reason">Reason</Label><Input id="pubkey-reason" value={pubkeyReason} onChange={(event) => setPubkeyReason(event.target.value)} placeholder="Optional operator note" /></div>
                      <Button className="w-full" disabled={!!busy || !supported.has(pubkeyAction)} onClick={() => void submitPubkey()}>{busy === pubkeyAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Apply rule</Button>
                    </CardContent></Card>
                    <Card><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle>Access lists</CardTitle><CardDescription>Current relay-level pubkey controls.</CardDescription></div><Button variant="outline" size="icon" disabled={!!busy} onClick={() => void refreshPubkeys()}><RefreshCw className="h-4 w-4" /></Button></CardHeader><CardContent><Tabs defaultValue="banned"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="banned">Banned ({bannedPubkeys.length})</TabsTrigger><TabsTrigger value="allowed">Allowed ({allowedPubkeys.length})</TabsTrigger></TabsList><TabsContent value="banned"><EntryList entries={bannedPubkeys} value={(entry) => entry.pubkey} actionLabel="Unban" disabled={!supported.has('unbanpubkey')} onAction={(entry) => void runAction('unbanpubkey', [entry.pubkey], 'Pubkey unbanned', refreshPubkeys)} /></TabsContent><TabsContent value="allowed"><EntryList entries={allowedPubkeys} value={(entry) => entry.pubkey} actionLabel="Remove" disabled={!supported.has('unallowpubkey')} onAction={(entry) => void runAction('unallowpubkey', [entry.pubkey], 'Pubkey removed from allowlist', refreshPubkeys)} /></TabsContent></Tabs></CardContent></Card>
                  </TabsContent>

                  <TabsContent value="events" className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                    <Card><CardHeader><CardTitle>Event decision</CardTitle><CardDescription>Apply a moderation decision by event ID.</CardDescription></CardHeader><CardContent className="space-y-4">
                      <div className="space-y-2"><Label>Action</Label><Select value={eventAction} onValueChange={(value) => setEventAction(value as typeof eventAction)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="banevent" disabled={!supported.has('banevent')}>Ban event</SelectItem><SelectItem value="allowevent" disabled={!supported.has('allowevent')}>Allow event</SelectItem></SelectContent></Select></div>
                      <div className="space-y-2"><Label htmlFor="event-id">Event ID hex</Label><Input id="event-id" className="font-mono" maxLength={64} value={eventId} onChange={(event) => setEventId(event.target.value)} placeholder="64-character event ID" /></div>
                      <div className="space-y-2"><Label htmlFor="event-reason">Reason</Label><Input id="event-reason" value={eventReason} onChange={(event) => setEventReason(event.target.value)} placeholder="Optional operator note" /></div>
                      <Button className="w-full" disabled={!!busy || !supported.has(eventAction)} onClick={() => void submitEvent()}>{busy === eventAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Apply decision</Button>
                    </CardContent></Card>
                    <Card><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle>Moderation</CardTitle><CardDescription>Pending and banned relay events.</CardDescription></div><Button variant="outline" size="icon" disabled={!!busy} onClick={() => void refreshEvents()}><RefreshCw className="h-4 w-4" /></Button></CardHeader><CardContent><Tabs defaultValue="pending"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="pending">Pending ({moderationEvents.length})</TabsTrigger><TabsTrigger value="banned">Banned ({bannedEvents.length})</TabsTrigger></TabsList><TabsContent value="pending"><EntryList entries={moderationEvents} value={(entry) => entry.id} actionLabel="Allow" disabled={!supported.has('allowevent')} onAction={(entry) => void runAction('allowevent', [entry.id, 'Approved in relay console'], 'Event allowed', refreshEvents)} /></TabsContent><TabsContent value="banned"><EntryList entries={bannedEvents} value={(entry) => entry.id} actionLabel="Allow" disabled={!supported.has('allowevent')} onAction={(entry) => void runAction('allowevent', [entry.id, 'Reinstated in relay console'], 'Event allowed', refreshEvents)} /></TabsContent></Tabs></CardContent></Card>
                  </TabsContent>

                  <TabsContent value="kinds"><Card><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle>Allowed event kinds</CardTitle><CardDescription>Manage kind-level admission policy.</CardDescription></div><Button variant="outline" size="icon" disabled={!!busy || !supported.has('listallowedkinds')} onClick={() => void refreshKinds()}><RefreshCw className="h-4 w-4" /></Button></CardHeader><CardContent className="grid gap-6 lg:grid-cols-[320px_1fr]"><div className="space-y-3"><Label htmlFor="kind">Kind number</Label><Input id="kind" type="number" min="0" value={kind} onChange={(event) => setKind(event.target.value)} placeholder="e.g. 1" /><Button className="w-full" disabled={!!busy || !supported.has('allowkind')} onClick={() => { const number = Number(kind); if (!Number.isInteger(number) || number < 0) return setError('Enter a valid non-negative kind number.'); void runAction('allowkind', [number], 'Kind allowed', refreshKinds); setKind(''); }}><Tags className="mr-2 h-4 w-4" />Allow kind</Button></div><div className="flex min-h-32 flex-wrap content-start gap-2 rounded-md border p-4">{allowedKinds.length ? allowedKinds.sort((a, b) => a - b).map((item) => <Badge key={item} variant="secondary" className="h-8 gap-2 pl-3 font-mono">{item}<button aria-label={`Disallow kind ${item}`} disabled={!supported.has('disallowkind')} onClick={() => void runAction('disallowkind', [item], 'Kind disallowed', refreshKinds)} className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"><X className="h-3.5 w-3.5" /></button></Badge>) : <span className="m-auto text-sm text-muted-foreground">Refresh to load allowed kinds.</span>}</div></CardContent></Card></TabsContent>

                  <TabsContent value="network"><Card><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle>Blocked IP addresses</CardTitle><CardDescription>Maintain relay network deny rules.</CardDescription></div><Button variant="outline" size="icon" disabled={!!busy || !supported.has('listblockedips')} onClick={() => void refreshIps()}><RefreshCw className="h-4 w-4" /></Button></CardHeader><CardContent className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"><div className="space-y-4"><div className="space-y-2"><Label htmlFor="ip">IP address</Label><Input id="ip" value={ip} onChange={(event) => setIp(event.target.value)} placeholder="203.0.113.42" /></div><div className="space-y-2"><Label htmlFor="ip-reason">Reason</Label><Input id="ip-reason" value={ipReason} onChange={(event) => setIpReason(event.target.value)} placeholder="Optional operator note" /></div><Button className="w-full" disabled={!!busy || !supported.has('blockip') || !ip.trim()} onClick={() => { void runAction('blockip', [ip.trim(), ipReason.trim()], 'IP address blocked', refreshIps); setIp(''); setIpReason(''); }}><Ban className="mr-2 h-4 w-4" />Block address</Button></div><EntryList entries={blockedIps} value={(entry) => entry.ip} actionLabel="Unblock" disabled={!supported.has('unblockip')} onAction={(entry) => void runAction('unblockip', [entry.ip], 'IP address unblocked', refreshIps)} /></CardContent></Card></TabsContent>

                  <TabsContent value="settings" className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                    <Card><CardHeader><CardTitle>Relay identity</CardTitle><CardDescription>Each field is saved with its own NIP-86 method.</CardDescription></CardHeader><CardContent className="space-y-5">
                      <div className="space-y-2"><Label htmlFor="relay-name">Name</Label><div className="flex gap-2"><Input id="relay-name" value={relayName} onChange={(event) => setRelayName(event.target.value)} placeholder="My relay" /><Button disabled={!!busy || !relayName || !supported.has('changerelayname')} onClick={() => void runAction('changerelayname', [relayName], 'Relay name updated')}><Save className="mr-2 h-4 w-4" />Save</Button></div></div>
                      <div className="space-y-2"><Label htmlFor="relay-description">Description</Label><Textarea id="relay-description" value={relayDescription} onChange={(event) => setRelayDescription(event.target.value)} placeholder="What this relay is for" /><Button disabled={!!busy || !relayDescription || !supported.has('changerelaydescription')} onClick={() => void runAction('changerelaydescription', [relayDescription], 'Relay description updated')}><Save className="mr-2 h-4 w-4" />Save description</Button></div>
                      <div className="space-y-2"><Label htmlFor="relay-icon">Icon URL</Label><div className="flex gap-2"><Input id="relay-icon" type="url" value={relayIcon} onChange={(event) => setRelayIcon(event.target.value)} placeholder="https://example.com/icon.png" /><Button disabled={!!busy || !relayIcon || !supported.has('changerelayicon')} onClick={() => void runAction('changerelayicon', [relayIcon], 'Relay icon updated')}><Save className="mr-2 h-4 w-4" />Save</Button></div></div>
                    </CardContent></Card>
                    <Card><CardHeader><CardTitle>Capability report</CardTitle><CardDescription>Methods advertised by this relay.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{(['banpubkey','unbanpubkey','listbannedpubkeys','allowpubkey','unallowpubkey','listallowedpubkeys','listeventsneedingmoderation','allowevent','banevent','listbannedevents','changerelayname','changerelaydescription','changerelayicon','allowkind','disallowkind','listallowedkinds','blockip','unblockip','listblockedips'] as Nip86Method[]).map((method) => <MethodBadge key={method} method={method} supported={supported} />)}</CardContent></Card>
                  </TabsContent>
                </Tabs>
              </>
            )}

            <Alert className="bg-background"><Globe2 className="h-4 w-4" /><AlertTitle>Browser compatibility</AlertTitle><AlertDescription>NIP-86 is optional and draft. Relay operators must enable the API, authorize your Nostr key, and permit browser CORS requests from this site.</AlertDescription></Alert>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

export default RelayManagement;
