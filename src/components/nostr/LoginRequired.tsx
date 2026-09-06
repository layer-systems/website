import { LoginArea } from '@/components/auth/LoginArea';
import { EmptyState } from '@/components/os/AppChrome';

/** Shown inside a window when an app needs a signed-in user. */
export function LoginRequired({ action }: { action: string }) {
  return (
    <EmptyState
      title="Sign in to continue"
      hint={`You need a Nostr account to ${action}.`}
      action={<LoginArea />}
    />
  );
}
