import axios from 'axios';
import { BinanceInterval, Kline } from './types';
import { calculateNumberOfCall, divideInterval } from './utils';

export async function getKline(
  pair: string,
  interval: BinanceInterval,
  startDate: Date,
  endDate: Date,
  limit = 1000,
): Promise<Array<Kline>> {
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error('Start date must be before end date');
  }
  const numberOfCall = calculateNumberOfCall(
    interval,
    startDate.getTime(),
    endDate.getTime(),
  );
  const numOfIterations = Math.ceil(numberOfCall / limit);
  const divisions = divideInterval(
    numOfIterations,
    startDate.getTime(),
    endDate.getTime(),
  );

  let data: Array<string | number> = [];
  for (let i = 0; i < divisions.length; i++) {
    if (i + 1 !== divisions.length) {
      const start = divisions[i];
      const end = divisions[i + 1];
      const url = `https://api.binance.com/api/v1/klines?symbol=${pair}&interval=${interval}&startTime=${start}&endTime=${end}&limit=${limit}`;
      const response = await axios.get(url);
      data = [...data, ...response.data];
    }
  }

  return data.map((item) => ({
    openTime: item[0],
    open: item[1],
    high: item[2],
    low: item[3],
    close: item[4],
    volume: item[5],
    closeTime: item[6],
    quoteAssetVolume: item[7],
    trades: item[8],
    takerBaseAssetVolume: item[9],
    takerQuoteAssetVolume: item[10],
    ignored: item[11],
  }));
}
