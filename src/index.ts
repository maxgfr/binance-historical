#!/usr/bin/env node
export type {
  Kline,
  CoinMKline,
  AnyKline,
  Market,
  MarketKline,
  BinanceInterval,
  DownloadOptions,
  Progress,
  OutputFormat,
} from './types';
export { getKline, getKlines, iterateKlines } from './klines';
export { exportKlines } from './export';
export type { ExportOptions, ExportResult } from './export';
export { DownloadError } from './config';

if (require.main === module) {
  import('./cli')
    .then(({ runCommand }) => runCommand())
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
