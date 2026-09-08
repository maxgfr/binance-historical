import axios from 'axios';
import { DownloadError } from './config';

export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DownloadError('Download interrupted', 'ABORTED');
}
async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DownloadError('Download interrupted', 'ABORTED'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Shared by the workers of one batch, including all cooldowns. */
export class RequestContext {
  private nextAt = 0;
  private cooldown = 0;
  private banned?: DownloadError;

  async get(
    url: string,
    params: Record<string, string | number>,
    options: {
      timeoutMs?: number;
      maxRetries?: number;
      requestDelayMs?: number;
      signal?: AbortSignal;
      onRetry?: () => void;
    },
  ): Promise<unknown> {
    const { signal } = options;
    for (let attempt = 0; ; attempt++) {
      checkAbort(signal);
      if (this.banned) throw this.banned;
      for (;;) {
        const slot = Math.max(Date.now(), this.nextAt, this.cooldown);
        this.nextAt = slot + (options.requestDelayMs ?? 100);
        await wait(slot - Date.now(), signal);
        if (this.banned) throw this.banned;
        // Rebook slots invalidated by a concurrent rate-limit response.
        if (this.cooldown <= slot) break;
      }
      try {
        const response = await axios.get(url, {
          params,
          signal,
          timeout: options.timeoutMs ?? 30000,
        });
        return response.data;
      } catch (error) {
        checkAbort(signal);
        const e = error as {
          message?: string;
          code?: string;
          response?: {
            status: number;
            data?: { msg?: string; code?: number };
            headers?: Record<string, unknown>;
          };
        };
        const status = e.response?.status;
        const retryable =
          status === 429 ||
          (status !== undefined && status >= 500) ||
          [
            'ECONNRESET',
            'ECONNABORTED',
            'ETIMEDOUT',
            'EAI_AGAIN',
            'ENOTFOUND',
            'ERR_NETWORK',
          ].includes(e.code ?? '');
        const failure = new DownloadError(
          e.response?.data?.msg || e.message || 'Binance request failed',
          status === 418
            ? 'BANNED'
            : status === 429
              ? 'RATE_LIMITED'
              : 'NETWORK_ERROR',
          retryable,
          status,
          e.response?.data?.code,
        );
        if (status === 418) {
          this.banned = failure;
          throw failure;
        }
        const retryAfter = e.response?.headers?.['retry-after'];
        let waitMs = Math.min(30000, 1000 * 2 ** attempt);
        if (retryAfter !== undefined) {
          const seconds = Number(retryAfter);
          const headerMs = Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(String(retryAfter)) - Date.now();
          if (Number.isFinite(headerMs)) waitMs = Math.max(waitMs, headerMs);
        }
        if (status === 429)
          this.cooldown = Math.max(this.cooldown, Date.now() + waitMs);
        if (!retryable || attempt >= (options.maxRetries ?? 3)) throw failure;
        options.onRetry?.();
        await wait(waitMs, signal);
      }
    }
  }
}
