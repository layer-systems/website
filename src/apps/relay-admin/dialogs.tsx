import { useState, type ReactNode } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Safety dialogs. Two tiers:
 *
 * - `ConfirmAction` for destructive-but-reversible operations (bans, unbans,
 *   unallowing access). It states the target, the likely effect, and whether
 *   the relay offers a reverse operation.
 * - `TypedConfirmAction` for relay-specific extensions, which are treated as
 *   potentially irreversible: the operator must type a phrase, and the dialog
 *   says plainly that no undo is known.
 *
 * Cancelling a dialog never sends anything; the copy avoids implying a
 * cancelled request rolled back relay-side work.
 */

export interface PendingConfirm {
  title: string;
  target: string;
  effect: string;
  reversible?: string;
  actionLabel: string;
  run: () => Promise<void>;
}

export function ConfirmAction({
  pending,
  onClose,
}: {
  pending: PendingConfirm | undefined;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.run();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <span className="block">
                Target: <span className="break-all font-mono text-xs">{pending?.target}</span>
              </span>
              <span className="block">{pending?.effect}</span>
              <span className="block">
                {pending?.reversible ?? 'The relay offers no operation that reverses this.'}
              </span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {pending?.actionLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export interface PendingTypedConfirm {
  title: string;
  method: string;
  /** The exact phrase the operator must type, e.g. the method name. */
  phrase: string;
  effect: string;
  run: () => Promise<void>;
}

export function TypedConfirmAction({
  pending,
  onClose,
}: {
  pending: PendingTypedConfirm | undefined;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmedFor, setConfirmedFor] = useState<PendingTypedConfirm | undefined>(undefined);

  // Reset the typed phrase whenever a *different* operation is opened. This is
  // a render-phase reset (not an effect) so it passes the hooks lint rules.
  if (pending !== confirmedFor) {
    setConfirmedFor(pending);
    setTyped('');
    setBusy(false);
  }

  const matches = pending ? typed.trim() === pending.phrase : false;

  const confirm = async () => {
    if (!pending || !matches) return;
    setBusy(true);
    try {
      await pending.run();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" aria-hidden />
            {pending?.title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <span className="block">
                <span className="font-mono text-xs">{pending?.method}</span> is not part of the
                NIP-86 standard. It is specific to this relay implementation, and its exact effect
                is defined by the relay — not by this console.
              </span>
              <span className="block">{pending?.effect}</span>
              <span className="block font-medium text-destructive">
                There is no standard way to reverse this operation.
              </span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="typed-confirm" className="text-xs">
            Type <span className="font-mono font-semibold">{pending?.phrase}</span> to confirm
          </Label>
          <Input
            id="typed-confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={pending?.phrase}
            autoComplete="off"
            className="font-mono text-xs"
            aria-invalid={typed.length > 0 && !matches}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={!matches || busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Run {pending?.method}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Banning an event by ID is destructive, so the flow is a dedicated dialog
 * with its own validation, not a generic form.
 */
export function BanEventDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (value: string, reason: string) => Promise<void>;
}) {
  const [id, setId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const close = (next: boolean) => {
    if (!next) {
      setId('');
      setReason('');
      setError(undefined);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    // Local validation happens here in the dialog; the caller re-parses.
    const trimmed = id.trim();
    if (!trimmed) {
      setError('Enter an event ID.');
      return;
    }
    await onSubmit(trimmed, reason);
    close(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title="Ban event by ID"
      description="The relay will stop serving this event and may delete its stored copy. The event can still exist on other relays."
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending || !id.trim()}>
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Ban event
          </Button>
        </>
      }
    >
      <Field id="ban-event-id" label="Event ID" error={error} hint={error ? undefined : '64 hex characters, or a note1… / nevent1… identifier.'}>
        <Input
          id="ban-event-id"
          value={id}
          onChange={(event) => {
            setId(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          placeholder="note1…"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'ban-event-id-error' : undefined}
          className="font-mono text-xs"
          autoFocus
        />
      </Field>
      <Field id="ban-event-reason" label="Reason (optional)" hint="Stored by the relay and shown to other operators.">
        <Input
          id="ban-event-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="text-sm"
        />
      </Field>
    </FormDialog>
  );
}

/** Generic form dialog wrapper used by every "add / edit" flow. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[90dvh] overflow-y-auto', wide && 'sm:max-w-xl')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">{children}</div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Validated text field: label, error wiring and hint in one place. */
export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
