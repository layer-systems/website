import { useNostr } from "@nostrify/react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useCurrentUser } from "./useCurrentUser";
import { getPow } from "@/lib/pow";
import { minePowInWorker } from "@/lib/powMiner";

import type { NostrEvent } from "@nostrify/nostrify";

/** Optional NIP-13 proof of work, mined in a worker before signing. */
export interface PublishPow {
  difficulty: number;
  signal?: AbortSignal;
  onProgress?: (hashes: number) => void;
}

type EventTemplate = Pick<NostrEvent, 'kind' | 'content'> &
  Partial<Pick<NostrEvent, 'tags' | 'created_at'>> & {
    pow?: PublishPow;
  };

export function useNostrPublish(): UseMutationResult<
  NostrEvent,
  Error,
  EventTemplate
> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async (t: EventTemplate) => {
      if (user) {
        const tags = t.tags ?? [];

        // Add the client tag if it doesn't exist
        if (location.protocol === "https:" && !tags.some(([name]) => name === "client")) {
          tags.push(["client", location.hostname]);
        }

        let template = {
          kind: t.kind,
          content: t.content ?? "",
          tags,
          created_at: t.created_at ?? Math.floor(Date.now() / 1000),
        };

        // Mine before signing so the signer is only asked once, and with the
        // exact tags/created_at that produce the target id.
        if (t.pow && t.pow.difficulty > 0) {
          const { kind, content, tags, created_at } = await minePowInWorker(
            { ...template, pubkey: user.pubkey },
            t.pow.difficulty,
            { signal: t.pow.signal, onProgress: t.pow.onProgress },
          );
          template = { kind, content, tags, created_at };
        }

        const event = await user.signer.signEvent(template);

        if (t.pow && t.pow.difficulty > 0 && getPow(event.id) < t.pow.difficulty) {
          throw new Error("The signer altered the event, so its proof of work no longer holds.");
        }

        await nostr.event(event, { signal: AbortSignal.timeout(5000) });
        return event;
      } else {
        throw new Error("User is not logged in");
      }
    },
    onError: (error) => {
      console.error("Failed to publish event:", error);
    },
    onSuccess: (data) => {
      console.log("Event published successfully:", data);
    },
  });
}