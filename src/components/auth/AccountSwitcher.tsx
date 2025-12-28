// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { ChevronDown, LayoutDashboard, LogOut, Monitor, Moon, Sun, UserIcon, UserPlus, Wallet, Wifi, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.tsx';
import { WalletModal } from '@/components/WalletModal';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer.tsx';
import { Button } from '@/components/ui/button';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { genUserName } from '@/lib/genUserName';
import { RelayListManager } from '@/components/RelayListManager';
import { useTheme } from '@/hooks/useTheme';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface AccountSwitcherProps {
  onAddAccountClick: () => void;
}

export function AccountSwitcher({ onAddAccountClick }: AccountSwitcherProps) {
  const { currentUser, otherUsers, setLogin, removeLogin } = useLoggedInAccounts();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  if (!currentUser) return null;

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? genUserName(account.pubkey);
  }

  const handleThemeChange = (value: string) => {
    if (value === 'light' || value === 'dark' || value === 'system') {
      setTheme(value);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className='flex items-center gap-3 p-3 rounded-full hover:bg-accent transition-all w-full text-foreground'>
          <Avatar className='w-10 h-10'>
            <AvatarImage src={currentUser.metadata.picture} alt={getDisplayName(currentUser)} />
            <AvatarFallback>{getDisplayName(currentUser).charAt(0)}</AvatarFallback>
          </Avatar>
          <div className='flex-1 text-left hidden md:block truncate'>
            <p className='font-medium text-sm truncate'>{getDisplayName(currentUser)}</p>
          </div>
          <ChevronDown className='w-4 h-4 text-muted-foreground' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56 p-2 animate-scale-in'>
        <div className='font-medium text-sm px-2 py-1.5'>Switch Account</div>
        {otherUsers.map((user) => (
          <DropdownMenuItem
            key={user.id}
            onClick={() => setLogin(user.id)}
            className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
          >
            <Avatar className='w-8 h-8'>
              <AvatarImage src={user.metadata.picture} alt={getDisplayName(user)} />
              <AvatarFallback>{getDisplayName(user)?.charAt(0) || <UserIcon />}</AvatarFallback>
            </Avatar>
            <div className='flex-1 truncate'>
              <p className='text-sm font-medium'>{getDisplayName(user)}</p>
            </div>
            {user.id === currentUser.id && <div className='w-2 h-2 rounded-full bg-primary'></div>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
          onClick={() => navigate('/dashboard')}
        >
          <LayoutDashboard className='w-4 h-4' />
          <span>Dashboard</span>
        </DropdownMenuItem>
        <Drawer>
          <DrawerTrigger asChild>
            <DropdownMenuItem
              className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
              onSelect={(e) => e.preventDefault()}
            >
              <Wifi className='w-4 h-4' />
              <span>Manage relays</span>
            </DropdownMenuItem>
          </DrawerTrigger>
          <DrawerContent className='h-[80vh] max-h-[640px] flex flex-col'>
            <DrawerHeader className='flex items-start justify-between gap-4 px-4 pt-6 pb-2'>
              <div>
                <DrawerTitle className='flex items-center gap-2'>
                  <Wifi className='h-5 w-5' />
                  <span>Relay connections</span>
                </DrawerTitle>
                <DrawerDescription>
                  Choose which relays this client reads from and publishes to.
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant='ghost' size='icon' className='rounded-full'>
                  <X className='h-4 w-4' />
                  <span className='sr-only'>Close</span>
                </Button>
              </DrawerClose>
            </DrawerHeader>
            <div className='px-4 pb-6 pt-2 overflow-y-auto'>
              <RelayListManager />
            </div>
          </DrawerContent>
        </Drawer>
        <WalletModal>
          <DropdownMenuItem
            className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
            onSelect={(e) => e.preventDefault()}
          >
            <Wallet className='w-4 h-4' />
            <span>Wallet Settings</span>
          </DropdownMenuItem>
        </WalletModal>
        <DropdownMenuItem
          onClick={onAddAccountClick}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
        >
          <UserPlus className='w-4 h-4' />
          <span>Add another account</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className='px-2 py-2 space-y-2'>
          <p className='text-xs font-medium text-muted-foreground'>Theme</p>
          <ToggleGroup
            type='single'
            value={theme}
            onValueChange={handleThemeChange}
            aria-label='Select theme'
            className='w-full justify-start'
          >
            <ToggleGroupItem
              value='light'
              aria-label='Light theme'
              className='flex-1 flex items-center justify-center gap-1'
            >
              <Sun className='h-4 w-4' />
            </ToggleGroupItem>
            <ToggleGroupItem
              value='system'
              aria-label='System theme'
              className='flex-1 flex items-center justify-center gap-1'
            >
              <Monitor className='h-4 w-4' />
            </ToggleGroupItem>
            <ToggleGroupItem
              value='dark'
              aria-label='Dark theme'
              className='flex-1 flex items-center justify-center gap-1'
            >
              <Moon className='h-4 w-4' />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
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