import { createReadStream, promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DownloadError, validateDownload } from './config';
import { iteratePages } from './klines';
import { acquireExportLock } from './lock';
import { checkAbort, RequestContext } from './network';
import type { AnyKline, DownloadOptions, Market, OutputFormat } from './types';

export const SPOT_FIELDS = [
  'openTime',
  'open',
  'high',
  'low',
  'close',
  'volume',
  'closeTime',
  'quoteAssetVolume',
  'trades',
  'takerBaseAssetVolume',
  'takerQuoteAssetVolume',
  'ignored',
];
export const COIN_FIELDS = [
  'openTime',
  'open',
  'high',
  'low',
  'close',
  'volume',
  'closeTime',
  'baseAssetVolume',
  'trades',
  'takerVolume',
  'takerBaseAssetVolume',
  'ignored',
];
export const fieldsFor = (market: Market): string[] =>
  market === 'coin-m' ? COIN_FIELDS : SPOT_FIELDS;
export function csvRow(candle: AnyKline, market: Market): string {
  return fieldsFor(market)
    .map((key) => {
      const value = String(candle[key as keyof AnyKline]);
      return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    })
    .join(',');
}
interface Checkpoint {
  version: 1;
  fingerprint: string;
  referenceTime: number;
  cursor: number;
  count: number;
  offset: number;
  requests: number;
  retries: number;
  completed: boolean;
  replacedFile?: { size: number; mtimeMs: number };
  prefixHash: string;
}
export interface ExportOptions extends DownloadOptions<Market> {
  outputPath: string;
  format?: OutputFormat;
  resume?: boolean;
  overwrite?: boolean;
}
export interface ExportResult {
  pair: string;
  market: Market;
  outputPath: string;
  count: number;
  requests: number;
  retries: number;
  resumed: boolean;
  referenceTime: number;
}
async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}
async function writeAll(file: FileHandle, text: string): Promise<void> {
  const buffer = Buffer.from(text);
  let written = 0;
  while (written < buffer.length) {
    const result = await file.write(
      buffer,
      written,
      buffer.length - written,
      null,
    );
    if (result.bytesWritten === 0)
      throw new DownloadError('Unable to write export', 'IO_ERROR');
    written += result.bytesWritten;
  }
}
async function saveCheckpoint(
  path: string,
  checkpoint: Checkpoint,
): Promise<void> {
  const payload = JSON.stringify(checkpoint);
  const checksum = createHash('sha256').update(payload).digest('hex');
  const temp = `${path}.tmp`;
  const file = await fs.open(temp, 'w');
  try {
    await file.writeFile(JSON.stringify({ ...checkpoint, checksum }));
    await file.sync();
  } finally {
    await file.close();
  }
  await fs.rename(temp, path);
}

async function readHash(path: string, length: number, signal?: AbortSignal) {
  const hash = createHash('sha256');
  if (length > 0)
    for await (const chunk of createReadStream(path, {
      start: 0,
      end: length - 1,
      signal,
    }))
      hash.update(chunk);
  return hash;
}
async function hashPrefix(
  path: string,
  length: number,
  signal?: AbortSignal,
): Promise<string> {
  return (await readHash(path, length, signal)).digest('hex');
}

/** One page is made durable before its cursor is committed. Final files are never partial. */
export async function exportKlines(
  options: ExportOptions,
  context = new RequestContext(),
): Promise<ExportResult> {
  const config = validateDownload(options);
  checkAbort(options.signal);
  const format = options.format ?? 'json';
  if (format !== 'json' && format !== 'csv')
    throw new DownloadError('Invalid export format', 'INVALID_ARGUMENT');
  if (options.resume && options.overwrite)
    throw new DownloadError(
      '--resume and --overwrite are mutually exclusive',
      'INVALID_ARGUMENT',
    );
  const outputPath = resolve(options.outputPath);
  const partPath = `${outputPath}.part`;
  const checkpointPath = `${outputPath}.checkpoint.json`;
  const lockPath = `${outputPath}.lock`;
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        pair: config.pair,
        market: config.market,
        interval: config.interval,
        start: config.start,
        end: config.end,
        includeOpen: !!config.includeOpen,
        format,
      }),
    )
    .digest('hex');
  await fs.mkdir(dirname(outputPath), { recursive: true });
  const lock = await acquireExportLock(lockPath, !!options.resume);
  let file: FileHandle | undefined;
  let checkpoint: Checkpoint = {
    version: 1,
    fingerprint,
    referenceTime: config.referenceTime,
    cursor: config.start,
    count: 0,
    offset: 0,
    requests: 0,
    retries: 0,
    completed: false,
    prefixHash: createHash('sha256').digest('hex'),
  };
  let resumed = false;
  let hash = createHash('sha256');
  try {
    if (options.overwrite) {
      if (await exists(outputPath)) {
        const stat = await fs.stat(outputPath);
        checkpoint.replacedFile = { size: stat.size, mtimeMs: stat.mtimeMs };
      }
      // Keep an existing final export intact until its replacement is complete.
      await fs.rm(partPath, { force: true });
      await fs.rm(checkpointPath, { force: true });
    } else if (options.resume && (await exists(checkpointPath))) {
      try {
        const parsed = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
        const { checksum, ...payload } = parsed;
        if (
          createHash('sha256').update(JSON.stringify(payload)).digest('hex') !==
          checksum
        )
          throw new Error('Invalid checksum');
        checkpoint = payload as Checkpoint;
      } catch {
        throw new DownloadError('Unreadable checkpoint', 'INVALID_CHECKPOINT');
      }
      if (
        checkpoint.version !== 1 ||
        checkpoint.fingerprint !== fingerprint ||
        ![
          checkpoint.offset,
          checkpoint.cursor,
          checkpoint.count,
          checkpoint.referenceTime,
          checkpoint.requests,
          checkpoint.retries,
        ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        checkpoint.cursor < config.start ||
        checkpoint.cursor > config.end ||
        typeof checkpoint.completed !== 'boolean' ||
        typeof checkpoint.prefixHash !== 'string'
      ) {
        throw new DownloadError(
          'Checkpoint is incompatible with the requested export',
          'INVALID_CHECKPOINT',
        );
      }
      resumed = true;
      if (
        checkpoint.completed &&
        (await exists(outputPath)) &&
        (!(await exists(partPath)) ||
          ((await fs.stat(outputPath)).ino !== 0 &&
            (await fs.stat(outputPath)).ino === (await fs.stat(partPath)).ino &&
            (await fs.stat(outputPath)).dev === (await fs.stat(partPath)).dev))
      ) {
        const stat = await fs.stat(outputPath);
        if (
          stat.size !== checkpoint.offset ||
          (await hashPrefix(outputPath, checkpoint.offset, options.signal)) !==
            checkpoint.prefixHash
        )
          throw new DownloadError(
            'Completed file size does not match checkpoint',
            'INVALID_CHECKPOINT',
          );
        await fs.rm(partPath, { force: true });
        return {
          pair: config.pair,
          market: config.market,
          outputPath,
          count: checkpoint.count,
          requests: checkpoint.requests,
          retries: checkpoint.retries,
          resumed,
          referenceTime: checkpoint.referenceTime,
        };
      }
      if (await exists(outputPath)) {
        const stat = await fs.stat(outputPath);
        if (
          !checkpoint.replacedFile ||
          checkpoint.replacedFile.size !== stat.size ||
          checkpoint.replacedFile.mtimeMs !== stat.mtimeMs
        )
          throw new DownloadError(
            'Destination has changed since the export started',
            'DESTINATION_EXISTS',
          );
      }
      if (!(await exists(partPath)))
        throw new DownloadError(
          'Checkpoint data file is missing',
          'INVALID_CHECKPOINT',
        );
      const stat = await fs.stat(partPath);
      if (stat.size < checkpoint.offset)
        throw new DownloadError(
          'Partial file is shorter than its checkpoint',
          'INVALID_CHECKPOINT',
        );
      hash = await readHash(partPath, checkpoint.offset, options.signal);
      if (hash.copy().digest('hex') !== checkpoint.prefixHash)
        throw new DownloadError(
          'Partial file contents do not match checkpoint',
          'INVALID_CHECKPOINT',
        );
      file = await fs.open(partPath, 'a');
      await file.truncate(checkpoint.offset);
    } else {
      if (
        (await exists(outputPath)) ||
        (await exists(partPath)) ||
        (await exists(checkpointPath))
      )
        throw new DownloadError(
          'Destination exists; use --resume or --overwrite',
          'DESTINATION_EXISTS',
        );
    }
    if (!file) {
      file = await fs.open(partPath, 'wx');
      const header =
        format === 'json' ? '[' : `${fieldsFor(config.market).join(',')}\n`;
      await writeAll(file, header);
      await file.sync();
      checkpoint.offset = Buffer.byteLength(header);
      hash.update(header);
      checkpoint.prefixHash = hash.copy().digest('hex');
      await saveCheckpoint(checkpointPath, checkpoint);
    }
    if (!checkpoint.completed) {
      const initialCount = checkpoint.count;
      const initialRequests = checkpoint.requests;
      const initialRetries = checkpoint.retries;
      if (
        checkpoint.cursor <
        Math.min(
          config.end,
          checkpoint.referenceTime + (config.includeOpen ? 1 : 0),
        )
      ) {
        for await (const page of iteratePages(
          {
            ...options,
            startDate: new Date(checkpoint.cursor),
            referenceTime: checkpoint.referenceTime,
            onProgress: (p) =>
              options.onProgress?.({
                ...p,
                count: initialCount + p.count,
                requests: initialRequests + p.requests,
                retries: initialRetries + p.retries,
              }),
          },
          context,
        )) {
          checkAbort(options.signal);
          let text = '';
          if (format === 'csv')
            text = page.data
              .map((c) => `${csvRow(c, config.market)}\n`)
              .join('');
          else if (page.data.length)
            text = `${checkpoint.count ? ',' : ''}${page.data.map((c) => JSON.stringify(c)).join(',')}`;
          await writeAll(file, text);
          await file.sync();
          hash.update(text);
          checkpoint = {
            ...checkpoint,
            prefixHash: hash.copy().digest('hex'),
            cursor: page.nextCursor,
            count: checkpoint.count + page.data.length,
            offset: checkpoint.offset + Buffer.byteLength(text),
            requests: initialRequests + page.requests,
            retries: initialRetries + page.retries,
          };
          await saveCheckpoint(checkpointPath, checkpoint);
        }
      }
      checkAbort(options.signal);
      const footer = format === 'json' ? ']\n' : '';
      await writeAll(file, footer);
      await file.sync();
      hash.update(footer);
      checkpoint = {
        ...checkpoint,
        prefixHash: hash.copy().digest('hex'),
        offset: checkpoint.offset + Buffer.byteLength(footer),
        completed: true,
      };
      await saveCheckpoint(checkpointPath, checkpoint);
    }
    await file.close();
    file = undefined;
    if (checkpoint.replacedFile && (await exists(outputPath))) {
      const stat = await fs.stat(outputPath);
      if (
        stat.size !== checkpoint.replacedFile.size ||
        stat.mtimeMs !== checkpoint.replacedFile.mtimeMs
      )
        throw new DownloadError(
          'Destination changed during download',
          'DESTINATION_EXISTS',
        );
    }
    if (options.overwrite || checkpoint.replacedFile)
      await fs.rename(partPath, outputPath);
    else {
      // link is an atomic create-if-absent, unlike rename which silently replaces.
      await fs.link(partPath, outputPath);
      await fs.unlink(partPath);
    }
    return {
      pair: config.pair,
      market: config.market,
      outputPath,
      count: checkpoint.count,
      requests: checkpoint.requests,
      retries: checkpoint.retries,
      resumed,
      referenceTime: checkpoint.referenceTime,
    };
  } finally {
    await file?.close();
    await lock.close();
    await fs.rm(lockPath, { force: true });
  }
}
