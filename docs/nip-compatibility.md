# NIP compatibility checks

These tests check specific application behaviors against Nostr specifications. They
are **partial conformance checks**, not certification or a claim to implement every
NIP. A passing parser test does not prove relay interoperability or correct UI behavior.

## Specification baseline

The new checks use the official `nostr-protocol/nips` repository at commit
[`b587c619c2ea662d40b40976aeccf6ac8d6ba9eb`](https://github.com/nostr-protocol/nips/tree/b587c619c2ea662d40b40976aeccf6ac8d6ba9eb).
Links below are immutable. Existing regression tests listed separately have not all
been audited against this baseline. Third-party protocols are outside this baseline.

## Run and interpret

```sh
npm install
npm run test:nips  # focused checks, verbose output with requirement IDs
npm run test      # required gate: TypeScript, ESLint, ALL tests, production build
```

The pull-request workflow shows separate steps for TypeScript, ESLint, NIP checks,
other unit/component tests, and the production build. `npm run test` runs the same
checks locally. `test:unit` excludes `src/test/nips/**`, so the NIP checks run once
in their own step, with verbose requirement IDs. No live relay, wallet, signer extension, real key,
or payment is required. An assertion failure identifies a broken checked behavior;
an absent test is an open coverage gap, not a passing requirement.

Tests call production functions and the actual identifier route. Desktop and 404
views are replaced in route tests. NIP-51 signer methods are mocked: we check the
encryption scheme, recipient and plaintext contract, not cryptographic correctness.
Synthetic event fixtures have placeholder signatures and are used only below the
signature-verification boundary. No signed-event validation claim follows from them.

## Requirements checked by the focused suite

All rows are **partial**. IDs appear in test names and verbose output. Defensive
handling of malformed data and privacy choices are explicitly labeled app policy;
they are not additional normative requirements imposed on other clients.

| NIP / source | Checked requirements and test IDs | Tests | Remaining gaps |
|---|---|---|---|
| [01](https://github.com/nostr-protocol/nips/blob/b587c619c2ea662d40b40976aeccf6ac8d6ba9eb/01.md) | Latest revision by timestamp, lowest lexical ID on ties (`01-REV`); mined event hash uses canonical UTF-8 serialization (`13-HASH`) | [core](../src/test/nips/core.test.ts) | Signature verification, filter matching, addressable-coordinate grouping, WebSocket protocol and relay storage semantics. `newestEvent` assumes its caller already selected one coordinate. |
| [10](https://github.com/nostr-protocol/nips/blob/b587c619c2ea662d40b40976aeccf6ac8d6ba9eb/10.md) | Direct reply has only root marker; nested reply keeps root and parent; positional fallback; q citations are not replies (`10-DIRECT`, `10-NESTED`, `10-LEGACY`, `10-QUOTE`) | [core](../src/test/nips/core.test.ts) | Complete notification-tag propagation, non-kind-1 replies and rendering. |
| [13](https://github.com/nostr-protocol/nips/blob/b587c619c2ea662d40b40976aeccf6ac8d6ba9eb/13.md) | Replaces stale nonce, commits target, independently recomputes SHA-256; published 36-bit vector; credit capped by actual work and commitment (`13-HASH`, `13-VECTOR`, `13-COMMIT`) | [core](../src/test/nips/core.test.ts) | Worker cancellation/progress and complete mining/signing/publishing flow. |
| [18](https://github.com/nostr-protocol/nips/blob/b587c619c2ea662d40b40976aeccf6ac8d6ba9eb/18.md) | Kind 6 for kind-1 notes, kind 16 with `k` tag otherwise; `e` tag with relay URL, `p` tag and stringified content; `a` tag for addressable targets; empty content for NIP-70 protected events; incoming kind/`k` mismatch policy (`18-KIND`, `18-REF`, `18-ADDRESS`, `18-PROTECTED`, `18-MATCH`) | [core](../src/test/nips/core.test.ts) | Quote reposts (`q` tags), rendering reposts in feeds, and validating embedded content against the referenced id. |
| [19](https://github.com/nostr-protocol/nips/blob/b587c619c2ea662d40b40976aeccf6ac8d6ba9eb/19.md) | Published npub vector; note/nprofile/nevent/naddr route parameters and relay hints; reject private/malformed/unsupported identifiers; list share address preserves author/kind/d (`19-VECTOR`, `19-ROUTE`, `19-REJECT`, `19-ADDRESS`) | [routing](../src/test/nips/routing.test.tsx), [lists](../src/test/nips/lists.test.ts) | Complete TLV vectors, unknown TLVs, query author constraints downstream of routing. Generated identifiers test app wiring; the published npub vector is an independent decoding oracle. |
| [40](https://github.com/nostr-protocol/nips/blob/b587c619c2ea662d40b40976aeccf6ac8d6ba9eb/40.md) | Unix-second expiration before/at/after now; no expiration; invalid timestamp policy (`40-TIME`, `40-ABSENT`, `40-INVALID`) | [core](../src/test/nips/core.test.ts) | Provider-level rejection, expiry while already displayed, supported_nips discovery before sending expiring events. |
| [51](https://github.com/nostr-protocol/nips/blob/b587c619c2ea662d40b40976aeccf6ac8d6ba9eb/51.md) | Standard vs. set identity; public items in tags; private tag-array JSON encrypted to self with NIP-44; legacy NIP-04 dispatch; unknown metadata preservation; locked/malformed data policy (`51-IDENTITY`, `51-PUBLIC`, `51-ENCRYPT`, `51-DECRYPT`, `51-LEGACY`, `51-INVALID`, `51-LOCKED`) | [lists](../src/test/nips/lists.test.ts) | All list-kind schemas, real encryption test vectors, remote signers and cross-client fixtures. Existing mutation tests cover additional data-loss safeguards. |
| [65](https://github.com/nostr-protocol/nips/blob/b587c619c2ea662d40b40976aeccf6ac8d6ba9eb/65.md) | Reads the specification's relay-list example; emits read/write/both markers; duplicate/invalid-tag policy (`65-READ`, `65-WRITE`, `65-MERGE`, `65-INVALID`) | [relay lists](../src/test/nips/relayLists.test.ts) | Full outbox/mention routing and dissemination recommendations. Current parser only accepts wss URLs; this is an app restriction, not a NIP-65 requirement. |
| [89](https://github.com/nostr-protocol/nips/blob/b587c619c2ea662d40b40976aeccf6ac8d6ba9eb/89.md) | Optional name-only client attribution and preservation of supplied handler reference; opt-out/private-kind policy (`89-NAME`, `89-EXISTING`, `89-PRIVACY`) | [core](../src/test/nips/core.test.ts) | Handler discovery and recommendation events (31989/31990) are not covered or claimed as implemented. |

## Existing coverage and feature inventory

This is a source-level inventory of the main protocol features, not an exhaustive
audit of transitive library support. **Regression only** means tests exercise related
behavior but have not been mapped requirement by requirement to the pinned NIP.
**Open** means no dedicated conformance coverage was identified for that feature.
These tests run with `npm run test`, not the focused `test:nips` command.

| NIP / feature | Existing evidence | Coverage status / next work |
|---|---|---|
| 02 follow lists | `src/hooks/useFollows.ts`, `src/lib/queryFollowList.ts` | Open: complete list replacement, author filtering and preservation of contact metadata. |
| 05 identity | `src/hooks/useNip05.ts` | Open: well-known response validation and matching hex key. |
| 07 / 46 signers | `src/hooks/useLoginActions.test.tsx` | Regression only: real extension/remote-signer contracts remain open. |
| 09 deletion | List/bookmark deletion paths in `src/hooks/` | Open: authorized deletion targets and relay behavior. |
| 11 relay information | `src/lib/nip86.test.ts`, `src/apps/relays/RelayDetailsDialog.tsx` | Regression only / open: discovery headers and malformed information documents. |
| 18 reposts | `src/lib/reposts.ts`, `src/hooks/useReposts.ts`, `src/hooks/useNotifications.ts` | Partial: outgoing reposts are checked in the focused suite; notification-side validation remains open. |
| 21 nostr URIs | `src/components/nostr/NoteContent.tsx` | Open: URI tokenization and navigation. |
| 22 comments | `src/components/nostr/EventComments.tsx` | Open: uppercase root/lowercase parent scope tags. |
| 23 articles | `src/apps/articles/index.tsx` | Open: addressable lookup, metadata and revision selection. |
| 25 reactions | `src/hooks/useReactions.test.ts` | Regression only: summary counts; outgoing reference tags remain open. |
| 42 relay auth | `src/components/NostrProvider.tsx` | Open: challenge, relay URL, timestamp and signed AUTH response. |
| 44 / legacy 04 encryption | Focused `51-*` checks use mocked signer methods | Contract coverage only: cryptographic vectors remain open. |
| 47 wallet connect | `src/lib/nwc.test.ts` | Regression only: URI parsing; encrypted request/response interoperability remains open. |
| 50 search | `src/apps/search/searchUtils.test.ts` | Regression only: local parsing; relay search behavior remains open. |
| 51 list writes | `src/hooks/useNip51Lists.test.tsx`, `src/hooks/useMuteList.test.tsx` | Regression only beyond focused suite: incomplete reads and private-item preservation. |
| 52 calendar | `src/lib/calendarEvents.test.ts` | Regression only: parsing, exclusive ends and date keys; complete schema/revision conformance remains open. |
| 53 live events | `src/apps/live/` | Open: live-event metadata and chat references. |
| 56 reports | `src/hooks/useReport.ts` | Open: reporting targets and report types. |
| 57 zaps | `src/lib/zapInvoice.test.ts`, `src/lib/zapReceipts.test.ts`, `src/hooks/useCreateZapInvoice.test.tsx`, `src/hooks/useZaps.test.ts` | Regression only: request/invoice binding and signed receipt validation; real LNURL/wallet round-trip remains open. |
| 65 relay lookup | `src/lib/relayListSync.test.ts`, `src/hooks/useRelayList.test.tsx` | Regression only beyond focused parser/serializer checks: safe relay-list editing; independent lookup/routing tests remain open. |
| 84 highlights | `src/hooks/useHighlights.ts` | Open: excerpt and source tags. |
| 86 / 98 relay management and HTTP auth | `src/lib/nip86.test.ts`, `src/hooks/useNip86.test.tsx` | Regression only: request/auth payload, capability gating, response validation; independent signed auth vectors remain open. |
| 88 polls | `src/lib/polls.ts`, `src/hooks/usePolls.ts` | Open: no dedicated tests yet for first-tag single choice, distinct multiple choice, latest valid in-range response per pubkey, or relay targeting. |
| 92 / 68 images | `src/lib/picturePosts.test.ts` | Regression only: imeta image order and safe URLs; full kind-20 schema remains open. |
| F4 podcasts / 51 podcast lists | `src/lib/podcasts.ts`, `src/apps/podcasts/`, `nevent` kind-54 route in [routing](../src/test/nips/routing.test.tsx) | Open: no dedicated parser tests yet for kind 10154/54 validation, newest-metadata selection or 10064 attribution. 10064 is used over the 10164 in F4's prose; see [NIP.md](../NIP.md). |
| B0 web bookmarks | `src/hooks/useWebBookmarks.test.ts` | Regression only: URL-based identifiers; complete NIP-B0 schema remains open. |
| Third-party workouts and Spells | `src/lib/workouts.test.ts`, `src/hooks/useSpells.test.ts` | Separate regression coverage; see [NIP.md](../NIP.md). Outside this official-NIP baseline. |

## Extending the suite

1. Read the relevant NIP at the pinned revision. Distinguish MUST/SHOULD/MAY and
   application policy; test only behavior this client intends to provide.
2. Add a named requirement ID, production entry point, independent expected output,
   and useful negative cases. Avoid using the app's encoder as the only oracle for
   its decoder. Never use real private keys or payment credentials.
3. Add the requirement, source, test path and remaining gaps to this matrix.
4. Run the focused suite, then `npm run test`. Keep all checks deterministic.

To update the specification baseline, review the upstream diff for each checked NIP,
change the pinned commit and links together, and adjust the tests deliberately.
Tests do not fetch a moving `master` branch during CI.

Next priorities are provider-level NIP-01/40/42 tests, signed publishing contracts,
and a separate integration suite against a controlled local relay. A local-relay
suite is **not included** here; unit tests deliberately disable WebSocket connections.
Cross-client fixtures and periodic manual interop checks are still necessary to
support broader compatibility claims. No percentage is reported because there is
no complete, agreed denominator of supported requirements yet.
