import type { BinanceInterval, Kline, OutputFormat } from './types';

import fs = require('fs');

const convertToCSV = (klines: Array<Kline>): string => {
  const headers = [
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
  ].join(',');

  const rows = klines.map((kline) =>
    [
      kline.openTime,
      kline.open,
      kline.high,
      kline.low,
      kline.close,
      kline.volume,
      kline.closeTime,
      kline.quoteAssetVolume,
      kline.trades,
      kline.takerBaseAssetVolume,
      kline.takerQuoteAssetVolume,
      kline.ignored,
    ].join(','),
  );

  return [headers, ...rows].join('\n');
};

export const saveKline = (
  fileName: string,
  jsonArray: Array<Kline>,
  format: OutputFormat = 'json',
): void => {
  const content =
    format === 'csv' ? convertToCSV(jsonArray) : JSON.stringify(jsonArray, null, 2);

  const dir = fileName.substring(0, fileName.lastIndexOf('/'));
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fileName, content);
};

export const formatDate = (date: Date, withHour = false): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  return withHour
    ? `${year}-${month}-${day} ${hour}:${minute}:${second}`
    : `${year}-${month}-${day}`;
};

export function intervalToSeconds(interval: BinanceInterval): number {
  switch (interval) {
    case '1m':
      return 60;
    case '3m':
      return 180;
    case '5m':
      return 300;
    case '15m':
      return 900;
    case '30m':
      return 1800;
    case '1h':
      return 3600;
    case '2h':
      return 7200;
    case '4h':
      return 14400;
    case '6h':
      return 21600;
    case '8h':
      return 28800;
    case '12h':
      return 43200;
    case '1d':
      return 86400;
    case '3d':
      return 259200;
    case '1w':
      return 604800;
    default:
      return 0;
  }
}

export function calculateNumberOfCall(
  interval: BinanceInterval,
  startTime: number,
  endTime: number,
): number {
  const intervalSeconds = intervalToSeconds(interval);
  const start = Math.floor(startTime / intervalSeconds) * intervalSeconds;
  const end = Math.floor(endTime / intervalSeconds) * intervalSeconds;
  const diff = end - start;
  const optimal = Math.ceil(diff / intervalSeconds);
  const result = Math.ceil(optimal / 1000);
  if (isNaN(result)) {
    return 0;
  }
  return result;
}

export function divideInterval(
  numberOfDivisions: number,
  startDate: number,
  endDate: number,
): Array<number> {
  const interval = (endDate - startDate) / numberOfDivisions;
  const divisions = [];
  for (let i = 0; i < numberOfDivisions; i++) {
    divisions.push(Math.round(startDate + interval * i));
  }
  divisions.push(endDate);
  return divisions;
}
