import { useQuery } from '@tanstack/react-query';
import { nip05 } from 'nostr-tools';

/** Only expose an identifier after its domain confirms the author's public key. */
export function useNip05(pubkey: string | undefined, identifier: string | undefined) {
  const validInput = typeof identifier === 'string' && nip05.isNip05(identifier)
    && typeof pubkey === 'string' && /^[0-9a-f]{64}$/.test(pubkey);

  return useQuery({
    queryKey: ['nostr', 'nip05', pubkey, identifier],
    enabled: validInput,
    queryFn: async () => {
      if (!validInput) return null;
      try {
        const profile = await nip05.queryProfile(identifier);
        if (profile?.pubkey !== pubkey) return null;
        return identifier.replace(/^_@/, '');
      } catch {
        return null;
      }
    },
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: false,
  });
}
