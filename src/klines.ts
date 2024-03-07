import axios from 'axios';
import {
  BinanceInterval,
  BinanceResponse,
  BinanceResponseData,
  Kline,
} from './types';
import { calculateNumberOfCall, divideInterval } from './utils';

export async function getKline(
  pair: string,
  interval: BinanceInterval,
  startDate: Date,
  endDate: Date,
  source = 'api',
  version = 'v3',
  limit = 1000,
): Promise<Array<Kline>> {
  try {
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

    let data: Array<BinanceResponseData> = [];
    for (let i = 0; i < divisions.length; i++) {
      if (i + 1 !== divisions.length) {
        const start = divisions[i];
        const end = divisions[i + 1];
        const url = `https://${source}.binance.com/${source}/${version}/klines?symbol=${pair}&interval=${interval}&startTime=${start}&endTime=${end}&limit=${limit}`;
        console.log(url);
        const response: BinanceResponse = await axios.get(url);
        data = [...data, ...response.data];
      }
    }

    if (data.length) --data.length;
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
  } catch (error) {
    console.error(error);
    throw new Error('Error fetching klines');
  }
}
