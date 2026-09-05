import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { useRelayStatus } from '@/hooks/useRelayStatus';

interface LockScreenProps {
  onContinueAsGuest: () => void;
}

export function LockScreen({ onContinueAsGuest }: LockScreenProps) {
  const [now, setNow] = useState(() => new Date());
  const { status } = useRelayStatus();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unlock LAYER.systems"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background/80 backdrop-blur-xl px-4 text-center"
    >
      <div className="space-y-1">
        <p className="text-6xl sm:text-7xl font-light tabular-nums">
          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </p>
        <p className="text-sm text-muted-foreground">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Layers className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold">LAYER.systems</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Unlock with your Nostr key to sync your dashboard, events, and messages.
        </p>
        <p className="text-xs text-muted-foreground">
          Relay {status === 'online' ? 'connected' : status === 'connecting' ? 'connecting…' : 'offline'}
        </p>
      </div>

      <LoginArea className="w-full max-w-xs" />

      <button
        type="button"
        onClick={onContinueAsGuest}
        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Continue without an account
      </button>
    </div>
  );
}
