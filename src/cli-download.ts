import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  DownloadError,
  normalizePair,
  parseDate,
  validateDownload,
} from './config';
import { exportKlines } from './export';
import { RequestContext } from './network';
import { completeOptions } from './cli-input';
import type { CliOptions } from './cli-input';
import type {
  BinanceInterval,
  DownloadOptions,
  Market,
  OutputFormat,
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
): string {
  const stamp = (date: Date) => date.toISOString().replace(/:/g, '-');
  return `${market}_${pair}_${interval}_${stamp(start)}_${stamp(end)}.${format}`;
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
  const common: Omit<DownloadOptions<Market>, 'pair'> = {
    market,
    interval: options.interval as BinanceInterval,
    startDate: parseDate(options.start as string),
    endDate: parseDate(options.end as string),
    includeOpen: !!options.includeOpen,
    referenceTime,
    signal,
  };
  pairs.forEach((pair) => validateDownload({ ...common, pair }));
  const output = resolve(options.output as string);
  const results: ResultReport[] = new Array(pairs.length);
  const context = new RequestContext();
  let next = 0;
  const started = Date.now();
  const lastUpdate = new Map<string, number>();
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
              if (
                !options.json &&
                process.stderr.isTTY &&
                Date.now() - (lastUpdate.get(pair) ?? 0) > 500
              ) {
                lastUpdate.set(pair, Date.now());
                const seconds = Math.max(1, (Date.now() - started) / 1000);
                process.stderr.write(
                  `${pair}: ${p.count} candles, through ${new Date(p.cursor).toISOString()}, ${Math.round(p.count / seconds)}/s, ${p.retries} retries\n`,
                );
              }
            },
          },
          context,
        );
        results[index] = { ...result, status: 'success', resumable: false };
      } catch (error) {
        const detail = errorReport(error);
        const resumable =
          !['INVALID_CHECKPOINT', 'EXPORT_LOCKED'].includes(detail.code) &&
          (await fs.access(`${outputPath}.checkpoint.json`).then(
            () => true,
            () => false,
          ));
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
