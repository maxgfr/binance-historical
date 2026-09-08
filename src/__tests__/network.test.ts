import axios from 'axios';
import { RequestContext } from '../network';

jest.mock('axios');
const http = axios as jest.Mocked<typeof axios>;
describe('request resilience', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());
  it('retries transient failures and preserves the request parameters', async () => {
    http.get
      .mockRejectedValueOnce({ code: 'ECONNRESET' })
      .mockResolvedValueOnce({ data: [] });
    const retry = jest.fn();
    const promise = new RequestContext().get(
      'https://example.com',
      { symbol: 'BTCUSDT' },
      { onRetry: retry },
    );
    await jest.advanceTimersByTimeAsync(1000);
    expect(await promise).toEqual([]);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(http.get.mock.calls[0]).toEqual(http.get.mock.calls[1]);
  });
  it('honors Retry-After', async () => {
    http.get
      .mockRejectedValueOnce({
        response: {
          status: 429,
          headers: { 'retry-after': '3' },
          data: { msg: 'slow down' },
        },
      })
      .mockResolvedValueOnce({ data: [] });
    const promise = new RequestContext().get('https://example.com', {}, {});
    await jest.advanceTimersByTimeAsync(2999);
    expect(http.get).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await promise;
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it('exhausts retries and retains the Binance error', async () => {
    http.get.mockRejectedValue({
      response: { status: 503, data: { code: -1000, msg: 'Unavailable' } },
    });
    const promise = new RequestContext().get('https://example.com', {}, {});
    const assertion = expect(promise).rejects.toMatchObject({
      status: 503,
      binanceCode: -1000,
      message: 'Unavailable',
      retryable: true,
    });
    await jest.advanceTimersByTimeAsync(7000);
    await assertion;
    expect(http.get).toHaveBeenCalledTimes(4);
  });
  it('does not retry invalid symbols or bans', async () => {
    const context = new RequestContext();
    http.get.mockRejectedValue({
      response: { status: 418, data: { msg: 'Banned' } },
    });
    await expect(
      context.get('https://example.com', {}, {}),
    ).rejects.toMatchObject({ code: 'BANNED' });
    await expect(
      context.get('https://example.com', {}, {}),
    ).rejects.toMatchObject({ code: 'BANNED' });
    expect(http.get).toHaveBeenCalledTimes(1);
    http.get.mockRejectedValue({
      response: { status: 400, data: { code: -1121, msg: 'Invalid symbol' } },
    });
    await expect(
      new RequestContext().get('https://example.com', {}, {}),
    ).rejects.toMatchObject({ binanceCode: -1121, retryable: false });
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it('cancels during backoff', async () => {
    http.get.mockRejectedValue({ code: 'ETIMEDOUT' });
    const controller = new AbortController();
    const promise = new RequestContext().get(
      'https://example.com',
      {},
      { signal: controller.signal },
    );
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'ABORTED',
    });
    await jest.advanceTimersByTimeAsync(1);
    controller.abort();
    await assertion;
    expect(http.get).toHaveBeenCalledTimes(1);
  });
});

describe('shared rate limits', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());
  it('preserves request spacing after a shared 429 cooldown', async () => {
    const times: number[] = [];
    http.get.mockImplementation(async () => {
      times.push(Date.now());
      if (times.length === 1)
        throw { response: { status: 429, headers: { 'retry-after': '3' } } };
      return { data: [] };
    });
    const context = new RequestContext();
    const work = Promise.all([
      context.get('https://example.com', {}, {}),
      context.get('https://example.com', {}, {}),
    ]);
    await jest.advanceTimersByTimeAsync(4000);
    await work;
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(3000);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(100);
  });
});
