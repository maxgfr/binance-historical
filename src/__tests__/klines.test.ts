import { getKline } from '../klines';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('klines', () => {
  test('Fetch max length', async () => {
    mockedAxios.get.mockResolvedValue({
      data: Array(2200).fill([
        1578524400000,
        '100.0',
        '200.0',
        '50.0',
        '150.0',
        '1000.0',
        1589151600000,
        '100000.0',
        100,
        '1000.0',
        '100000.0',
        '1000.0',
      ]),
    });
    const result = await getKline(
      'ETHUSDT',
      '4h',
      new Date('01-09-2020'),
      new Date('01-12-2021'),
    );
    expect(result.length).toBeGreaterThan(2200);
  });

  test('Fetch for one year', async () => {
    mockedAxios.get.mockResolvedValue({
      data: Array(365).fill([
        1578524400000,
        '100.0',
        '200.0',
        '50.0',
        '150.0',
        '1000.0',
        1589151600000,
        '100000.0',
        100,
        '1000.0',
        '100000.0',
        '1000.0',
      ]),
    });
    const result = await getKline(
      'ETHUSDT',
      '1d',
      new Date('01-09-2020'),
      new Date('01-09-2021'),
    );
    expect(result.length).toBeGreaterThan(360);
    expect(result.length).toBeLessThan(370);
  });
});
