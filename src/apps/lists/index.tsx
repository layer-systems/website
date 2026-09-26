import { useCallback, useEffect } from 'react';
import { EmptyState } from '@/components/os/AppChrome';
import { LoginRequired } from '@/components/nostr/LoginRequired';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isSetKind, listKindInfo, LEGACY_GENERIC_KIND } from '@/lib/nip51';
import { displayName } from '@/lib/nostrUtils';
import type { AppProps } from '@/os/types';
import { ListDetail } from './ListDetail';
import { Overview } from './Overview';

const PUBKEY_RE = /^[0-9a-f]{64}$/;

/**
 * NIP-51 lists. Params: `pubkey` (whose lists; defaults to the signed-in
 * user), and `kind` plus `identifier` (for sets) to open one list. Other
 * people's lists are read-only and show only their public items.
 */
export default function ListsApp({ params, setParams, setTitle }: AppProps) {
  const { user } = useCurrentUser();
  const pubkey = params.pubkey && PUBKEY_RE.test(params.pubkey) ? params.pubkey : user?.pubkey;
  const owner = Boolean(user && user.pubkey === pubkey);
  const author = useAuthor(pubkey);
  const ownerName = pubkey ? displayName(pubkey, author.data?.metadata) : '';

  const kind = params.kind ? Number(params.kind) : undefined;
  const validKind = kind !== undefined && (Boolean(listKindInfo(kind)) || kind === LEGACY_GENERIC_KIND || kind === 30000);

  useEffect(() => {
    setTitle(owner || !pubkey ? 'Lists' : `Lists — ${ownerName}`);
  }, [owner, ownerName, pubkey, setTitle]);

  const openList = useCallback(
    (nextKind: number, nextPubkey: string, identifier?: string) => {
      const next: Record<string, string> = { kind: String(nextKind) };
      if (nextPubkey !== user?.pubkey) next.pubkey = nextPubkey;
      if (isSetKind(nextKind)) next.identifier = identifier ?? '';
      setParams(next);
    },
    [setParams, user?.pubkey],
  );

  const back = useCallback(() => {
    setParams(pubkey && pubkey !== user?.pubkey ? { pubkey } : {});
  }, [pubkey, setParams, user?.pubkey]);

  if (!pubkey) {
    return <LoginRequired action="manage your lists" />;
  }

  if (kind !== undefined) {
    if (!validKind) {
      return <EmptyState title="Unsupported list" hint={`Kind ${params.kind} isn’t a NIP-51 list this app understands.`} />;
    }
    return (
      <ListDetail
        pubkey={pubkey}
        kind={kind}
        identifier={params.identifier}
        onBack={back}
        onOpenList={openList}
      />
    );
  }

  return <Overview pubkey={pubkey} owner={owner} ownerName={ownerName} onOpenList={openList} />;
}
