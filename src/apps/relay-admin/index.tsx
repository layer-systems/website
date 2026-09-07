import { useEffect } from 'react';
import {
  CircleCheck,
  KeyRound,
  Loader2,
  Plug,
  ShieldCheck,
  TriangleAlert,
  Unplug,
} from 'lucide-react';

import { AppBody, AppLayout, AppToolbar, EmptyState } from '@/components/os/AppChrome';
import { LoginArea } from '@/components/auth/LoginArea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useNip86Connection,
  usePolicyMode,
  type Nip86Session,
  type PolicyMode,
} from '@/hooks/useNip86';
import { Nip86Error, relayWsUrl } from '@/lib/nip86';
import { sanitizeUrl } from '@/lib/nostrUtils';
import { cn } from '@/lib/utils';
import type { AppProps } from '@/os/types';
import { AuditSection } from './AuditSection';
import { EventModerationSection } from './ModerationSection';
import {
  AllowedKindsSection,
  AllowedPubkeysSection,
  BannedPubkeysSection,
  BlockedIpsSection,
} from './PolicySections';
import { RelayPresentationSection } from './RelaySection';
import { RolesSection } from './RolesSection';
import { ExtensionsSection } from './ExtensionsSection';

/**
 * Relay Admin — a NIP-86 management console.
 *
 * NIP-86 is a draft, optional HTTP(S) API, so the entire console is driven by
 * discovery: connect, authorize with NIP-98, call `supportedmethods`, and only
 * render what the relay actually advertised. Nothing is attempted optimistically.
 */
export default function RelayAdminApp({ params, setTitle, setParams }: AppProps) {
  const { user } = useCurrentUser();
  const connection = useNip86Connection();
  const { session, isConnecting, error } = connection;

  // The connected relay is part of the window's deep link, so a reload (or
  // the desktop ↔ mobile shell switch) restores the view. The audit log and
  // discovery intentionally are not restored: reconnecting re-runs them.
  useEffect(() => {
    if (session && params.relay !== session.url) {
      setParams({ relay: session.url });
    }
  }, [session, params.relay, setParams]);

  useEffect(() => {
    const name = session?.info?.name?.trim();
    setTitle(session ? `Relay Admin — ${name || session.url.replace(/^https?:\/\//, '')}` : 'Relay Admin');
  }, [session, setTitle]);

  return (
    <AppLayout>
      <AppToolbar>
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 truncate text-[13px] font-medium">
          {session ? session.url.replace(/^https?:\/\//, '') : 'Relay Admin'}
        </span>
        {session && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1.5 px-2 text-xs"
            onClick={connection.disconnect}
          >
            <Unplug className="size-3.5" aria-hidden />
            Disconnect
          </Button>
        )}
      </AppToolbar>

      <AppBody>
        {!session ? (
          <ConnectView
            initialUrl={params.relay}
            connecting={isConnecting}
            error={error}
            signedIn={Boolean(user)}
            onConnect={connection.connect}
          />
        ) : (
          <Console session={session} connection={connection} />
        )}
      </AppBody>
    </AppLayout>
  );
}

/* --------------------------------------------------------------------------
 * Connect view: URL normalization, auth state, discovery result.
 * ------------------------------------------------------------------------ */

function ConnectView({
  initialUrl,
  connecting,
  error,
  signedIn,
  onConnect,
}: {
  initialUrl?: string;
  connecting: boolean;
  error: Nip86Error | undefined;
  signedIn: boolean;
  onConnect: (input: string) => Promise<void>;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center gap-4 p-6">
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-semibold tracking-tight">Manage a relay</h2>
        <p className="text-sm text-muted-foreground">
          Connect to a relay that speaks NIP-86 — the draft, optional relay management API — with
          the key that administers it.
        </p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = (new FormData(event.currentTarget).get('relay') ?? '').toString();
          void onConnect(value);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="relay-url">Relay URL</Label>
          <Input
            id="relay-url"
            name="relay"
            defaultValue={initialUrl}
            placeholder="wss://relay.example.com"
            className="font-mono text-xs"
            autoFocus
            required
          />
        </div>

        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
            signedIn ? 'border-border' : 'border-dashed border-border text-muted-foreground',
          )}
          role="status"
        >
          <KeyRound className="size-4 shrink-0" aria-hidden />
          {signedIn ? (
            <span>
              Signed in — requests will be authorized with your key via NIP-98. Your key never
              leaves your signer.
            </span>
          ) : (
            <span className="flex-1">Sign in with the relay operator key to authorize requests.</span>
          )}
          {!signedIn && <LoginArea />}
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
            role="alert"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-destructive">{errorTitle(error)}</p>
              <p className="text-muted-foreground">{error.message}</p>
            </div>
          </div>
        )}

        <Button type="submit" className="w-full gap-1.5" disabled={connecting || !signedIn}>
          {connecting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plug className="size-4" aria-hidden />
          )}
          {connecting ? 'Discovering capabilities…' : 'Connect'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Discovery asks the relay which management methods it supports and renders only those.
        </p>
      </form>
    </div>
  );
}

function errorTitle(error: Nip86Error): string {
  switch (error.code) {
    case 'invalid-url':
      return 'Check the relay URL';
    case 'unreachable':
      return 'Relay unreachable';
    case 'unauthorized':
      return 'Not authorized';
    case 'forbidden':
      return 'Operation forbidden';
    case 'malformed':
      return 'No NIP-86 support';
    case 'not-logged-in':
      return 'Sign-in required';
    default:
      return 'Discovery failed';
  }
}

/* --------------------------------------------------------------------------
 * The console: identity, policy mode, capability summary, sections.
 * ------------------------------------------------------------------------ */

const POLICY_MODE: Record<PolicyMode, { label: string; tone: string; explanation: string }> = {
  blocklist: {
    label: 'Blocklist-led',
    tone: 'border-warning/50 bg-warning/10 text-warning-foreground',
    explanation:
      'This relay advertises ban lists (pubkeys, IPs, events): a reactive, public-relay operating model. A blocklist is never exhaustive — it is not a permission system.',
  },
  allowlist: {
    label: 'Allowlist-led',
    tone: 'border-primary/50 bg-primary/10 text-primary',
    explanation:
      'This relay advertises allowlists (pubkeys, kinds): a restrictive, private-relay operating model. Only the relay’s own enforcement decides what being on the list means — an allowlist alone does not make a relay private.',
  },
  unknown: {
    label: 'Policy mode unknown',
    tone: 'border-border bg-muted text-muted-foreground',
    explanation:
      'The advertised methods do not clearly favor a blocklist or allowlist model. Check the relay’s documentation for how it enforces policy.',
  },
};

function Console({
  session,
  connection,
}: {
  session: Nip86Session;
  connection: ReturnType<typeof useNip86Connection>;
}) {
  const mode = usePolicyMode(session.methods);
  const modeInfo = POLICY_MODE[mode];
  const icon = session.info?.icon ? sanitizeUrl(session.info.icon) : undefined;

  const has = (method: string) => session.methods.includes(method);
  const hasAny = (...methods: string[]) => methods.some((method) => has(method));

  const rolesAdvertised = hasAny('createrole', 'editrole', 'deleterole', 'assignrole', 'unassignrole');
  const presentationAdvertised = hasAny('changerelayname', 'changerelaydescription', 'changerelayicon');

  // Standard methods that produce no console section (supportedmethods itself
  // and `stat`, which predates NIP-86 and carries no policy data).
  const SECTION_METHODS = new Set([
    'listbannedpubkeys', 'banpubkey', 'unbanpubkey',
    'listallowedpubkeys', 'allowpubkey', 'unallowpubkey',
    'listblockedips', 'blockip', 'unblockip',
    'listallowedkinds', 'allowkind', 'disallowkind',
    'listeventsneedingmoderation', 'allowevent', 'banevent', 'listbannedevents',
    'createrole', 'editrole', 'deleterole', 'assignrole', 'unassignrole',
    'changerelayname', 'changerelaydescription', 'changerelayicon',
  ]);
  const uncovered = session.methods.filter(
    (method) => !SECTION_METHODS.has(method) && method !== 'supportedmethods' && method !== 'stat',
  );

  const anySection =
    has('listbannedpubkeys') ||
    has('listallowedpubkeys') ||
    has('listblockedips') ||
    has('listallowedkinds') ||
    hasAny('listeventsneedingmoderation', 'listbannedevents') ||
    rolesAdvertised ||
    presentationAdvertised;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-4">
      {/* Identity + capability summary */}
      <section className="rounded-lg border border-border p-3">
        <div className="flex items-start gap-3">
          {icon ? (
            <img src={icon} alt="" className="size-10 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
              <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {session.info?.name?.trim() || relayWsUrl(session.url).replace(/^wss?:\/\//, '')}
            </p>
            {session.info?.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {session.info.description}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {session.info?.software && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {session.info.software.replace(/^https?:\/\//, '').split('/').pop()}
                  {session.info.version ? ` ${session.info.version}` : ''}
                </Badge>
              )}
              <Badge variant="outline" className="gap-1 text-[10px]">
                <CircleCheck className="size-3 text-success" aria-hidden />
                NIP-98 authorized
              </Badge>
              <span className="tabular-nums">
                {session.methods.length} standard · {session.extensions.length} extension
                {session.extensions.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        <Separator className="my-3" />

        <div className={cn('rounded-md border px-2.5 py-2', modeInfo.tone)}>
          <p className="text-xs font-semibold">{modeInfo.label}</p>
          <p className="text-xs opacity-90">{modeInfo.explanation}</p>
        </div>

        {uncovered.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Advertised but without a console UI:{' '}
            <span className="font-mono">{uncovered.join(', ')}</span> — shown for completeness, not
            called.
          </p>
        )}
      </section>

      {!anySection && session.extensions.length === 0 && (
        <EmptyState
          title="Nothing to manage"
          hint="This relay speaks NIP-86 but advertises no manageable methods to your key — or only discovery itself. If you expected more, check that you are signed in with an operator key."
        />
      )}

      {/* Capability-driven sections — each renders only what was advertised. */}
      {has('listbannedpubkeys') && <BannedPubkeysSection session={session} onResult={connection.record} />}
      {has('listallowedpubkeys') && <AllowedPubkeysSection session={session} onResult={connection.record} />}
      {has('listblockedips') && <BlockedIpsSection session={session} onResult={connection.record} />}
      {has('listallowedkinds') && <AllowedKindsSection session={session} onResult={connection.record} />}
      {hasAny('listeventsneedingmoderation', 'listbannedevents') && (
        <EventModerationSection session={session} onResult={connection.record} />
      )}
      {rolesAdvertised && <RolesSection session={session} onResult={connection.record} />}
      {presentationAdvertised && <RelayPresentationSection session={session} onResult={connection.record} />}
      {session.extensions.length > 0 && (
        <ExtensionsSection session={session} onResult={connection.record} />
      )}

      <AuditSection audit={connection.audit} onClear={connection.clearAudit} />
    </div>
  );
}
