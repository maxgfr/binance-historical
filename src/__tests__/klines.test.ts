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
    expect(result.length).toBeGreaterThan(360);
    expect(result.length).toBeLessThan(370);
  });

  test('Fetch for one day', async () => {
    const result = await getKline(
      'ETHUSDT',
      '1d',
      new Date('01-09-2021'),
      new Date('01-10-2021'),
    );
    expect(result).toHaveLength(1);
  });
});
