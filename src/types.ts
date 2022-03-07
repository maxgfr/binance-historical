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

export type BinanceInterval =
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
  | '1w';

export type BinanceResponse = { data: BinanceResponseData[] };

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

export type PromptResult = {
  pair: string;
  interval: BinanceInterval;
  startDate: Date;
  endDate: Date;
  fileName: string;
};
