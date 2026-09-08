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
export type BinanceResponse = { data: BinanceResponseData[] };
export type OutputFormat = 'json' | 'csv';
export type PromptResult = {
  pair: string;
  interval: BinanceInterval;
  startDate: Date;
  endDate: Date;
  fileName: string;
  format: OutputFormat;
};

export interface Progress {
  pair: string;
  cursor: number;
  count: number;
  requests: number;
  retries: number;
}
export interface DownloadOptions<M extends Market = 'spot'> {
  pair: string;
  interval: BinanceInterval;
  startDate: Date;
  endDate: Date;
  market?: M;
  limit?: number;
  includeOpen?: boolean;
  /** Fixed reference instant; defaults to the start of the call. */
  referenceTime?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Minimum spacing between request starts; defaults to 100 ms. */
  requestDelayMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
}
