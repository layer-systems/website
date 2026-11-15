import { useLocalStorage } from '@/hooks/useLocalStorage';
import { DEFAULT_NSITE_GATEWAY, isGatewayAllowed } from '@/lib/nsites';

const GATEWAY_KEY = 'nostr:nsite-gateway';

/**
 * The NIP-5A gateway sites are served from. A stored value that fails
 * validation (edited by hand, or from an older rule) falls back to the default.
 */
export function useNsiteGateway(): [string, (host: string) => void] {
  const [stored, setStored] = useLocalStorage<string>(GATEWAY_KEY, DEFAULT_NSITE_GATEWAY);
  const gateway = typeof stored === 'string' && isGatewayAllowed(stored, window.location.hostname)
    ? stored
    : DEFAULT_NSITE_GATEWAY;
  return [gateway, setStored];
}
