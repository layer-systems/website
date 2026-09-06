import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import { OsShell } from '@/components/os/OsShell';
import NotFound from './NotFound';
import { encodeRelayHints } from '@/lib/nostrUtils';
import type { AppParams } from '@/os/types';

/** Attaches any relay hints the identifier carried to the app's parameters. */
function withHints(params: AppParams, relays: string[] | undefined): AppParams {
  const hints = encodeRelayHints(relays);
  return hints ? { ...params, relays: hints } : params;
}

/**
 * Every NIP-19 identifier is a deep link into one of the apps: the desktop
 * boots as usual and the matching window opens on top of it.
 */
export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  let boot: { appId: string; params: AppParams } | undefined;

  try {
    if (!identifier) throw new Error('missing identifier');
    const decoded = nip19.decode(identifier);

    switch (decoded.type) {
      case 'npub':
        boot = { appId: 'profile', params: { pubkey: decoded.data } };
        break;
      case 'nprofile':
        boot = {
          appId: 'profile',
          params: withHints({ pubkey: decoded.data.pubkey }, decoded.data.relays),
        };
        break;
      case 'note':
        boot = { appId: 'notes', params: { id: decoded.data } };
        break;
      case 'nevent':
        boot = { appId: 'notes', params: withHints({ id: decoded.data.id }, decoded.data.relays) };
        break;
      case 'naddr':
        boot = {
          appId: 'articles',
          params: withHints(
            {
              pubkey: decoded.data.pubkey,
              kind: String(decoded.data.kind),
              identifier: decoded.data.identifier,
            },
            decoded.data.relays,
          ),
        };
        break;
      default:
        boot = undefined;
    }
  } catch {
    boot = undefined;
  }

  if (!boot) {
    return <NotFound />;
  }

  return <OsShell boot={boot} />;
}
