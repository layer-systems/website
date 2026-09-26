import type { PowTemplate } from '@/lib/pow';
import type { PowRequest, PowResponse } from '@/workers/pow.worker';

/**
 * Mines `template` to `difficulty` bits in a Web Worker so the UI stays
 * responsive. Aborting `signal` terminates the worker and rejects with an
 * `AbortError`.
 */
export function minePowInWorker(
  template: PowTemplate,
  difficulty: number,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (hashes: number) => void } = {},
): Promise<PowTemplate & { id: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Mining cancelled', 'AbortError'));
      return;
    }

    const worker = new Worker(new URL('../workers/pow.worker.ts', import.meta.url), { type: 'module' });

    const onAbort = () => {
      worker.terminate();
      reject(new DOMException('Mining cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };

    worker.onmessage = (message: MessageEvent<PowResponse>) => {
      const data = message.data;
      if (data.type === 'progress') {
        onProgress?.(data.hashes);
      } else {
        finish();
        onProgress?.(data.hashes);
        resolve(data.event);
      }
    };
    worker.onerror = (error) => {
      finish();
      reject(new Error(error.message || 'Proof-of-work miner failed'));
    };

    worker.postMessage({ template, difficulty } satisfies PowRequest);
  });
}
