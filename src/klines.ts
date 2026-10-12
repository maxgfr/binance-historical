import { DownloadError, KINDS, validateDownload, windowEnd } from './config';
import { checkAbort, RequestContext } from './network';
import type {
  AnyKline,
  BinanceInterval,
  BinanceResponseData,
  DownloadOptions,
  Kline,
  KlineFor,
  KlineKind,
  Market,
  PriceKline,
} from './types';

export type Candle = AnyKline | PriceKline;

const DECIMAL = /^\d+(?:\.\d+)?$/;
const DECIMAL_COLUMNS = [1, 2, 3, 4, 5, 7, 9, 10, 11];
/** Premium index prices can be negative. */
const SIGNED = /^-?\d+(?:\.\d+)?$/;
const PRICE_COLUMNS = [1, 2, 3, 4];

function validateRows(data: unknown, kind: KlineKind): BinanceResponseData[] {
  if (!Array.isArray(data))
    throw new DownloadError(
      'Binance returned a non-array response',
      'INVALID_RESPONSE',
    );
  const trade = kind === 'trade';
  for (const row of data) {
    if (
      !Array.isArray(row) ||
      (trade ? row.length !== 12 : row.length < 7) ||
      !Number.isSafeInteger(row[0]) ||
      row[0] < 0 ||
      !Number.isSafeInteger(row[6]) ||
      row[6] < row[0] ||
      (trade && (!Number.isSafeInteger(row[8]) || row[8] < 0)) ||
      (trade ? DECIMAL_COLUMNS : PRICE_COLUMNS).some(
        (i) =>
          typeof row[i] !== 'string' ||
          !(trade ? DECIMAL : SIGNED).test(row[i]),
      )
    ) {
      throw new DownloadError(
        'Binance returned a malformed candle',
        'INVALID_RESPONSE',
      );
    }
  }
  return data as BinanceResponseData[];
}
function mapRow(
  row: BinanceResponseData,
  market: Market,
  kind: KlineKind,
): Candle {
  if (kind !== 'trade')
    return {
      openTime: row[0],
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
      closeTime: row[6],
    };
  return market === 'coin-m'
    ? {
        openTime: row[0],
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        volume: row[5],
        closeTime: row[6],
        baseAssetVolume: row[7],
        trades: row[8],
        takerVolume: row[9],
        takerBaseAssetVolume: row[10],
        ignored: row[11],
      }
    : {
        openTime: row[0],
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        volume: row[5],
        closeTime: row[6],
        quoteAssetVolume: row[7],
        trades: row[8],
        takerBaseAssetVolume: row[9],
        takerQuoteAssetVolume: row[10],
        ignored: row[11],
      };
}
export interface Page {
  data: Candle[];
  nextCursor: number;
  requests: number;
  retries: number;
}

/** Internal page seam used by the durable exporter. */
export async function* iteratePages(
  options: DownloadOptions<Market, KlineKind>,
  context = new RequestContext(),
): AsyncGenerator<Page> {
  const config = validateDownload(options);
  let cursor = config.start;
  const end = Math.min(
    config.end,
    config.referenceTime + (config.includeOpen ? 1 : 0),
  );
  let count = 0;
  let requests = 0;
  let retries = 0;
  let lastOpen = -1;
  const { endpoint, param } = KINDS[config.kind];
  const url = `${config.baseUrl}/${endpoint}`;
  // The budget of another host (binance.us allows 1200) is unknown: rely on 429s.
  const weightLimit =
    config.baseUrl === config.adapter.baseUrl
      ? config.adapter.weightLimit
      : undefined;
  const request = (params: Record<string, string | number>) =>
    context.get(url, params, {
      ...options,
      weightLimit,
      onRetry: () => {
        retries++;
        requests++;
        options.onProgress?.({
          pair: config.pair,
          count,
          cursor,
          requests,
          retries,
        });
      },
    });
  while (cursor < end) {
    checkAbort(options.signal);
    let nextCursor = Math.min(
      end,
      windowEnd(cursor, config.interval, config.limit),
      cursor + config.adapter.windowMs,
    );
    const raw = await request({
      [param]: config.pair,
      interval: config.interval,
      startTime: cursor,
      endTime: nextCursor - 1,
      limit: config.limit,
    });
    requests++;
    const rows = validateRows(raw, config.kind);
    if (rows.length > config.limit)
      throw new DownloadError(
        'Binance exceeded the requested page limit',
        'INVALID_RESPONSE',
      );
    rows.sort((a, b) => a[0] - b[0]);
    const data: Candle[] = [];
    for (const row of rows) {
      if (row[0] < cursor || row[0] >= nextCursor || row[0] <= lastOpen)
        continue;
      lastOpen = row[0];
      if (!config.includeOpen && row[6] >= config.referenceTime) continue;
      data.push(mapRow(row, config.market, config.kind));
    }
    // Before a listing or after a delisting, one probe replaces every empty page.
    if (
      !rows.length &&
      config.adapter.seekable &&
      config.kind === 'trade' &&
      windowEnd(nextCursor, config.interval, config.limit) < end
    ) {
      const [first] = validateRows(
        await request({
          symbol: config.pair,
          interval: config.interval,
          startTime: nextCursor,
          limit: 1,
        }),
        config.kind,
      );
      requests++;
      nextCursor = first ? Math.min(end, Math.max(nextCursor, first[0])) : end;
    }
    count += data.length;
    yield { data, nextCursor, requests, retries };
    cursor = nextCursor;
    options.onProgress?.({
      pair: config.pair,
      count,
      cursor,
      requests,
      retries,
    });
  }
}

export async function* iterateKlines<
  M extends Market = 'spot',
  K extends KlineKind = 'trade',
>(options: DownloadOptions<M, K>): AsyncGenerator<KlineFor<M, K>> {
  for await (const page of iteratePages(options)) {
    for (const candle of page.data) {
      checkAbort(options.signal);
      yield candle as KlineFor<M, K>;
    }
  }
}
export async function getKlines<
  M extends Market = 'spot',
  K extends KlineKind = 'trade',
>(options: DownloadOptions<M, K>): Promise<KlineFor<M, K>[]> {
  const result: KlineFor<M, K>[] = [];
  for await (const page of iteratePages(options)) {
    for (const candle of page.data) result.push(candle as KlineFor<M, K>);
  }
  return result;
}
/** Legacy Spot signature retained; dates now consistently use an exclusive end. */
export async function getKline(
  pair: string,
  interval: BinanceInterval,
  startDate: Date,
  endDate: Date,
  source = 'api',
  version = 'v3',
  limit = 1000,
): Promise<Kline[]> {
  if (!/^[a-z][a-z0-9-]*$/.test(source) || !/^v\d+$/.test(version))
    throw new DownloadError('Invalid source or version', 'INVALID_ARGUMENT');
  const result: Kline[] = [];
  for await (const page of iteratePages({
    pair,
    interval,
    startDate,
    endDate,
    limit,
    baseUrl: `https://${source}.binance.com/${source}/${version}`,
  })) {
    for (const candle of page.data) result.push(candle as Kline);
  }
  return result;
}
