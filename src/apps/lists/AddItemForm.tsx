import { useId, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ITEM_LABELS, parseItemInput, type ItemTagName, type ListKindInfo } from '@/lib/nip51';

const PLACEHOLDERS: Record<ItemTagName, string> = {
  p: 'npub1…, nprofile1… or hex public key',
  e: 'note1…, nevent1… or hex event id',
  a: 'naddr1… or kind:pubkey:identifier',
  t: 'hashtag',
  word: 'word or phrase',
  relay: 'wss://relay.example.com',
  emoji: 'shortcode',
};

export function AddItemForm({
  info,
  canEncrypt,
  pending,
  onAdd,
}: {
  info: ListKindInfo;
  /** Whether the signer supports NIP-44; private items need it. */
  canEncrypt: boolean;
  pending: boolean;
  /** Resolves true once the item was saved, so the form can clear itself. */
  onAdd: (tag: string[], isPrivate: boolean) => Promise<boolean>;
}) {
  const id = useId();
  const [tagName, setTagName] = useState<ItemTagName>(info.itemTags[0]);
  const [value, setValue] = useState('');
  const [emojiUrl, setEmojiUrl] = useState('');
  // Mutes are a private choice by default; starter packs are meant to be shared.
  const [isPrivate, setIsPrivate] = useState(info.kind === 10000 && canEncrypt);
  const [error, setError] = useState<string>();

  const submit = async () => {
    const parsed = parseItemInput(tagName, value, { addressKinds: info.addressKinds, emojiUrl });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(undefined);
    if (await onAdd(parsed.tag, isPrivate && canEncrypt)) {
      setValue('');
      setEmojiUrl('');
    }
  };

  return (
    <form
      className="space-y-2 border-b border-border px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-wrap gap-2">
        {info.itemTags.length > 1 && (
          <Select
            value={tagName}
            onValueChange={(next) => {
              setTagName(next as ItemTagName);
              setError(undefined);
            }}
          >
            <SelectTrigger className="w-32" aria-label="Item type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {info.itemTags.map((name) => (
                <SelectItem key={name} value={name}>
                  {ITEM_LABELS[name]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={PLACEHOLDERS[tagName]}
          aria-label={`${ITEM_LABELS[tagName]} to add`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-w-40 flex-1"
        />
        {tagName === 'emoji' && (
          <Input
            value={emojiUrl}
            onChange={(event) => setEmojiUrl(event.target.value)}
            placeholder="https://… image"
            aria-label="Emoji image URL"
            className="min-w-40 flex-1"
          />
        )}
        <Button type="submit" disabled={pending || !value.trim()} className="gap-1.5">
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
          Add
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-private`}
          checked={isPrivate && canEncrypt}
          disabled={!canEncrypt}
          onCheckedChange={(checked) => setIsPrivate(checked === true)}
        />
        <Label htmlFor={`${id}-private`} className="text-xs font-normal text-muted-foreground">
          {canEncrypt ? 'Add as private (encrypted, only you can see it)' : 'Private items need a signer with NIP-44 support'}
        </Label>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
