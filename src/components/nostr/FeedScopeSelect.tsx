import { Globe, List, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type FeedScope, type FeedScopeState, LIST_SCOPE_PREFIX } from '@/hooks/useFeedScope';

/** The Following / Global / lists dropdown driven by `useFeedScope`. */
export function FeedScopeSelect({ state, label = 'Feed source' }: { state: FeedScopeState; label?: string }) {
  const { user } = useCurrentUser();
  const { scope, setScope, isList, selectedList, followSets } = state;

  return (
    <Select value={scope} onValueChange={(value) => setScope(value as FeedScope)}>
      <SelectTrigger size="sm" className="h-7 max-w-56 shrink-0 gap-1.5 px-2.5 text-[13px] font-medium" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-w-72">
        <SelectItem value="following" disabled={!user}>
          <Users className="size-3.5" aria-hidden />
          Following
        </SelectItem>
        <SelectItem value="global">
          <Globe className="size-3.5" aria-hidden />
          Global
        </SelectItem>
        {user && (followSets?.length ?? 0) > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Your lists</SelectLabel>
              {followSets!.map((set) => (
                <SelectItem key={set.identifier} value={`${LIST_SCOPE_PREFIX}${set.identifier}`}>
                  <List className="size-3.5" aria-hidden />
                  <span className="truncate">{set.title}</span>
                  <span className="text-xs text-muted-foreground tabular-nums in-data-[slot=select-value]:hidden">{set.pubkeys.length}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
        {/* Keeps the trigger labelled while a previously chosen list is still loading. */}
        {isList && !selectedList && (
          <SelectItem value={scope} disabled>
            <List className="size-3.5" aria-hidden />
            Loading list…
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
