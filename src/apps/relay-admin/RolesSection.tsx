import { useState } from 'react';
import { Loader2, Pencil, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useNip86Mutation,
  useRelayRoles,
  type AuditEntry,
  type Nip86Session,
} from '@/hooks/useNip86';
import { useToast } from '@/hooks/useToast';
import {
  parsePubkeyInput,
  parseRoles,
  validateRoleColor,
  validateRoleId,
  type Nip86Role,
} from '@/lib/nip86';
import { ConfirmAction, Field, FormDialog, type PendingConfirm } from './dialogs';
import { ListEmpty, ListSkeleton, RowAction, Section } from './shared';

type AuditFn = (entry: Omit<AuditEntry, 'id' | 'at'>) => void;

/**
 * Roles. The mutation methods (createrole/editrole/deleterole/assignrole/
 * unassignrole) are standard NIP-86, but no standard "list roles" method
 * exists — roles are only listed when the relay advertises the common
 * `listroles` extension, and that is labelled as relay-specific.
 */

interface RoleForm {
  id: string;
  label: string;
  description: string;
  color: string;
  order: string;
}

const EMPTY_ROLE: RoleForm = { id: '', label: '', description: '', color: '', order: '0' };

function RoleDialog({
  open,
  onOpenChange,
  editing,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this role (id immutable) instead of creating. */
  editing: Nip86Role | undefined;
  pending: boolean;
  onSubmit: (form: RoleForm) => Promise<void>;
}) {
  const [form, setForm] = useState<RoleForm>(EMPTY_ROLE);
  const [error, setError] = useState<string | undefined>(undefined);
  const [openFor, setOpenFor] = useState<Nip86Role | 'new' | undefined>(undefined);

  // Render-phase reset whenever the dialog targets a different role.
  const target = open ? (editing ?? ('new' as const)) : undefined;
  if (target !== openFor) {
    setOpenFor(target);
    setError(undefined);
    setForm(
      editing
        ? {
            id: editing.id,
            label: editing.label ?? '',
            description: editing.description ?? '',
            color: editing.color ?? '',
            order: String(editing.order ?? 0),
          }
        : EMPTY_ROLE,
    );
  }

  const idError = editing ? undefined : validateRoleId(form.id);
  const colorError = validateRoleColor(form.color);
  const orderValid = /^\d+$/.test(form.order.trim());

  const submit = async () => {
    if (!editing && idError) {
      setError(idError);
      return;
    }
    if (!orderValid) {
      setError('Order must be a whole number.');
      return;
    }
    if (colorError) {
      setError(colorError);
      return;
    }
    await onSubmit(form);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit role ${editing.id}` : 'Create role'}
      description="Roles are relay-side groupings (e.g. moderators). What a role grants is defined by the relay."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              pending ||
              !form.id.trim() ||
              !form.label.trim() ||
              Boolean(form.id && idError) ||
              Boolean(colorError) ||
              !orderValid
            }
          >
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {editing ? 'Save role' : 'Create role'}
          </Button>
        </>
      }
    >
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <Field id="role-id" label="Role ID" hint={editing ? 'The ID cannot be changed.' : 'Lowercase slug, e.g. moderator.'}>
        <Input
          id="role-id"
          value={form.id}
          onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))}
          disabled={Boolean(editing)}
          className="font-mono text-xs"
          autoFocus={!editing}
        />
      </Field>
      <Field id="role-label" label="Label">
        <Input
          id="role-label"
          value={form.label}
          onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
          placeholder="Moderator"
          autoFocus={Boolean(editing)}
        />
      </Field>
      <Field id="role-description" label="Description (optional)">
        <Input
          id="role-description"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="role-color" label="Color (optional)" hint="#8b5cf6">
          <Input
            id="role-color"
            value={form.color}
            onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
            aria-invalid={Boolean(colorError)}
            className="font-mono text-xs"
          />
        </Field>
        <Field id="role-order" label="Order">
          <Input
            id="role-order"
            value={form.order}
            onChange={(event) => setForm((current) => ({ ...current, order: event.target.value }))}
            aria-invalid={!orderValid}
            inputMode="numeric"
            className="font-mono text-xs"
          />
        </Field>
      </div>
    </FormDialog>
  );
}

function AssignDialog({
  role,
  onOpenChange,
  pending,
  onSubmit,
}: {
  role: Nip86Role | undefined;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (pubkey: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const close = (next: boolean) => {
    if (!next) {
      setValue('');
      setError(undefined);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    const parsed = parsePubkeyInput(value);
    if (typeof parsed !== 'string') {
      setError(parsed.error);
      return;
    }
    await onSubmit(parsed);
    close(false);
  };

  return (
    <FormDialog
      open={Boolean(role)}
      onOpenChange={close}
      title={`Assign role ${role?.id ?? ''}`}
      description="Give a pubkey this role. What members of the role may do is enforced by the relay."
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !value.trim()}>
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Assign role
          </Button>
        </>
      }
    >
      <Field
        id="assign-pubkey"
        label="Public key"
        error={error}
        hint={error ? undefined : '64 hex characters, or an npub1… / nprofile1… identifier.'}
      >
        <Input
          id="assign-pubkey"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          placeholder="npub1…"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'assign-pubkey-error' : undefined}
          className="font-mono text-xs"
          autoFocus
        />
      </Field>
    </FormDialog>
  );
}

export function RolesSection({
  session,
  onResult,
}: {
  session: Nip86Session;
  onResult: AuditFn;
}) {
  const { toast } = useToast();
  const mutation = useNip86Mutation(session, { onResult });
  const rolesQuery = useRelayRoles(session, { onResult });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Nip86Role | undefined>(undefined);
  const [assigning, setAssigning] = useState<Nip86Role | undefined>(undefined);
  const [confirm, setConfirm] = useState<PendingConfirm | undefined>(undefined);
  const [unassignKey, setUnassignKey] = useState('');

  const canCreate = session.methods.includes('createrole');
  const canEdit = session.methods.includes('editrole');
  const canDelete = session.methods.includes('deleterole');
  const canAssign = session.methods.includes('assignrole');
  const canUnassign = session.methods.includes('unassignrole');

  const roles = session.canListRoles ? parseRoles(rolesQuery.data) : [];

  const run = async (
    method: 'createrole' | 'editrole' | 'deleterole' | 'assignrole' | 'unassignrole',
    params: unknown[],
    success: string,
  ) => {
    try {
      await mutation.mutateAsync({
        method,
        params,
        refresh: session.canListRoles ? ['listroles'] : [],
      });
      toast({ title: success });
    } catch (error) {
      toast({
        title: 'The relay refused the operation',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <Section
      title="Roles"
      description="Relay-side groupings such as moderators. Deleting or reassigning roles changes what people can do — treat both as sensitive."
      actions={
        canCreate ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            New role
          </Button>
        ) : undefined
      }
    >
      {session.canListRoles ? (
        <>
          <p className="px-3 pb-2 text-xs text-muted-foreground">
            The role list below comes from <span className="font-mono">listroles</span>, a
            relay-specific extension — it is not standard NIP-86.
          </p>
          {rolesQuery.isLoading ? (
            <ListSkeleton rows={2} />
          ) : rolesQuery.isError ? (
            <ListEmpty title="Could not load roles" hint={rolesQuery.error.message} />
          ) : roles.length === 0 ? (
            <ListEmpty title="No roles" hint="The relay reports no roles yet." />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {roles.map((role) => (
                <li key={role.id} className="flex items-center gap-3 px-3 py-2">
                  <span
                    className="size-3 shrink-0 rounded-full border border-border"
                    style={
                      // Role colors come from the relay; only valid hex values
                      // may reach a style attribute.
                      role.color && validateRoleColor(role.color) === undefined && role.color
                        ? { backgroundColor: role.color }
                        : undefined
                    }
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {role.label || role.id}{' '}
                      <span className="font-mono text-xs font-normal text-muted-foreground">
                        {role.id}
                      </span>
                    </p>
                    {role.description && (
                      <p className="truncate text-xs text-muted-foreground" title={role.description}>
                        {role.description}
                      </p>
                    )}
                  </div>
                  {canAssign && (
                    <RowAction label="Assign" pending={mutation.isPending} onClick={() => setAssigning(role)} />
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={`Edit role ${role.id}`}
                      onClick={() => {
                        setEditing(role);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                  )}
                  {canDelete && (
                    <RowAction
                      label="Delete"
                      destructive
                      pending={mutation.isPending}
                      onClick={() =>
                        setConfirm({
                          title: `Delete role ${role.id}?`,
                          target: `role ${role.id}`,
                          effect:
                            'The role stops existing. What happens to its current members depends on the relay.',
                          reversible: 'Not directly reversible: you would have to recreate the role and reassign its members.',
                          actionLabel: 'Delete role',
                          run: () => run('deleterole', [role.id], `Role ${role.id} deleted`),
                        })
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <ListEmpty
          title="Roles cannot be listed"
          hint="This relay does not advertise a way to list roles (listroles is not standard NIP-86). If you know a role's ID — from the relay's documentation — you can still manage it below."
        />
      )}

      {canUnassign && (
        <div className="px-3 pt-3">
          <Label htmlFor="unassign-form" className="text-xs">
            Remove a role from a pubkey
          </Label>
          <form
            id="unassign-form"
            className="mt-1.5 flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const roleId = (new FormData(event.currentTarget).get('role') ?? '').toString().trim();
              const parsed = parsePubkeyInput(unassignKey);
              if (typeof parsed !== 'string' || !roleId) return;
              setConfirm({
                title: `Remove role ${roleId}?`,
                target: `role ${roleId} for pubkey ${parsed.slice(0, 16)}…`,
                effect: 'The key loses whatever this role grants on the relay.',
                reversible: 'Reversible: you can assign the role again.',
                actionLabel: 'Remove role',
                run: () => run('unassignrole', [parsed, roleId], 'Role removed'),
              });
            }}
          >
            <Input
              name="role"
              placeholder="role id"
              aria-label="Role ID to remove"
              className="h-8 w-32 font-mono text-xs"
              required
            />
            <Input
              value={unassignKey}
              onChange={(event) => setUnassignKey(event.target.value)}
              placeholder="npub1…"
              aria-label="Public key to remove the role from"
              className="h-8 min-w-40 flex-1 font-mono text-xs"
              required
            />
            <Button type="submit" variant="outline" size="sm" className="h-8 text-xs" disabled={mutation.isPending}>
              Remove
            </Button>
          </form>
        </div>
      )}

      <RoleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        pending={mutation.isPending}
        onSubmit={(form) =>
          run(
            editing ? 'editrole' : 'createrole',
            [
              form.id.trim(),
              form.label.trim(),
              form.description.trim(),
              form.color.trim(),
              Number(form.order.trim()),
            ],
            editing ? `Role ${form.id} updated` : `Role ${form.id} created`,
          )
        }
      />
      <AssignDialog
        role={assigning}
        onOpenChange={(open) => !open && setAssigning(undefined)}
        pending={mutation.isPending}
        onSubmit={(pubkey) => run('assignrole', [pubkey, assigning?.id ?? ''], `Role ${assigning?.id} assigned`)}
      />
      <ConfirmAction pending={confirm} onClose={() => setConfirm(undefined)} />
    </Section>
  );
}
