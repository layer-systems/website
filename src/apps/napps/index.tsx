import { useEffect, useMemo } from 'react';
import { decodeRelayHints, encodeRelayHints } from '@/lib/nostrUtils';
import { isNsiteKind, NSITE_ROOT_KIND, type NsitePointer } from '@/lib/nsites';
import type { AppParams, AppProps } from '@/os/types';
import { Directory } from './Directory';
import { Runner } from './Runner';

/**
 * The site in the window's parameters, if they name one validly. The same
 * `kind`/`pubkey`/`identifier`/`relays` shape an `naddr` deep link produces.
 */
function pointerFromParams(params: AppParams): NsitePointer | undefined {
  const kind = Number(params.kind);
  const pubkey = params.pubkey?.toLowerCase();
  const identifier = params.identifier ?? '';
  if (!isNsiteKind(kind) || !pubkey || !/^[0-9a-f]{64}$/.test(pubkey)) return undefined;
  if (kind === NSITE_ROOT_KIND ? identifier !== '' : identifier === '') return undefined;
  return { kind, pubkey, identifier, relays: decodeRelayHints(params.relays) };
}

function paramsFor(pointer: NsitePointer): AppParams {
  const params: AppParams = { kind: String(pointer.kind), pubkey: pointer.pubkey };
  if (pointer.identifier) params.identifier = pointer.identifier;
  const hints = encodeRelayHints(pointer.relays);
  if (hints) params.relays = hints;
  return params;
}

/**
 * Nostr-hosted web apps. Lists NIP-5A nsites and nostrapps napps, and runs
 * nsites in a window through a NIP-5A gateway, each on its own origin.
 * `params` names the open site; without them the app shows the directory.
 */
export default function NappsApp({ windowId, params, setParams, setTitle }: AppProps) {
  const pointer = useMemo(() => pointerFromParams(params), [params]);

  useEffect(() => {
    if (!pointer) setTitle('Napps');
  }, [pointer, setTitle]);

  if (pointer) {
    return (
      <Runner
        key={`${pointer.kind}:${pointer.pubkey}:${pointer.identifier}`}
        windowId={windowId}
        pointer={pointer}
        setTitle={setTitle}
        onBack={() => setParams({})}
      />
    );
  }

  return <Directory onOpen={(next) => setParams(paramsFor(next))} />;
}
