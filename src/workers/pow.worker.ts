import { mineChunk, type PowTemplate } from '@/lib/pow';

export interface PowRequest {
  template: PowTemplate;
  difficulty: number;
}

export type PowResponse =
  | { type: 'progress'; hashes: number }
  | { type: 'done'; hashes: number; event: PowTemplate & { id: string } };

const CHUNK = 20_000;

/**
 * NIP-13 miner. Runs chunks back to back and reports progress between them;
 * cancelling is done by the main thread terminating the worker. `created_at`
 * is refreshed per chunk so a long mine doesn't publish a stale timestamp.
 */
self.onmessage = (message: MessageEvent<PowRequest>) => {
  const { template, difficulty } = message.data;
  let nonce = 0;

  for (;;) {
    const created_at = Math.floor(Date.now() / 1000);
    const result = mineChunk({ ...template, created_at }, difficulty, nonce, CHUNK);
    if (result.event) {
      self.postMessage({ type: 'done', hashes: result.nonce, event: result.event } satisfies PowResponse);
      return;
    }
    nonce = result.nonce;
    self.postMessage({ type: 'progress', hashes: nonce } satisfies PowResponse);
  }
};
