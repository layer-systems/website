import { ChevronDown, LogOut, UserIcon, UserPlus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useWindowManager } from '@/os/useWindowManager';
import { cn } from '@/lib/utils';

interface AccountSwitcherProps {
  onAddAccountClick: () => void;
  /** Shrinks the trigger to fit the OS menu bar. */
  compact?: boolean;
}

export function AccountSwitcher({ onAddAccountClick, compact }: AccountSwitcherProps) {
  const { currentUser, otherUsers, isLoading, setLogin, removeLogin } = useLoggedInAccounts();
  const { openApp } = useWindowManager();

  if (!currentUser) return null;

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? 'Anonymous';
  }

  // While the metadata query is in-flight and we don't yet have a name,
  // we don't want to flash a generated animal name / its first letter.
  const isCurrentUserPending = isLoading && !currentUser.metadata.name;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center rounded-full text-foreground transition-all hover:bg-accent',
            compact ? 'h-6 gap-1 p-0.5 pr-1.5' : 'h-10 gap-2 p-1 pr-2.5',
          )}
        >
          <Avatar className={compact ? 'size-5' : 'w-8 h-8'}>
            <AvatarImage
              src={currentUser.metadata.picture}
              alt={isCurrentUserPending ? '' : getDisplayName(currentUser)}
            />
            <AvatarFallback>
              {isCurrentUserPending ? (
                <Skeleton className='size-full rounded-full' />
              ) : (
                getDisplayName(currentUser).charAt(0)
              )}
            </AvatarFallback>
          </Avatar>
          <ChevronDown
            className={cn('text-muted-foreground', compact ? 'size-3' : 'w-4 h-4')}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56 p-2 animate-scale-in'>
        <DropdownMenuItem
          onClick={() => openApp('profile', { pubkey: currentUser.pubkey })}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
        >
          <Avatar className='w-8 h-8'>
            <AvatarImage
              src={currentUser.metadata.picture}
              alt={isCurrentUserPending ? '' : getDisplayName(currentUser)}
            />
            <AvatarFallback>
              {isCurrentUserPending ? (
                <Skeleton className='size-full rounded-full' />
              ) : (
                getDisplayName(currentUser)?.charAt(0) || <UserIcon />
              )}
            </AvatarFallback>
          </Avatar>
          <div className='flex-1 truncate'>
            {isCurrentUserPending ? (
              <Skeleton className='h-4 w-24' />
            ) : (
              <p className='text-sm font-medium'>{getDisplayName(currentUser)}</p>
            )}
          </div>
        </DropdownMenuItem>
        {otherUsers.map((user) => {
          const isPending = isLoading && !user.metadata.name;
          return (
            <DropdownMenuItem
              key={user.id}
              onClick={() => setLogin(user.id)}
              className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
            >
              <Avatar className='w-8 h-8'>
                <AvatarImage
                  src={user.metadata.picture}
                  alt={isPending ? '' : getDisplayName(user)}
                />
                <AvatarFallback>
                  {isPending ? (
                    <Skeleton className='size-full rounded-full' />
                  ) : (
                    getDisplayName(user)?.charAt(0) || <UserIcon />
                  )}
                </AvatarFallback>
              </Avatar>
              <div className='flex-1 truncate'>
                {isPending ? (
                  <Skeleton className='h-4 w-24' />
                ) : (
                  <p className='text-sm font-medium'>{getDisplayName(user)}</p>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onAddAccountClick}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
        >
          <UserPlus className='w-4 h-4' />
          <span>Add another account</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => removeLogin(currentUser.id)}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md text-red-500'
        >
          <LogOut className='w-4 h-4' />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
