import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  DownloadError,
  normalizePair,
  parseDate,
  validateDownload,
} from './config';
import { exportKlines } from './export';
import { isStaleLock } from './lock';
import { RequestContext } from './network';
import { completeOptions } from './cli-input';
import type { CliOptions } from './cli-input';
import type {
  BinanceInterval,
  DownloadOptions,
  KlineKind,
  Market,
  OutputFormat,
  Progress,
} from './types';

export interface ErrorReport {
  code: string;
  message: string;
  retryable: boolean;
  httpStatus?: number;
  binanceCode?: number;
}
interface ResultReport {
  pair: string;
  market: Market;
  status: 'success' | 'error';
  outputPath: string;
  count?: number;
  requests?: number;
  retries?: number;
  resumed?: boolean;
  referenceTime?: number;
  resumable: boolean;
  error?: ErrorReport;
}
export interface RunReport {
  schemaVersion: 1;
  status: 'success' | 'error';
  results: ResultReport[];
  error?: ErrorReport;
}
export function errorReport(error: unknown): ErrorReport {
  if (error instanceof DownloadError)
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      httpStatus: error.status,
      binanceCode: error.binanceCode,
    };
  const e = error as NodeJS.ErrnoException;
  return {
    code: e?.code || 'IO_ERROR',
    message: e?.message || String(error),
    retryable: false,
  };
}
export function outputName(
  market: Market,
  pair: string,
  interval: string,
  start: Date,
  end: Date,
  format: OutputFormat,
  kind: KlineKind = 'trade',
): string {
  const stamp = (date: Date) => date.toISOString().replace(/:/g, '-');
  // 1m and 1M would share a file on case-insensitive filesystems.
  const name = interval === '1M' ? '1mo' : interval;
  const prefix = kind === 'trade' ? market : `${market}-${kind}`;
  return `${prefix}_${pair}_${name}_${stamp(start)}_${stamp(end)}.${format}`;
}
export interface ProgressState {
  start: number;
  end: number;
  first?: { at: number; count: number; cursor: number };
  printedAt?: number;
}
function duration(seconds: number): string {
  const s = Math.ceil(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
/** Rates are measured from the pair's first event, so resumed candles do not inflate them. */
export function formatProgress(
  pair: string,
  progress: Progress,
  state: ProgressState,
  now = Date.now(),
): string {
  const { count, cursor } = progress;
  const first = (state.first ??= { at: now, count, cursor });
  const span = state.end - state.start;
  const percent =
    span > 0 ? Math.min(100, (100 * (cursor - state.start)) / span) : 100;
  let text = `${pair}: ${percent.toFixed(1)}%, ${count} candles, through ${new Date(cursor).toISOString()}`;
  const seconds = (now - first.at) / 1000;
  if (seconds > 0) {
    text += `, ${Math.round((count - first.count) / seconds)}/s`;
    const speed = (cursor - first.cursor) / seconds;
    if (speed > 0)
      text += `, ETA ${duration(Math.max(0, state.end - cursor) / speed)}`;
  }
  return `${text}, ${progress.retries} retries`;
}
export async function download(
  options: CliOptions,
  signal: AbortSignal,
): Promise<RunReport> {
  options = await completeOptions(options);
  const pairs = [
    ...new Set(
      (options.pairs ?? options.pair ?? '').split(',').map(normalizePair),
    ),
  ];
  const market = options.market as Market;
  const format = options.format as OutputFormat;
  const referenceTime = Date.now();
  const common: Omit<DownloadOptions<Market, KlineKind>, 'pair'> = {
    market,
    kind: options.kind as KlineKind,
    interval: options.interval as BinanceInterval,
    startDate: parseDate(options.start as string),
    endDate: parseDate(options.end as string),
    includeOpen: !!options.includeOpen,
    referenceTime,
    timeoutMs: Number(options.timeout),
    maxRetries: Number(options.maxRetries),
    requestDelayMs: Number(options.requestDelay),
    baseUrl: options.baseUrl,
    signal,
  };
  pairs.forEach((pair) => validateDownload({ ...common, pair }));
  const output = resolve(options.output as string);
  const results: ResultReport[] = new Array(pairs.length);
  const context = new RequestContext();
  let next = 0;
  const progress = new Map<string, ProgressState>();
  const worker = async () => {
    while (next < pairs.length) {
      const index = next++;
      const pair = pairs[index];
      const outputPath = join(
        output,
        outputName(
          market,
          pair,
          common.interval,
          common.startDate,
          common.endDate,
          format,
          common.kind,
        ),
      );
      try {
        const result = await exportKlines(
          {
            ...common,
            pair,
            format,
            outputPath,
            resume: options.resume,
            overwrite: options.overwrite,
            onProgress: (p) => {
              if (options.json || !process.stderr.isTTY) return;
              let state = progress.get(pair);
              if (!state)
                progress.set(
                  pair,
                  (state = {
                    start: common.startDate.getTime(),
                    end: Math.min(common.endDate.getTime(), referenceTime),
                  }),
                );
              const now = Date.now();
              const line = formatProgress(pair, p, state, now);
              if (now - (state.printedAt ?? 0) < 1000) return;
              state.printedAt = now;
              process.stderr.write(`${line}\n`);
            },
          },
          context,
        );
        results[index] = { ...result, status: 'success', resumable: false };
      } catch (error) {
        const detail = errorReport(error);
        const hasCheckpoint = await fs
          .access(`${outputPath}.checkpoint.json`)
          .then(
            () => true,
            () => false,
          );
        // A writer killed without cleanup leaves a lock that --resume recovers.
        const staleLock =
          detail.code === 'EXPORT_LOCKED' &&
          hasCheckpoint &&
          (await isStaleLock(`${outputPath}.lock`));
        if (staleLock)
          detail.message = `Export is locked by a dead local writer: ${outputPath}.lock. Rerun with --resume to recover it`;
        const resumable =
          staleLock ||
          (!['INVALID_CHECKPOINT', 'EXPORT_LOCKED'].includes(detail.code) &&
            hasCheckpoint);
        results[index] = {
          pair,
          market,
          outputPath,
          status: 'error',
          resumable,
          error: detail,
        };
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(Number(options.concurrency), pairs.length) },
      worker,
    ),
  );
  return {
    schemaVersion: 1,
    status: results.every((r) => r.status === 'success') ? 'success' : 'error',
    results,
  };
}
