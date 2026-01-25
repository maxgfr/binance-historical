import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  calculateNumberOfCall,
  divideInterval,
  intervalToSeconds,
  saveKline,
} from '../utils';

describe('utils', () => {
  describe('intervalToSeconds', () => {
    it.each`
      interval | expected
      ${'1m'}  | ${60}
      ${'3m'}  | ${180}
      ${'5m'}  | ${300}
      ${'15m'} | ${900}
      ${'30m'} | ${1800}
      ${'1h'}  | ${3600}
      ${'2h'}  | ${7200}
      ${'4h'}  | ${14400}
      ${'6h'}  | ${21600}
      ${'8h'}  | ${28800}
      ${'12h'} | ${43200}
      ${'1d'}  | ${86400}
      ${'3d'}  | ${259200}
      ${'1w'}  | ${604800}
      ${'2w'}  | ${0}
    `(
      'should get {expected} seconds for {interval}',
      ({ interval, expected }) => {
        expect(intervalToSeconds(interval)).toBe(expected);
      },
    );
  });

  describe('calculateNumberOfCall', () => {
    it.each`
      interval | startTime                           | endTime                             | expected
      ${'1m'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${1440}
      ${'3m'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${480}
      ${'5m'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${288}
      ${'15m'} | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${96}
      ${'30m'} | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${48}
      ${'1h'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${24}
      ${'2h'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${12}
      ${'4h'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${6}
      ${'6h'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${4}
      ${'8h'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${3}
      ${'12h'} | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2021').getTime()} | ${734}
      ${'1d'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2021').getTime()} | ${367}
      ${'3d'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-01-2021').getTime()} | ${122}
      ${'1w'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-01-2021').getTime()} | ${53}
      ${'2w'}  | ${new Date('01-01-2020').getTime()} | ${new Date('01-01-2021').getTime()} | ${0}
    `(
      'should get {expected} seconds for {interval}',
      ({ interval, startTime, endTime, expected }) => {
        expect(calculateNumberOfCall(interval, startTime, endTime)).toBe(
          expected,
        );
      },
    );
  });

  describe('divideInterval', () => {
    it.each`
      iterations | startDate                           | endDate                             | expectedLength
      ${1}       | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2020').getTime()} | ${2}
      ${2}       | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2021').getTime()} | ${3}
      ${5}       | ${new Date('01-01-2020').getTime()} | ${new Date('01-02-2022').getTime()} | ${6}
    `(
      'should get {expected} seconds for {interval}',
      ({ iterations, startDate, endDate, expectedLength }) => {
        expect(divideInterval(iterations, startDate, endDate)).toHaveLength(
          expectedLength,
        );
      },
    );
  });

  describe('saveKline', () => {
    const testDir = join(__dirname, '../../test-output');
    const testSubDir = join(testDir, 'nested/deep/folder');

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should create directory automatically if it does not exist', () => {
      const testFile = join(testSubDir, 'test.json');
      const testData = [
        {
          openTime: 1609459200000,
          open: '100.0',
          high: '200.0',
          low: '50.0',
          close: '150.0',
          volume: '1000.0',
          closeTime: 1609545600000,
          quoteAssetVolume: '100000.0',
          trades: 100,
          takerBaseAssetVolume: '1000.0',
          takerQuoteAssetVolume: '100000.0',
          ignored: '1000.0',
        },
      ];

      expect(existsSync(testSubDir)).toBe(false);

      saveKline(testFile, testData, 'json');

      expect(existsSync(testSubDir)).toBe(true);
      expect(existsSync(testFile)).toBe(true);

      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(content).toEqual(testData);
    });

    it('should save JSON format correctly', () => {
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }

      const testFile = join(testDir, 'test.json');
      const testData = [
        {
          openTime: 1609459200000,
          open: '100.0',
          high: '200.0',
          low: '50.0',
          close: '150.0',
          volume: '1000.0',
          closeTime: 1609545600000,
          quoteAssetVolume: '100000.0',
          trades: 100,
          takerBaseAssetVolume: '1000.0',
          takerQuoteAssetVolume: '100000.0',
          ignored: '1000.0',
        },
      ];

      saveKline(testFile, testData, 'json');

      expect(existsSync(testFile)).toBe(true);
      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(content).toEqual(testData);
    });

    it('should save CSV format correctly', () => {
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }

      const testFile = join(testDir, 'test.csv');
      const testData = [
        {
          openTime: 1609459200000,
          open: '100.0',
          high: '200.0',
          low: '50.0',
          close: '150.0',
          volume: '1000.0',
          closeTime: 1609545600000,
          quoteAssetVolume: '100000.0',
          trades: 100,
          takerBaseAssetVolume: '1000.0',
          takerQuoteAssetVolume: '100000.0',
          ignored: '1000.0',
        },
      ];

      saveKline(testFile, testData, 'csv');

      expect(existsSync(testFile)).toBe(true);
      const content = readFileSync(testFile, 'utf-8');
      expect(content).toContain(
        'openTime,open,high,low,close,volume,closeTime,quoteAssetVolume,trades,takerBaseAssetVolume,takerQuoteAssetVolume,ignored',
      );
      expect(content).toContain(
        '1609459200000,100.0,200.0,50.0,150.0,1000.0,1609545600000,100000.0,100,1000.0,100000.0,1000.0',
      );
    });
  });
});
