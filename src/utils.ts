import { BinanceInterval } from './types';

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
      return null;
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
    return null;
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
