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
});
