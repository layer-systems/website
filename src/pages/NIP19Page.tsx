import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import { OsShell } from '@/components/os/OsShell';
import NotFound from './NotFound';
import { isCalendarEventKind } from '@/lib/calendarEvents';
import { encodeRelayHints } from '@/lib/nostrUtils';
import { LEGACY_GENERIC_KIND, SET_KINDS } from '@/lib/nip51';
import { PODCAST_EPISODE_KIND, isHexPubkey } from '@/lib/podcasts';
import { POLL_KIND } from '@/lib/polls';
import type { AppParams } from '@/os/types';

/** Attaches any relay hints the identifier carried to the app's parameters. */
function withHints(params: AppParams, relays: string[] | undefined): AppParams {
  const hints = encodeRelayHints(relays);
  return hints ? { ...params, relays: hints } : params;
}

/** The app an `naddr` opens, by the addressed event's kind. */
function naddrApp(kind: number): string {
  if (isCalendarEventKind(kind)) return 'calendar';
  if (SET_KINDS.includes(kind) || kind === LEGACY_GENERIC_KIND) return 'lists';
  return 'articles';
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
        // A NIP-F4 episode link carries kind 54 and its show key: open the
        // episode itself. Poll links open in Polls; other events open in Notes.
        boot = decoded.data.kind === PODCAST_EPISODE_KIND
          ? {
            appId: 'podcasts',
            params: withHints(
              isHexPubkey(decoded.data.author)
                ? { episode: decoded.data.id, show: decoded.data.author }
                : { episode: decoded.data.id },
              decoded.data.relays,
            ),
          }
          : {
            appId: decoded.data.kind === POLL_KIND ? 'polls' : 'notes',
            params: withHints({ id: decoded.data.id }, decoded.data.relays),
          };
        break;
      case 'naddr':
        boot = {
          appId: naddrApp(decoded.data.kind),
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
