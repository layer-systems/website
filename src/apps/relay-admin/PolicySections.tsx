import { useState, type ReactNode } from 'react';
import { Loader2, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useAllowedKinds,
  useAllowedPubkeys,
  useBannedPubkeys,
  useBlockedIps,
  useNip86Mutation,
  type Nip86Session,
} from '@/hooks/useNip86';
import { useToast } from '@/hooks/useToast';
import {
  parseKindInput,
  parsePubkeyInput,
  validateIpInput,
  validateReason,
  type BannedPubkey,
  type BlockedIp,
  type Nip86CoreMethod,
} from '@/lib/nip86';
import {
  ConfirmAction,
  Field,
  FormDialog,
  type PendingConfirm,
} from './dialogs';
import { useFilter } from './useFilter';
import {
  IdText,
  ListEmpty,
  ListError,
  ListSkeleton,
  RowAction,
  Section,
  SectionToolbar,
} from './shared';

/**
 * The policy sections: banned/allowed pubkeys, blocked IPs and allowed kinds.
 * Each section renders only when the relay advertised the matching list
 * method (the app shell gates them), and mutations only reference methods the
 * relay advertised — an advertised `listbannedpubkeys` without `banpubkey`
 * yields a read-only list, never a silently attempted call.
 */

interface AddFormState {
  value: string;
  reason: string;
  error?: string;
}

function usePolicyMutation(
  session: Nip86Session,
  onResult: (entry: { method: string; target: string; status: 'ok' | 'failed' | 'cancelled'; detail?: string }) => void,
) {
  const { toast } = useToast();
  const mutation = useNip86Mutation(session, { onResult });

  const run = async (input: {
    method: Nip86CoreMethod;
    params: unknown[];
    refresh: Parameters<typeof mutation.mutateAsync>[0]['refresh'];
    success: string;
  }) => {
    try {
      await mutation.mutateAsync({ method: input.method, params: input.params, refresh: input.refresh });
      toast({ title: input.success });
    } catch (error) {
      toast({
        title: 'The relay refused the operation',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
      // The audit entry is written by the mutation hook either way; rethrow so
      // the caller can keep its dialog open on failure.
      throw error;
    }
  };

  return { run, isPending: mutation.isPending };
}

function ReasonInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const error = validateReason(value);
  return (
    <Field id={id} label="Reason (optional)" error={value ? error : undefined} hint="Stored by the relay and shown to other operators.">
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(value && error)}
        aria-describedby={value && error ? `${id}-error` : undefined}
        className="text-sm"
      />
    </Field>
  );
}

function AddDialog({
  open,
  onOpenChange,
  title,
  description,
  idPrefix,
  valueLabel,
  valueHint,
  valuePlaceholder,
  validate,
  withReason,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  idPrefix: string;
  valueLabel: string;
  valueHint: string;
  valuePlaceholder: string;
  validate: (value: string) => string | undefined;
  withReason?: boolean;
  pending: boolean;
  onSubmit: (value: string, reason: string) => Promise<void>;
}) {
  const [form, setForm] = useState<AddFormState>({ value: '', reason: '' });

  const close = (next: boolean) => {
    if (!next) setForm({ value: '', reason: '' });
    onOpenChange(next);
  };

  const submit = async () => {
    const error = validate(form.value);
    if (error) {
      setForm((current) => ({ ...current, error }));
      return;
    }
    await onSubmit(form.value.trim(), form.reason);
    close(false);
  };

  return (
    <FormDialog open={open} onOpenChange={close} title={title} description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !form.value.trim() || Boolean(validateReason(form.reason))}
          >
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {title}
          </Button>
        </>
      }
    >
      <Field
        id={`${idPrefix}-value`}
        label={valueLabel}
        error={form.error}
        hint={form.error ? undefined : valueHint}
      >
        <Input
          id={`${idPrefix}-value`}
          value={form.value}
          onChange={(event) => setForm((current) => ({ ...current, value: event.target.value, error: undefined }))}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          placeholder={valuePlaceholder}
          aria-invalid={Boolean(form.error)}
          aria-describedby={form.error ? `${idPrefix}-value-error` : undefined}
          className="font-mono text-xs"
          autoFocus
        />
      </Field>
      {withReason !== false && (
        <ReasonInput
          id={`${idPrefix}-reason`}
          value={form.reason}
          onChange={(reason) => setForm((current) => ({ ...current, reason }))}
        />
      )}
    </FormDialog>
  );
}

function PolicyRow({
  id,
  reason,
  reasonLabel,
  actions,
}: {
  id: string;
  reason?: string;
  reasonLabel: string;
  actions: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <IdText value={id} />
        {reason ? (
          <p className="truncate text-xs text-muted-foreground" title={reason}>
            {reasonLabel}: {reason}
          </p>
        ) : null}
      </div>
      {actions}
    </li>
  );
}

/* --------------------------------------------------------------------------
 * Banned pubkeys (public-relay blocklist side)
 * ------------------------------------------------------------------------ */

export function BannedPubkeysSection({
  session,
  onResult,
}: {
  session: Nip86Session;
  onResult: (entry: { method: string; target: string; status: 'ok' | 'failed' | 'cancelled'; detail?: string }) => void;
}) {
  const list = useBannedPubkeys(session, { onResult });
  const { run, isPending } = usePolicyMutation(session, onResult);
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | undefined>(undefined);
  const { search, setSearch, filtered } = useFilter(list.data, (entry) => [entry.pubkey, entry.reason]);

  const canBan = session.methods.includes('banpubkey');
  const canUnban = session.methods.includes('unbanpubkey');

  return (
    <Section
      title="Banned pubkeys"
      description="Keys this relay refuses to serve or accept events from. A blocklist is reactive — it is not an exhaustive statement of who may use the relay."
      actions={
        canBan ? (
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            Ban
          </Button>
        ) : undefined
      }
    >
      <SectionToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Filter by pubkey or reason"
        count={filtered?.length}
        onRefresh={() => list.refetch()}
        refreshing={list.isFetching}
      />
      {list.isLoading ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ListError error={list.error} onRetry={() => list.refetch()} />
      ) : !filtered || filtered.length === 0 ? (
        <ListEmpty
          title={search ? 'No matches' : 'No banned pubkeys'}
          hint={search ? 'Nothing on this list matches the filter.' : 'The relay reports an empty ban list.'}
        />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {filtered.map((entry: BannedPubkey) => (
            <PolicyRow
              key={entry.pubkey}
              id={entry.pubkey}
              reason={entry.reason}
              reasonLabel="Reason"
              actions={
                canUnban ? (
                  <RowAction
                    label="Unban"
                    pending={isPending}
                    onClick={() =>
                      setConfirm({
                        title: 'Unban this pubkey?',
                        target: entry.pubkey,
                        effect:
                          'The relay will accept and serve this key’s events again, subject to its other rules.',
                        reversible: 'Reversible: you can ban the key again.',
                        actionLabel: 'Unban',
                        run: () =>
                          run({
                            method: 'unbanpubkey',
                            params: [entry.pubkey],
                            refresh: ['listbannedpubkeys'],
                            success: 'Pubkey unbanned',
                          }),
                      })
                    }
                  />
                ) : (
                  <Badge variant="outline" className="text-[10px]">read-only</Badge>
                )
              }
            />
          ))}
        </ul>
      )}

      <AddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Ban pubkey"
        description="Banning a key stops this relay from accepting or serving its events. You can reverse it with Unban."
        idPrefix="ban-pubkey"
        valueLabel="Public key"
        valueHint="64 hex characters, or an npub1… / nprofile1… identifier."
        valuePlaceholder="npub1…"
        pending={isPending}
        validate={(value) => {
          const parsed = parsePubkeyInput(value);
          return typeof parsed === 'string' ? undefined : parsed.error;
        }}
        onSubmit={async (value, reason) => {
          const parsed = parsePubkeyInput(value);
          if (typeof parsed !== 'string') return;
          await run({
            method: 'banpubkey',
            params: reason.trim() ? [parsed, reason.trim()] : [parsed],
            refresh: ['listbannedpubkeys'],
            success: 'Pubkey banned',
          });
        }}
      />
      <ConfirmAction pending={confirm} onClose={() => setConfirm(undefined)} />
    </Section>
  );
}

/* --------------------------------------------------------------------------
 * Allowed pubkeys (private-relay allowlist side)
 * ------------------------------------------------------------------------ */

export function AllowedPubkeysSection({
  session,
  onResult,
}: {
  session: Nip86Session;
  onResult: (entry: { method: string; target: string; status: 'ok' | 'failed' | 'cancelled'; detail?: string }) => void;
}) {
  const list = useAllowedPubkeys(session, { onResult });
  const { run, isPending } = usePolicyMutation(session, onResult);
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | undefined>(undefined);
  const { search, setSearch, filtered } = useFilter(list.data, (entry) => [entry.pubkey, entry.reason]);

  const canAllow = session.methods.includes('allowpubkey');
  const canUnallow = session.methods.includes('unallowpubkey');

  return (
    <Section
      title="Allowed pubkeys"
      description="Keys on this relay’s allowlist. Whether an allowlist restricts everyone else is decided by the relay’s own enforcement — an allowlist alone does not make a relay private."
      actions={
        canAllow ? (
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            Allow
          </Button>
        ) : undefined
      }
    >
      <SectionToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Filter by pubkey or reason"
        count={filtered?.length}
        onRefresh={() => list.refetch()}
        refreshing={list.isFetching}
      />
      {list.isLoading ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ListError error={list.error} onRetry={() => list.refetch()} />
      ) : !filtered || filtered.length === 0 ? (
        <ListEmpty
          title={search ? 'No matches' : 'No allowed pubkeys'}
          hint={
            search
              ? 'Nothing on this list matches the filter.'
              : 'The relay reports an empty allowlist. Depending on its configuration, that may mean no restriction at all.'
          }
        />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {filtered.map((entry: BannedPubkey) => (
            <PolicyRow
              key={entry.pubkey}
              id={entry.pubkey}
              reason={entry.reason}
              reasonLabel="Note"
              actions={
                canUnallow ? (
                  <RowAction
                    label="Remove"
                    destructive
                    pending={isPending}
                    onClick={() =>
                      setConfirm({
                        title: 'Remove this pubkey from the allowlist?',
                        target: entry.pubkey,
                        effect:
                          'If this relay enforces its allowlist, the key immediately loses access. Check the relay’s documentation for its exact enforcement semantics.',
                        reversible: 'Reversible: you can allow the key again.',
                        actionLabel: 'Remove access',
                        run: () =>
                          run({
                            method: 'unallowpubkey',
                            params: [entry.pubkey],
                            refresh: ['listallowedpubkeys'],
                            success: 'Pubkey removed from the allowlist',
                          }),
                      })
                    }
                  />
                ) : (
                  <Badge variant="outline" className="text-[10px]">read-only</Badge>
                )
              }
            />
          ))}
        </ul>
      )}

      <AddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Allow pubkey"
        description="Add a key to this relay’s allowlist. The relay decides what being allowed means."
        idPrefix="allow-pubkey"
        valueLabel="Public key"
        valueHint="64 hex characters, or an npub1… / nprofile1… identifier."
        valuePlaceholder="npub1…"
        pending={isPending}
        validate={(value) => {
          const parsed = parsePubkeyInput(value);
          return typeof parsed === 'string' ? undefined : parsed.error;
        }}
        onSubmit={async (value, reason) => {
          const parsed = parsePubkeyInput(value);
          if (typeof parsed !== 'string') return;
          await run({
            method: 'allowpubkey',
            params: reason.trim() ? [parsed, reason.trim()] : [parsed],
            refresh: ['listallowedpubkeys'],
            success: 'Pubkey allowed',
          });
        }}
      />
      <ConfirmAction pending={confirm} onClose={() => setConfirm(undefined)} />
    </Section>
  );
}

/* --------------------------------------------------------------------------
 * Blocked IPs
 * ------------------------------------------------------------------------ */

export function BlockedIpsSection({
  session,
  onResult,
}: {
  session: Nip86Session;
  onResult: (entry: { method: string; target: string; status: 'ok' | 'failed' | 'cancelled'; detail?: string }) => void;
}) {
  const list = useBlockedIps(session, { onResult });
  const { run, isPending } = usePolicyMutation(session, onResult);
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | undefined>(undefined);
  const { search, setSearch, filtered } = useFilter(list.data, (entry) => [entry.ip, entry.reason]);

  const canBlock = session.methods.includes('blockip');
  const canUnblock = session.methods.includes('unblockip');

  return (
    <Section
      title="Blocked IPs"
      description="Addresses or CIDR ranges the relay refuses connections from. Whether ranges are accepted depends on the relay — check its documentation."
      actions={
        canBlock ? (
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            Block
          </Button>
        ) : undefined
      }
    >
      <SectionToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Filter by address or reason"
        count={filtered?.length}
        onRefresh={() => list.refetch()}
        refreshing={list.isFetching}
      />
      {list.isLoading ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ListError error={list.error} onRetry={() => list.refetch()} />
      ) : !filtered || filtered.length === 0 ? (
        <ListEmpty
          title={search ? 'No matches' : 'No blocked IPs'}
          hint={search ? 'Nothing on this list matches the filter.' : 'The relay reports no blocked addresses.'}
        />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {filtered.map((entry: BlockedIp) => (
            <PolicyRow
              key={entry.ip}
              id={entry.ip}
              reason={entry.reason}
              reasonLabel="Reason"
              actions={
                canUnblock ? (
                  <RowAction
                    label="Unblock"
                    pending={isPending}
                    onClick={() =>
                      setConfirm({
                        title: 'Unblock this address?',
                        target: entry.ip,
                        effect: 'The relay will accept connections from this address again.',
                        reversible: 'Reversible: you can block the address again.',
                        actionLabel: 'Unblock',
                        run: () =>
                          run({
                            method: 'unblockip',
                            params: [entry.ip],
                            refresh: ['listblockedips'],
                            success: 'Address unblocked',
                          }),
                      })
                    }
                  />
                ) : (
                  <Badge variant="outline" className="text-[10px]">read-only</Badge>
                )
              }
            />
          ))}
        </ul>
      )}

      <AddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Block IP"
        description="Block one address or a whole range. Everyone behind the address — including innocent users sharing it — loses access."
        idPrefix="block-ip"
        valueLabel="IP address or CIDR range"
        valueHint="e.g. 203.0.113.7 or 203.0.113.0/24. Check the relay’s documentation for what it accepts."
        valuePlaceholder="203.0.113.7"
        pending={isPending}
        validate={(value) => validateIpInput(value)}
        onSubmit={async (value, reason) => {
          await run({
            method: 'blockip',
            params: reason.trim() ? [value, reason.trim()] : [value],
            refresh: ['listblockedips'],
            success: 'Address blocked',
          });
        }}
      />
      <ConfirmAction pending={confirm} onClose={() => setConfirm(undefined)} />
    </Section>
  );
}

/* --------------------------------------------------------------------------
 * Allowed kinds
 * ------------------------------------------------------------------------ */

export function AllowedKindsSection({
  session,
  onResult,
}: {
  session: Nip86Session;
  onResult: (entry: { method: string; target: string; status: 'ok' | 'failed' | 'cancelled'; detail?: string }) => void;
}) {
  const list = useAllowedKinds(session, { onResult });
  const { run, isPending } = usePolicyMutation(session, onResult);
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | undefined>(undefined);
  const { search, setSearch, filtered } = useFilter(list.data?.map((kind) => ({ kind })), (entry) => [
    String(entry.kind),
  ]);

  const canAllow = session.methods.includes('allowkind');
  const canDisallow = session.methods.includes('disallowkind');

  return (
    <Section
      title="Allowed kinds"
      description="Event kinds on this relay’s allowlist. Whether kinds outside the list are rejected is the relay’s own decision — some relays treat this list as advisory."
      actions={
        canAllow ? (
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            Allow kind
          </Button>
        ) : undefined
      }
    >
      <SectionToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Filter by kind number"
        count={filtered?.length}
        onRefresh={() => list.refetch()}
        refreshing={list.isFetching}
      />
      {list.isLoading ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ListError error={list.error} onRetry={() => list.refetch()} />
      ) : !filtered || filtered.length === 0 ? (
        <ListEmpty
          title={search ? 'No matches' : 'No allowed kinds'}
          hint={
            search
              ? 'Nothing on this list matches the filter.'
              : 'The relay reports an empty kind list — depending on its configuration, that may mean all kinds are accepted.'
          }
        />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {filtered.map(({ kind }) => (
            <PolicyRow
              key={kind}
              id={`kind ${kind}`}
              reason={undefined}
              reasonLabel=""
              actions={
                canDisallow ? (
                  <RowAction
                    label="Disallow"
                    destructive
                    pending={isPending}
                    onClick={() =>
                      setConfirm({
                        title: `Disallow kind ${kind}?`,
                        target: `kind ${kind}`,
                        effect:
                          'If this relay enforces its kind allowlist, it will stop accepting and serving events of this kind.',
                        reversible: 'Reversible: you can allow the kind again.',
                        actionLabel: 'Disallow kind',
                        run: () =>
                          run({
                            method: 'disallowkind',
                            params: [kind],
                            refresh: ['listallowedkinds'],
                            success: `Kind ${kind} disallowed`,
                          }),
                      })
                    }
                  />
                ) : (
                  <Badge variant="outline" className="text-[10px]">read-only</Badge>
                )
              }
            />
          ))}
        </ul>
      )}

      <AddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Allow kind"
        description="Add an event kind to this relay’s allowlist (0–65535)."
        idPrefix="allow-kind"
        valueLabel="Kind number"
        valueHint="e.g. 1 for short text notes, 30023 for long-form articles."
        valuePlaceholder="1"
        withReason={false}
        pending={isPending}
        validate={(value) => {
          const parsed = parseKindInput(value);
          return typeof parsed === 'number' ? undefined : parsed.error;
        }}
        onSubmit={async (value) => {
          const parsed = parseKindInput(value);
          if (typeof parsed !== 'number') return;
          await run({
            method: 'allowkind',
            params: [parsed],
            refresh: ['listallowedkinds'],
            success: `Kind ${parsed} allowed`,
          });
        }}
      />
      <ConfirmAction pending={confirm} onClose={() => setConfirm(undefined)} />
    </Section>
  );
}
