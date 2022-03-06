import { getKline } from '../klines';

describe('klines', () => {
  test('Fetch max length', async () => {
    const result = await getKline(
      'ETHUSDT',
      '4h',
      new Date('01-09-2020'),
      new Date('01-12-2021'),
    );
    expect(result.length).toBeGreaterThan(2200);
  });

  test('Fetch for one year', async () => {
    const result = await getKline(
      'ETHUSDT',
      '1d',
      new Date('01-09-2020'),
      new Date('01-09-2021'),
    );
    expect(result.length).toBe(366);
  });

  test('Fetch for one day', async () => {
    const result = await getKline(
      'ETHUSDT',
      '1d',
      new Date('01-09-2021'),
      new Date('01-10-2021'),
    );
    expect(result).toStrictEqual([
      {
        close: '1276.00000000',
        closeTime: 1610236799999,
        high: '1304.37000000',
        ignored: '0',
        low: '1171.36000000',
        open: '1216.72000000',
        openTime: 1610150400000,
        quoteAssetVolume: '1780137376.41646950',
        takerBaseAssetVolume: '746369.69680000',
        takerQuoteAssetVolume: '918333130.76833010',
        trades: 1131871,
        volume: '1448871.11514000',
      },
    ]);
  });
});
