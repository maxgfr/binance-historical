import axios from 'axios';
import { getKline, getKlines, iterateKlines } from '../klines';
import { parseDate, windowEnd } from '../config';
import type { DownloadOptions, KlineKind, Market } from '../types';

jest.mock('axios');
const http = axios as jest.Mocked<typeof axios>;
const start = Date.UTC(2024, 0, 1);
export const row = (time: number, step = 60000) => [
  time,
  '1',
  '2',
  '0.5',
  '1.5',
  '10',
  time + step - 1,
  '15',
  2,
  '5',
  '7.5',
  '0',
];
const options: DownloadOptions = {
  pair: 'BTCUSDT',
  interval: '1m',
  startDate: new Date(start),
  endDate: new Date(start + 120000),
  requestDelayMs: 0,
};

describe('historical client', () => {
  beforeEach(() => jest.resetAllMocks());
  it('preserves every valid candle through the legacy signature', async () => {
    http.get.mockResolvedValue({ data: [row(start), row(start + 60000)] });
    expect(
      (await getKline('BTCUSDT', '1m', options.startDate, options.endDate)).map(
        (k) => k.openTime,
      ),
    ).toEqual([start, start + 60000]);
  });
  it.each([999, 1000, 1001, 2000, 2001])(
    'returns exactly %i candles over page boundaries',
    async (count) => {
      http.get.mockImplementation(async (_url, config) => {
        const { startTime, endTime, limit } = config!.params;
        const length = Math.min(
          limit,
          Math.floor((endTime - startTime) / 60000) + 1,
        );
        return {
          data: Array.from({ length }, (_, i) => row(startTime + i * 60000)),
        };
      });
      const result = await getKlines({
        ...options,
        endDate: new Date(start + count * 60000),
      });
      expect(result).toHaveLength(count);
      expect(new Set(result.map((c) => c.openTime)).size).toBe(count);
      expect(result.at(-1)?.openTime).toBe(start + (count - 1) * 60000);
      expect(http.get).toHaveBeenCalledTimes(Math.ceil(count / 1000));
    },
  );
  it('sorts, deduplicates and filters exclusive bounds', async () => {
    http.get.mockResolvedValue({
      data: [
        row(start + 60000),
        row(start),
        row(start),
        row(start - 60000),
        row(start + 120000),
      ],
    });
    expect((await getKlines(options)).map((c) => c.openTime)).toEqual([
      start,
      start + 60000,
    ]);
  });
  it('advances across an empty window instead of assuming the symbol never existed', async () => {
    http.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [row(start + 60000)] });
    expect(await getKlines({ ...options, limit: 1 })).toHaveLength(1);
    expect(http.get.mock.calls[1][1]?.params.startTime).toBe(start + 60000);
  });
  it('filters forming candles using a fixed reference time', async () => {
    http.get.mockResolvedValue({ data: [row(start), row(start + 60000)] });
    expect(
      await getKlines({ ...options, referenceTime: start + 90000 }),
    ).toHaveLength(1);
    expect(
      await getKlines({
        ...options,
        referenceTime: start + 90000,
        includeOpen: true,
      }),
    ).toHaveLength(2);
  });
  it.each(['spot', 'usd-m', 'coin-m'] as Market[])(
    'selects the %s endpoint and volume schema',
    async (market) => {
      http.get.mockResolvedValue({ data: [row(start)] });
      const [result] = await getKlines({ ...options, market });
      expect(http.get.mock.calls[0][0]).toContain(
        market === 'spot'
          ? '/api/v3/klines'
          : market === 'usd-m'
            ? '/fapi/v1/klines'
            : '/dapi/v1/klines',
      );
      if (market === 'coin-m') {
        expect(result).toMatchObject({
          baseAssetVolume: '15',
          takerVolume: '5',
          takerBaseAssetVolume: '7.5',
        });
        expect(result).not.toHaveProperty('quoteAssetVolume');
      } else
        expect(result).toMatchObject({
          quoteAssetVolume: '15',
          takerBaseAssetVolume: '5',
          takerQuoteAssetVolume: '7.5',
        });
    },
  );
  it('uses a custom base URL without a trailing slash', async () => {
    http.get.mockResolvedValue({ data: [row(start)] });
    await getKlines({
      ...options,
      baseUrl: 'https://api.binance.us/api/v3/',
    });
    expect(http.get.mock.calls[0][0]).toBe(
      'https://api.binance.us/api/v3/klines',
    );
  });
  it('caps COIN-M windows at 200 days', async () => {
    http.get.mockResolvedValue({ data: [] });
    await getKlines({
      ...options,
      market: 'coin-m',
      interval: '1d',
      endDate: new Date(start + 401 * 86400000),
    });
    expect(http.get).toHaveBeenCalledTimes(3);
    for (const [, config] of http.get.mock.calls)
      expect(config!.params.endTime - config!.params.startTime).toBeLessThan(
        200 * 86400000,
      );
  });
  it('handles monthly windows without assuming 30 days', () => {
    expect(windowEnd(Date.UTC(2024, 0, 1), '1M', 2)).toBe(Date.UTC(2024, 2, 1));
    expect(windowEnd(Date.UTC(2024, 0, 31), '1M', 1)).toBe(
      Date.UTC(2024, 2, 1),
    );
  });
  it('does not request future-only periods', async () => {
    expect(await getKlines({ ...options, referenceTime: start - 1 })).toEqual(
      [],
    );
    expect(http.get).not.toHaveBeenCalled();
  });
  it.each([
    { startDate: new Date('invalid') },
    { endDate: new Date(start) },
    { pair: '../BTC' },
    { interval: '2w' },
    { limit: 0 },
    { limit: 1001 },
    { timeoutMs: 0 },
    { market: 'bad' },
    { market: 'coin-m', interval: '1s' },
    { baseUrl: 'ftp://x' },
    { kind: 'mark' },
    { market: 'usd-m', kind: 'last' },
    { baseUrl: 'not a url' },
  ])('rejects invalid input %j before network', async (change) => {
    await expect(
      getKlines({ ...options, ...change } as DownloadOptions),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(http.get).not.toHaveBeenCalled();
  });
  it.each([
    '2024-02-30',
    '2023-02-29',
    '01-02-2024',
    '2024-01-01T12:00:00',
    '2024-01-01T25:00:00Z',
  ])('rejects ambiguous or invalid date %s', (date) =>
    expect(() => parseDate(date)).toThrow(),
  );
  it('parses UTC dates and explicit offsets', () => {
    expect(parseDate('2024-02-29').toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
    expect(parseDate('2024-01-01T01:00:00+01:00').getTime()).toBe(start);
  });
  it.each([{}, [[1]], [row(start).map((v, i) => (i === 1 ? 'NaN' : v))]])(
    'rejects malformed response %j',
    async (data) => {
      http.get.mockResolvedValue({ data });
      await expect(getKlines(options)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    },
  );
  it('stops a lazy iterator without fetching additional pages', async () => {
    http.get.mockResolvedValue({ data: [row(start)] });
    for await (const kline of iterateKlines({ ...options, limit: 1 })) {
      expect(kline.openTime).toBe(start);
      break;
    }
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it('supports cancellation before HTTP', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      getKlines({ ...options, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    expect(http.get).not.toHaveBeenCalled();
  });
});

describe('calendar pagination', () => {
  beforeEach(() => jest.resetAllMocks());
  it('retrieves all monthly COIN-M candles when the server selects the most recent rows', async () => {
    const rows = [1, 2, 3].map((month) => {
      const candle = row(Date.UTC(2024, month, 1));
      candle[6] = Date.UTC(2024, month + 1, 1) - 1;
      return candle;
    });
    http.get.mockImplementation(async (_url, config) => {
      const { startTime, endTime, limit } = config!.params;
      return {
        data: rows
          .filter((r) => Number(r[0]) >= startTime && Number(r[0]) <= endTime)
          .slice(-limit),
      };
    });
    const result = await getKlines({
      ...options,
      market: 'coin-m',
      interval: '1M',
      limit: 1,
      startDate: new Date('2024-01-31T12:00:00Z'),
      endDate: new Date('2024-05-01T00:00:00Z'),
    });
    expect(result.map((c) => c.openTime)).toEqual(rows.map((r) => r[0]));
    expect(http.get).toHaveBeenCalledTimes(3);
  });
});

describe('empty range seeking', () => {
  beforeEach(() => jest.resetAllMocks());
  const minute = 60000;
  const listed = start + 5000 * minute;
  const serve = () =>
    http.get.mockImplementation(async (_url, config) => {
      const { startTime, endTime, limit } = config!.params;
      const data = [];
      for (
        let t = Math.max(startTime, listed);
        t <= (endTime ?? Infinity) && data.length < limit;
        t += minute
      )
        data.push(row(t));
      return { data };
    });
  it.each(['spot', 'usd-m'] as Market[])(
    'jumps to the first %s candle with one probe instead of empty pages',
    async (market) => {
      serve();
      const result = await getKlines({
        ...options,
        market,
        endDate: new Date(start + 7000 * minute),
      });
      expect(result).toHaveLength(2000);
      expect(result[0].openTime).toBe(listed);
      expect(result.at(-1)?.openTime).toBe(start + 6999 * minute);
      expect(http.get).toHaveBeenCalledTimes(4);
      expect(http.get.mock.calls[1][1]?.params).toEqual({
        symbol: 'BTCUSDT',
        interval: '1m',
        startTime: start + 1000 * minute,
        limit: 1,
      });
    },
  );
  it('stops at once when the probe finds no later candle', async () => {
    http.get.mockResolvedValue({ data: [] });
    const progress = jest.fn();
    expect(
      await getKlines({
        ...options,
        endDate: new Date(start + 7000 * minute),
        onProgress: progress,
      }),
    ).toEqual([]);
    expect(http.get).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: start + 7000 * minute, requests: 2 }),
    );
  });
  it('never probes COIN-M, whose responses are anchored to endTime', async () => {
    serve();
    const result = await getKlines({
      ...options,
      market: 'coin-m',
      endDate: new Date(start + 7000 * minute),
    });
    expect(result).toHaveLength(2000);
    expect(http.get).toHaveBeenCalledTimes(7);
    for (const [, config] of http.get.mock.calls)
      expect(config!.params.endTime).toBeDefined();
  });
});

describe('price kline kinds', () => {
  beforeEach(() => jest.resetAllMocks());
  const priceRow = (t: number) => [
    t,
    '-0.00054796',
    '0.00049602',
    '-0.00130507',
    '-0.00037572',
    '0',
    t + 59999,
    '0',
    7068,
    '0',
    '0',
    '0',
  ];
  it.each(
    (['usd-m', 'coin-m'] as Market[]).flatMap((market) =>
      (['mark', 'index', 'premium'] as KlineKind[]).map((kind) => [
        market,
        kind,
      ]),
    ),
  )(
    'requests %s %s klines and maps price-only candles',
    async (market, kind) => {
      http.get.mockResolvedValue({ data: [priceRow(start)] });
      const [candle] = await getKlines({ ...options, market, kind });
      const [url, config] = http.get.mock.calls[0];
      const root = market === 'usd-m' ? '/fapi/v1/' : '/dapi/v1/';
      const endpoint = {
        mark: 'markPriceKlines',
        index: 'indexPriceKlines',
        premium: 'premiumIndexKlines',
      }[kind as 'mark'];
      expect(url).toContain(`${root}${endpoint}`);
      expect(config!.params).toMatchObject(
        kind === 'index' ? { pair: 'BTCUSDT' } : { symbol: 'BTCUSDT' },
      );
      expect(config!.params).not.toHaveProperty(
        kind === 'index' ? 'symbol' : 'pair',
      );
      expect(candle).toEqual({
        openTime: start,
        open: '-0.00054796',
        high: '0.00049602',
        low: '-0.00130507',
        close: '-0.00037572',
        closeTime: start + 59999,
      });
    },
  );
  it('still rejects malformed price rows', async () => {
    http.get.mockResolvedValue({
      data: [priceRow(start).map((v, i) => (i === 2 ? 'NaN' : v))],
    });
    await expect(
      getKlines({ ...options, market: 'usd-m', kind: 'mark' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('does not probe empty ranges for price kinds', async () => {
    http.get.mockResolvedValue({ data: [] });
    await getKlines({
      ...options,
      market: 'usd-m',
      kind: 'mark',
      endDate: new Date(start + 3000 * 60000),
    });
    expect(http.get).toHaveBeenCalledTimes(3);
  });
});
