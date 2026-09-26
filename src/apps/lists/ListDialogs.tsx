import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useNip51ListMutation } from '@/hooks/useNip51Lists';
import { useToast } from '@/hooks/useToast';
import { LIST_KINDS, generateIdentifier, isHttpsUrl, listKindInfo, type Nip51List } from '@/lib/nip51';

const SET_OPTIONS = LIST_KINDS.filter((info) => info.type === 'set');

interface DetailsFields {
  title: string;
  description: string;
  image: string;
}

function DetailsInputs({
  fields,
  onChange,
  idPrefix,
}: {
  fields: DetailsFields;
  onChange: (fields: DetailsFields) => void;
  idPrefix: string;
}) {
  const imageInvalid = fields.image.trim().length > 0 && !isHttpsUrl(fields.image.trim());
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input
          id={`${idPrefix}-title`}
          value={fields.title}
          onChange={(event) => onChange({ ...fields, title: event.target.value })}
          placeholder="e.g. Bitcoin developers"
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Description (optional)</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={fields.description}
          onChange={(event) => onChange({ ...fields, description: event.target.value })}
          rows={2}
          className="min-h-16 resize-none"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-image`}>Image URL (optional)</Label>
        <Input
          id={`${idPrefix}-image`}
          value={fields.image}
          onChange={(event) => onChange({ ...fields, image: event.target.value })}
          placeholder="https://…"
          aria-invalid={imageInvalid}
          aria-describedby={imageInvalid ? `${idPrefix}-image-error` : undefined}
        />
        {imageInvalid && (
          <p id={`${idPrefix}-image-error`} className="text-xs text-destructive">
            Use an https:// image URL.
          </p>
        )}
      </div>
    </>
  );
}

function detailsValid(fields: DetailsFields): boolean {
  return fields.title.trim().length > 0 && (fields.image.trim() === '' || isHttpsUrl(fields.image.trim()));
}

export function CreateListDialog({
  open,
  onOpenChange,
  onCreated,
  defaultKind = 30000,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (kind: number, identifier: string) => void;
  defaultKind?: number;
}) {
  const [kind, setKind] = useState(defaultKind);
  const [fields, setFields] = useState<DetailsFields>({ title: '', description: '', image: '' });
  const [identifier, setIdentifier] = useState('');
  const [identifierEdited, setIdentifierEdited] = useState(false);
  const mutation = useNip51ListMutation();
  const { toast } = useToast();

  const info = listKindInfo(kind);
  const valid = detailsValid(fields) && identifier.trim().length > 0;

  const reset = () => {
    setFields({ title: '', description: '', image: '' });
    setIdentifier('');
    setIdentifierEdited(false);
  };

  const updateFields = (next: DetailsFields) => {
    // The identifier follows the title until the user edits it themselves.
    if (!identifierEdited && next.title.trim() !== fields.title.trim()) {
      setIdentifier(next.title.trim() ? generateIdentifier(next.title) : '');
    }
    setFields(next);
  };

  const submit = async () => {
    if (!valid) return;
    const d = identifier.trim();
    try {
      await mutation.mutateAsync({
        kind,
        identifier: d,
        create: true,
        ops: [{ type: 'meta', title: fields.title, description: fields.description, image: fields.image }],
      });
      toast({ title: 'List created' });
      reset();
      onOpenChange(false);
      onCreated(kind, d);
    } catch (error) {
      toast({
        title: 'Could not create the list',
        description: error instanceof Error ? error.message : 'No relay accepted it.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New list</DialogTitle>
          <DialogDescription>{info?.description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-list-kind">Type</Label>
            <Select value={String(kind)} onValueChange={(value) => setKind(Number(value))}>
              <SelectTrigger id="new-list-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SET_OPTIONS.map((option) => (
                  <SelectItem key={option.kind} value={String(option.kind)}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DetailsInputs fields={fields} onChange={updateFields} idPrefix="new-list" />
          <div className="space-y-1.5">
            <Label htmlFor="new-list-identifier">Identifier</Label>
            <Input
              id="new-list-identifier"
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                setIdentifierEdited(true);
              }}
              className="font-mono text-sm"
              aria-describedby="new-list-identifier-hint"
            />
            <p id="new-list-identifier-hint" className="text-xs text-muted-foreground">
              The list’s permanent <code>d</code> tag. It can’t be changed after publishing.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || mutation.isPending} className="gap-1.5">
              {mutation.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Create list
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditDetailsDialog({
  list,
  open,
  onOpenChange,
}: {
  list: Nip51List;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [fields, setFields] = useState<DetailsFields>({
    title: list.title ?? '',
    description: list.description ?? '',
    image: list.image ?? '',
  });
  const mutation = useNip51ListMutation();
  const { toast } = useToast();

  const submit = async () => {
    if (!detailsValid(fields)) return;
    try {
      await mutation.mutateAsync({
        kind: list.kind,
        identifier: list.identifier,
        ops: [{ type: 'meta', title: fields.title, description: fields.description, image: fields.image }],
      });
      toast({ title: 'List updated' });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Could not update the list',
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>
            Identifier <code className="font-mono">{list.identifier}</code> stays the same.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DetailsInputs fields={fields} onChange={setFields} idPrefix="edit-list" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!detailsValid(fields) || mutation.isPending} className="gap-1.5">
              {mutation.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
