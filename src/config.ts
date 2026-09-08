import type { BinanceInterval, DownloadOptions, Market } from './types';

export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable = false,
    public readonly status?: number,
    public readonly binanceCode?: number,
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}
export const INTERVALS: BinanceInterval[] = [
  '1s',
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M',
];
export const MARKETS: Record<
  Market,
  {
    baseUrl: string;
    maxLimit: number;
    windowMs: number;
    intervals: BinanceInterval[];
  }
> = {
  spot: {
    baseUrl: 'https://api.binance.com/api/v3',
    maxLimit: 1000,
    windowMs: Infinity,
    intervals: INTERVALS,
  },
  'usd-m': {
    baseUrl: 'https://fapi.binance.com/fapi/v1',
    maxLimit: 1500,
    windowMs: Infinity,
    intervals: INTERVALS.filter((i) => i !== '1s'),
  },
  'coin-m': {
    baseUrl: 'https://dapi.binance.com/dapi/v1',
    maxLimit: 1500,
    windowMs: 200 * 86400000,
    intervals: INTERVALS.filter((i) => i !== '1s'),
  },
};
export function invalid(message: string): never {
  throw new DownloadError(message, 'INVALID_ARGUMENT');
}

export function normalizePair(pair: string): string {
  if (typeof pair !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(pair.trim()))
    invalid('Pair must contain only letters, digits or underscores');
  return pair.trim().toUpperCase();
}

/** A strict calendar parser: date-only is UTC; timestamps require Z or an offset. */
export function parseDate(value: string): Date {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(
      value,
    );
  if (!match)
    invalid(
      `Invalid date "${value}". Use YYYY-MM-DD or ISO 8601 with timezone`,
    );
  const [, y, m, d, h, min, sec] = match;
  const days = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  if (
    +m < 1 ||
    +m > 12 ||
    +d < 1 ||
    +d > days ||
    +(h || 0) > 23 ||
    +(min || 0) > 59 ||
    +(sec || 0) > 59
  )
    invalid(`Invalid calendar date "${value}"`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalid(`Invalid date "${value}"`);
  return date;
}
export function validateDownload<M extends Market>(
  options: DownloadOptions<M>,
) {
  const market: Market = options.market ?? 'spot';
  if (!Object.prototype.hasOwnProperty.call(MARKETS, market))
    invalid(`Unknown market "${market}"`);
  const adapter = MARKETS[market];
  if (!adapter.intervals.includes(options.interval))
    invalid(`Invalid interval "${options.interval}" for ${market}`);
  const pair = normalizePair(options.pair);
  const start =
    options.startDate instanceof Date ? options.startDate.getTime() : NaN;
  const end = options.endDate instanceof Date ? options.endDate.getTime() : NaN;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < 0 ||
    start >= end
  )
    invalid('Start and end must be valid dates, with start before end');
  const limit = options.limit ?? 1000;
  if (!Number.isInteger(limit) || limit < 1 || limit > adapter.maxLimit)
    invalid(`Limit must be between 1 and ${adapter.maxLimit}`);
  const referenceTime = options.referenceTime ?? Date.now();
  if (!Number.isSafeInteger(referenceTime) || referenceTime < 0)
    invalid('Invalid referenceTime');
  for (const [name, value, minimum] of [
    ['timeoutMs', options.timeoutMs ?? 30000, 1],
    ['maxRetries', options.maxRetries ?? 3, 0],
    ['requestDelayMs', options.requestDelayMs ?? 100, 0],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum)
      invalid(`Invalid ${name}`);
  }
  return {
    ...options,
    market,
    adapter,
    pair,
    start,
    end,
    limit,
    referenceTime,
  };
}

export function intervalMilliseconds(interval: BinanceInterval): number {
  const unit = interval.slice(-1);
  const scale = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return Number(interval.slice(0, -1)) * scale[unit as keyof typeof scale];
}

/** At most limit opens fit in this half-open window, even for unaligned starts. */
export function windowEnd(
  start: number,
  interval: BinanceInterval,
  limit: number,
): number {
  if (interval === '1M') {
    const date = new Date(start);
    const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + limit + (start > monthStart ? 1 : 0),
      1,
    );
  }
  return start + intervalMilliseconds(interval) * limit;
}
