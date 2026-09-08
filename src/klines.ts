import { DownloadError, validateDownload, windowEnd } from './config';
import { checkAbort, RequestContext } from './network';
import type {
  AnyKline,
  BinanceInterval,
  BinanceResponseData,
  DownloadOptions,
  Kline,
  Market,
  MarketKline,
} from './types';

const DECIMAL = /^\d+(?:\.\d+)?$/;
const DECIMAL_COLUMNS = [1, 2, 3, 4, 5, 7, 9, 10, 11];

function validateRows(data: unknown): BinanceResponseData[] {
  if (!Array.isArray(data))
    throw new DownloadError(
      'Binance returned a non-array response',
      'INVALID_RESPONSE',
    );
  for (const row of data) {
    if (
      !Array.isArray(row) ||
      row.length !== 12 ||
      !Number.isSafeInteger(row[0]) ||
      row[0] < 0 ||
      !Number.isSafeInteger(row[6]) ||
      row[6] < row[0] ||
      !Number.isSafeInteger(row[8]) ||
      row[8] < 0 ||
      DECIMAL_COLUMNS.some(
        (i) => typeof row[i] !== 'string' || !DECIMAL.test(row[i]),
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
function mapRow(row: BinanceResponseData, market: Market): AnyKline {
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
  data: AnyKline[];
  nextCursor: number;
  requests: number;
  retries: number;
}

/** Internal page seam used by the durable exporter. */
export async function* iteratePages(
  options: DownloadOptions<Market>,
  context = new RequestContext(),
  baseUrl?: string,
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
  while (cursor < end) {
    checkAbort(options.signal);
    const nextCursor = Math.min(
      end,
      windowEnd(cursor, config.interval, config.limit),
      cursor + config.adapter.windowMs,
    );
    const raw = await context.get(
      `${baseUrl ?? config.adapter.baseUrl}/klines`,
      {
        symbol: config.pair,
        interval: config.interval,
        startTime: cursor,
        endTime: nextCursor - 1,
        limit: config.limit,
      },
      {
        ...options,
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
      },
    );
    requests++;
    const rows = validateRows(raw);
    if (rows.length > config.limit)
      throw new DownloadError(
        'Binance exceeded the requested page limit',
        'INVALID_RESPONSE',
      );
    rows.sort((a, b) => a[0] - b[0]);
    const data: AnyKline[] = [];
    for (const row of rows) {
      if (row[0] < cursor || row[0] >= nextCursor || row[0] <= lastOpen)
        continue;
      lastOpen = row[0];
      if (!config.includeOpen && row[6] >= config.referenceTime) continue;
      data.push(mapRow(row, config.market));
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

export async function* iterateKlines<M extends Market = 'spot'>(
  options: DownloadOptions<M>,
): AsyncGenerator<MarketKline<M>> {
  for await (const page of iteratePages(options)) {
    for (const candle of page.data) {
      checkAbort(options.signal);
      yield candle as MarketKline<M>;
    }
  }
}
export async function getKlines<M extends Market = 'spot'>(
  options: DownloadOptions<M>,
): Promise<MarketKline<M>[]> {
  const result: MarketKline<M>[] = [];
  for await (const page of iteratePages(options)) {
    for (const candle of page.data) result.push(candle as MarketKline<M>);
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
  for await (const page of iteratePages(
    { pair, interval, startDate, endDate, limit },
    new RequestContext(),
    `https://${source}.binance.com/${source}/${version}`,
  )) {
    for (const candle of page.data) result.push(candle as Kline);
  }
  return result;
}
