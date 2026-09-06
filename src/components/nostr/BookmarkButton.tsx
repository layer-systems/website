import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { isBookmarked, useBookmarkedTargets, useToggleBookmark, type BookmarkTarget } from '@/hooks/useBookmarks';
import { cn } from '@/lib/utils';

/** Toggles `target` in and out of the signed-in user's NIP-51 bookmark list. */
export function BookmarkButton({ target, className }: { target: BookmarkTarget; className?: string }) {
  const { user } = useCurrentUser();
  const targets = useBookmarkedTargets();
  const toggle = useToggleBookmark();
  const { toast } = useToast();

  if (!user) return null;

  const bookmarked = isBookmarked(targets, target);

  const handleClick = async () => {
    try {
      await toggle.mutateAsync(target);
    } catch (error) {
      toast({
        title: bookmarked ? 'Could not remove bookmark' : 'Could not bookmark',
        description: error instanceof Error ? error.message : 'No relay accepted the update.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('h-7 gap-1.5 px-2 text-xs text-muted-foreground', bookmarked && 'text-primary', className)}
      onClick={handleClick}
      disabled={toggle.isPending}
      aria-pressed={bookmarked}
    >
      {toggle.isPending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : bookmarked ? (
        <BookmarkCheck className="size-3.5" aria-hidden />
      ) : (
        <Bookmark className="size-3.5" aria-hidden />
      )}
      {bookmarked ? 'Bookmarked' : 'Bookmark'}
    </Button>
  );
}
