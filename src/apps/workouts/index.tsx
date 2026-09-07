import { useEffect, useState, type FormEvent } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Bike, Clock3, Flame, HeartPulse, Loader2, MapPinned, Mountain, Plus, RotateCw, Users } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { AuthorLine } from '@/components/nostr/AuthorLine';
import { LoginRequired } from '@/components/nostr/LoginRequired';
import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMyFollows } from '@/hooks/useFollows';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { formatDuration, isWorkout, parseWorkout, WORKOUT_KIND } from '@/lib/workouts';
import type { AppProps } from '@/os/types';

type Scope = 'public' | 'following';
type Activity = 'running' | 'cycling' | 'walking' | 'hiking' | 'swimming' | 'rowing' | 'strength' | 'yoga';

const activities: { value: Activity; label: string }[] = [
  { value: 'running', label: 'Running' }, { value: 'cycling', label: 'Cycling' },
  { value: 'walking', label: 'Walking' }, { value: 'hiking', label: 'Hiking' },
  { value: 'swimming', label: 'Swimming' }, { value: 'rowing', label: 'Rowing' },
  { value: 'strength', label: 'Strength' }, { value: 'yoga', label: 'Yoga' },
];

function useWorkouts(scope: Scope, authors: string[] | undefined, topic: string) {
  const { nostr } = useNostr();
  const canQuery = scope === 'public' || Boolean(authors?.length);
  return useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'workouts', scope, authors?.join(',') ?? '', topic],
    enabled: canQuery,
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{
        kinds: [WORKOUT_KIND],
        ...(scope === 'following' ? { authors } : {}),
        ...(topic ? { '#t': [topic] } : {}),
        since: Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60,
        limit: 80,
      }], { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });
      return events.filter(isWorkout).sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 30_000,
  });
}

export default function WorkoutsApp({ setTitle }: AppProps) {
  const { user } = useCurrentUser();
  const follows = useMyFollows();
  const [scope, setScope] = useState<Scope>('public');
  const [topic, setTopic] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const effectiveScope = user ? scope : 'public';
  const workouts = useWorkouts(effectiveScope, follows.data, topic.trim().replace(/^#/, '').toLowerCase());

  useEffect(() => setTitle('Workouts'), [setTitle]);

  return <AppLayout>
    <AppToolbar>
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Workout feed">
        <ScopeButton active={effectiveScope === 'public'} onClick={() => setScope('public')}>Public</ScopeButton>
        <ScopeButton active={effectiveScope === 'following'} onClick={() => setScope('following')} disabled={!user} title={!user ? 'Sign in to see accounts you follow' : undefined}><Users className="size-3.5" aria-hidden /> Following</ScopeButton>
      </div>
      <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setComposerOpen(true)} aria-label="Record a workout"><Plus className="size-4" aria-hidden /> <span className="hidden sm:inline">Record</span></Button>
    </AppToolbar>
    <AppBody>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <Input value={topic} onChange={(event) => setTopic(event.target.value.replace(/^#/, ''))} aria-label="Filter workouts by topic" placeholder="Filter #topic" className="h-8 max-w-52 text-sm" />
        {workouts.isFetching && <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" aria-label="Loading workouts" />}
      </div>
      {effectiveScope === 'following' && follows.isLoading ? <WorkoutSkeleton /> : effectiveScope === 'following' && !follows.data?.length ? (
        <EmptyState title="Your follow list is empty" hint="Follow a few Nostr accounts, then their workouts will appear here." />
      ) : workouts.isLoading ? <WorkoutSkeleton /> : workouts.isError ? (
        <EmptyState title="Couldn’t load workouts" hint="Your relays could not complete this request." action={<Button size="sm" onClick={() => workouts.refetch()}><RotateCw className="size-3.5" aria-hidden /> Try again</Button>} />
      ) : workouts.data?.length ? <div className="mx-auto max-w-3xl space-y-3 p-3">{workouts.data.map((event) => <WorkoutCard key={event.id} event={event} />)}</div> : (
        <EmptyState title={effectiveScope === 'following' ? 'No workouts from people you follow' : 'No workouts found'} hint={topic ? 'Try a different topic or clear the filter.' : 'Your relays have not returned any recent workout records.'} />
      )}
    </AppBody>
    <WorkoutDialog open={composerOpen} onOpenChange={setComposerOpen} onPublished={() => void workouts.refetch()} />
  </AppLayout>;
}

function ScopeButton({ active, children, ...props }: React.ComponentProps<typeof Button> & { active: boolean }) {
  return <Button type="button" variant="ghost" size="sm" role="tab" aria-selected={active} className={cn('h-7 flex-1 gap-1.5 text-xs', active && 'bg-background shadow-sm')} {...props}>{children}</Button>;
}

function WorkoutCard({ event }: { event: NostrEvent }) {
  const workout = parseWorkout(event);
  if (!workout) return null;
  const date = workout.startedAt ? new Date(workout.startedAt * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : undefined;
  const metrics = [
    workout.duration !== undefined && { icon: Clock3, text: formatDuration(workout.duration) },
    workout.distance && { icon: MapPinned, text: `${workout.distance.value} ${workout.distance.unit}` },
    workout.elevationGain && { icon: Mountain, text: `${workout.elevationGain.value} ${workout.elevationGain.unit}` },
    workout.calories !== undefined && { icon: Flame, text: `${workout.calories} kcal` },
    workout.averageHeartRate !== undefined && { icon: HeartPulse, text: `${workout.averageHeartRate} bpm avg` },
  ].filter(Boolean) as { icon: typeof Clock3; text: string }[];
  return <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
    <div className="flex gap-3 border-b border-border/70 bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent p-4">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"><Bike className="size-5" aria-hidden /></div>
      <div className="min-w-0 flex-1"><AuthorLine pubkey={event.pubkey} createdAt={event.created_at} size="sm" /><p className="mt-2 text-lg font-semibold capitalize tracking-tight">{workout.activity}</p>{date && <p className="text-xs text-muted-foreground">{date}</p>}</div>
    </div>
    <div className="p-4">
      {event.content.trim() && <p className="mb-3 whitespace-pre-wrap text-sm leading-6">{event.content}</p>}
      {metrics.length > 0 && <div className="flex flex-wrap gap-2">{metrics.map(({ icon: Icon, text }) => <span key={text} className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium"><Icon className="size-3.5 text-muted-foreground" aria-hidden />{text}</span>)}</div>}
      {(workout.maximumHeartRate !== undefined || workout.cadence !== undefined || workout.source || workout.topics.length > 0) && <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {workout.maximumHeartRate !== undefined && <span>Max {workout.maximumHeartRate} bpm</span>}{workout.cadence !== undefined && <span>{workout.cadence} rpm</span>}{workout.source && <span>via {workout.source}</span>}{workout.topics.map((topic) => <span key={topic}>#{topic}</span>)}
      </div>}
    </div>
  </article>;
}

interface WorkoutForm { activity: Activity; start: string; end: string; durationMinutes: string; distance: string; distanceUnit: 'km' | 'mi' | 'm'; elevation: string; calories: string; averageHeartRate: string; maximumHeartRate: string; cadence: string; caption: string; source: string; topics: string; }
const emptyForm: WorkoutForm = { activity: 'running', start: '', end: '', durationMinutes: '', distance: '', distanceUnit: 'km', elevation: '', calories: '', averageHeartRate: '', maximumHeartRate: '', cadence: '', caption: '', source: 'manual', topics: '' };

function WorkoutDialog({ open, onOpenChange, onPublished }: { open: boolean; onOpenChange: (open: boolean) => void; onPublished: () => void }) {
  const { user } = useCurrentUser();
  const publish = useNostrPublish();
  const { toast } = useToast();
  const [form, setForm] = useState<WorkoutForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof WorkoutForm>(key: K, value: WorkoutForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    const start = form.start ? Math.floor(new Date(form.start).getTime() / 1000) : undefined;
    const end = form.end ? Math.floor(new Date(form.end).getTime() / 1000) : undefined;
    const duration = form.durationMinutes ? Number(form.durationMinutes) * 60 : end && start ? end - start : undefined;
    const inRange = (value: string, maximum: number) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= maximum);
    if ((form.start && !start) || (form.end && !end) || (start && end && end <= start) || !duration || duration <= 0 || !inRange(form.distance, 100000) || !inRange(form.elevation, 30000) || !inRange(form.calories, 100000) || !inRange(form.averageHeartRate, 300) || !inRange(form.maximumHeartRate, 300) || !inRange(form.cadence, 300)) { setError('Enter a valid duration or start and end time. Check that metric values are in a realistic range.'); return; }
    if (form.maximumHeartRate && form.averageHeartRate && Number(form.maximumHeartRate) < Number(form.averageHeartRate)) { setError('Maximum heart rate cannot be lower than average heart rate.'); return; }
    const numberTag = (name: string, value: string) => value === '' ? [] : [[name, String(Number(value))]];
    const topics = [...new Set(form.topics.split(/[\s,]+/).map((topic) => topic.replace(/^#/, '').toLowerCase()).filter((topic) => /^[a-z0-9][a-z0-9-_]{0,63}$/.test(topic)))];
    const activityLabel = activities.find((activity) => activity.value === form.activity)?.label ?? form.activity;
    const tags: string[][] = [
      ['exercise', form.activity], ['duration', formatDuration(duration)], ...(start ? [['workout_start_time', String(start)]] : []), ...(end ? [['end', String(end)]] : []),
      ...(form.distance ? [['distance', String(Number(form.distance)), form.distanceUnit]] : []), ...(form.elevation ? [['elevation_gain', String(Number(form.elevation)), 'm']] : []),
      ...numberTag('calories', form.calories), ...numberTag('avg_heart_rate', form.averageHeartRate), ...numberTag('max_heart_rate', form.maximumHeartRate), ...numberTag('cadence', form.cadence),
      ...(form.source.trim() ? [['source', form.source.trim().slice(0, 100)]] : []), ...topics.map((topic) => ['t', topic]), ['alt', `${activityLabel} workout, ${formatDuration(duration)}${form.distance ? `, ${form.distance} ${form.distanceUnit}` : ''}`],
    ];
    try { await publish.mutateAsync({ kind: WORKOUT_KIND, content: form.caption.trim(), tags }); setForm(emptyForm); onOpenChange(false); onPublished(); toast({ title: 'Workout published' }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Publishing failed. Your workout is still here to retry.'); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Record a workout</DialogTitle><DialogDescription>Publish a manual, interoperable Nostr workout. No device or GPS data is claimed.</DialogDescription></DialogHeader>{!user ? <LoginRequired action="record a workout" /> : <form className="space-y-4" onSubmit={(event) => void submit(event)}>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Activity"><Select value={form.activity} onValueChange={(value) => set('activity', value as Activity)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{activities.map((activity) => <SelectItem key={activity.value} value={activity.value}>{activity.label}</SelectItem>)}</SelectContent></Select></Field><Field label="Duration (minutes)"><Input type="number" min="1" step="1" inputMode="numeric" value={form.durationMinutes} onChange={(event) => set('durationMinutes', event.target.value)} placeholder="45" /></Field></div>
    <p className="-mt-2 text-xs text-muted-foreground">Or supply both start and end time; duration is calculated automatically.</p>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Start time"><Input type="datetime-local" value={form.start} onChange={(event) => set('start', event.target.value)} /></Field><Field label="End time"><Input type="datetime-local" value={form.end} onChange={(event) => set('end', event.target.value)} /></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Distance"><div className="flex gap-2"><Input type="number" min="0" step="0.01" inputMode="decimal" value={form.distance} onChange={(event) => set('distance', event.target.value)} placeholder="5" /><Select value={form.distanceUnit} onValueChange={(value) => set('distanceUnit', value as WorkoutForm['distanceUnit'])}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="km">km</SelectItem><SelectItem value="mi">mi</SelectItem><SelectItem value="m">m</SelectItem></SelectContent></Select></div></Field><Field label="Elevation gain (m)"><Input type="number" min="0" step="1" inputMode="numeric" value={form.elevation} onChange={(event) => set('elevation', event.target.value)} /></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Calories (kcal)"><Input type="number" min="0" step="1" inputMode="numeric" value={form.calories} onChange={(event) => set('calories', event.target.value)} /></Field><Field label="Cadence (rpm)"><Input type="number" min="0" step="1" inputMode="numeric" value={form.cadence} onChange={(event) => set('cadence', event.target.value)} /></Field><Field label="Average heart rate (bpm)"><Input type="number" min="0" step="1" inputMode="numeric" value={form.averageHeartRate} onChange={(event) => set('averageHeartRate', event.target.value)} /></Field><Field label="Maximum heart rate (bpm)"><Input type="number" min="0" step="1" inputMode="numeric" value={form.maximumHeartRate} onChange={(event) => set('maximumHeartRate', event.target.value)} /></Field></div>
    <Field label="Caption"><Textarea value={form.caption} onChange={(event) => set('caption', event.target.value)} maxLength={2000} placeholder="How did it feel? (optional)" /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Source"><Input value={form.source} onChange={(event) => set('source', event.target.value)} maxLength={100} placeholder="manual" /></Field><Field label="Topics"><Input value={form.topics} onChange={(event) => set('topics', event.target.value)} placeholder="training, weekend" /></Field></div>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={publish.isPending}>Cancel</Button><Button type="submit" disabled={publish.isPending}>{publish.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />} {publish.isPending ? 'Publishing…' : 'Publish workout'}</Button></div>
  </form>}</DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function WorkoutSkeleton() { return <div className="mx-auto max-w-3xl space-y-3 p-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="space-y-3 rounded-xl border border-border p-4"><Skeleton className="h-9 w-40" /><Skeleton className="h-6 w-28" /><div className="flex gap-2"><Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-20" /></div></div>)}</div>; }
