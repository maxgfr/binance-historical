export type Kline = {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  trades: number;
  takerBaseAssetVolume: string;
  takerQuoteAssetVolume: string;
  ignored: string;
};

/** COIN-M volumes are contracts and base assets, not quote asset volumes. */
export type CoinMKline = Omit<
  Kline,
  'quoteAssetVolume' | 'takerBaseAssetVolume' | 'takerQuoteAssetVolume'
> & {
  baseAssetVolume: string;
  takerVolume: string;
  takerBaseAssetVolume: string;
};
export type Market = 'spot' | 'usd-m' | 'coin-m';
export type MarketKline<M extends Market> = M extends 'coin-m'
  ? CoinMKline
  : Kline;
export type AnyKline = Kline | CoinMKline;
/** trade klines carry volumes; mark, index and premium klines (futures only) carry prices. */
export type KlineKind = 'trade' | 'mark' | 'index' | 'premium';
export type PriceKline = Pick<
  Kline,
  'openTime' | 'open' | 'high' | 'low' | 'close' | 'closeTime'
>;
export type KlineFor<
  M extends Market,
  K extends KlineKind = 'trade',
> = K extends 'trade' ? MarketKline<M> : PriceKline;
export type BinanceInterval =
  | '1s'
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M';
export type BinanceResponseData = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];
export type OutputFormat = 'json' | 'csv' | 'jsonl';

export interface Progress {
  pair: string;
  cursor: number;
  count: number;
  requests: number;
  retries: number;
}
export interface DownloadOptions<
  M extends Market = 'spot',
  K extends KlineKind = 'trade',
> {
  /** Symbol; for index klines, the underlying pair (BTCUSDT, BTCUSD). */
  pair: string;
  interval: BinanceInterval;
  startDate: Date;
  endDate: Date;
  market?: M;
  /** Defaults to trade; other kinds exist only on usd-m and coin-m. */
  kind?: K;
  limit?: number;
  includeOpen?: boolean;
  /** Fixed reference instant; defaults to the start of the call. */
  referenceTime?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Minimum spacing between request starts; defaults to 100 ms. */
  requestDelayMs?: number;
  /** Replaces the market's REST root, e.g. https://api.binance.us/api/v3. */
  baseUrl?: string;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
}
