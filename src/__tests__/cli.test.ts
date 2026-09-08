import axios from 'axios';
import prompts from 'prompts';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../cli';

jest.mock('axios');
jest.mock('prompts');
const http = axios as jest.Mocked<typeof axios>;
const ask = prompts as jest.MockedFunction<typeof prompts>;
const start = Date.UTC(2024, 0, 1);
const row = [
  start,
  '1',
  '2',
  '0.5',
  '1.5',
  '10',
  start + 59999,
  '15',
  2,
  '5',
  '7.5',
  '0',
];
let dir: string;
let stdout: string;
let stderr: string;
let outSpy: jest.SpyInstance;
let errSpy: jest.SpyInstance;
const invoke = (...args: string[]) =>
  runCommand(['node', 'binance-historical', ...args]);
const args = () => [
  '--pair',
  'BTCUSDT',
  '--interval',
  '1m',
  '--start',
  '2024-01-01',
  '--end',
  '2024-01-01T00:01:00Z',
  '--output',
  dir,
];
beforeEach(async () => {
  jest.resetAllMocks();
  http.get.mockResolvedValue({ data: [row] });
  dir = await fs.mkdtemp(join(tmpdir(), 'binance-cli-'));
  stdout = '';
  stderr = '';
  outSpy = jest.spyOn(process.stdout, 'write').mockImplementation((text) => {
    stdout += String(text);
    return true;
  });
  errSpy = jest.spyOn(process.stderr, 'write').mockImplementation((text) => {
    stderr += String(text);
    return true;
  });
  process.exitCode = 0;
});
afterEach(async () => {
  outSpy.mockRestore();
  errSpy.mockRestore();
  process.exitCode = 0;
  await fs.rm(dir, { recursive: true, force: true });
});
describe('actual CLI', () => {
  it.each([true, false])(
    'supports documented invocation (download=%s) and directory without trailing slash',
    async (subcommand) => {
      await invoke(...(subcommand ? ['download'] : []), ...args(), '--json');
      const report = JSON.parse(stdout);
      expect(report.status).toBe('success');
      expect(report.results[0].count).toBe(1);
      expect(
        report.results[0].outputPath.startsWith(join(dir, 'spot_BTCUSDT')),
      ).toBe(true);
      expect(
        JSON.parse(await fs.readFile(report.results[0].outputPath, 'utf8')),
      ).toHaveLength(1);
      expect(stderr).toBe('');
      expect(ask).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
    },
  );
  it('reports HTTP failure with nonzero exit instead of silent success', async () => {
    http.get.mockRejectedValue({
      response: { status: 400, data: { code: -1121, msg: 'Invalid symbol' } },
    });
    await invoke('download', ...args(), '--json');
    const report = JSON.parse(stdout);
    expect(report.status).toBe('error');
    expect(report.results[0].error.binanceCode).toBe(-1121);
    expect(report.results[0].resumable).toBe(true);
    expect(process.exitCode).toBe(1);
  });
  it.each(
    [
      ['--non-interactive'],
      ['--json'],
      ['--pair', '../BTC', '--json'],
      ['--bad-option', '--json'],
    ].map((args) => [args]),
  )(
    'fails incomplete/invalid invocations without prompting: %j',
    async (extra) => {
      await invoke('download', ...extra);
      expect(process.exitCode).toBe(2);
      expect(http.get).not.toHaveBeenCalled();
      expect(ask).not.toHaveBeenCalled();
      if (extra.includes('--json'))
        expect(JSON.parse(stdout).status).toBe('error');
    },
  );
  it('describes capabilities and COIN-M output for agents', async () => {
    await invoke('describe', '--json');
    const report = JSON.parse(stdout);
    expect(report.markets.spot.intervals).toContain('1s');
    expect(report.markets['coin-m'].fields).toContain('baseAssetVolume');
    expect(report.dates.end).toBe('exclusive');
    expect(http.get).not.toHaveBeenCalled();
  });
  it('finishes other pairs on one failure and preserves requested order', async () => {
    http.get.mockImplementation(async (_url, config) => {
      if (config!.params.symbol === 'BAD')
        throw { response: { status: 400, data: { msg: 'Invalid symbol' } } };
      return { data: [row] };
    });
    await invoke(
      'download',
      '--pairs',
      'BTCUSDT,BAD,ETHUSDT,BTCUSDT',
      ...args().slice(2),
      '--json',
    );
    const report = JSON.parse(stdout);
    expect(report.results.map((r: { pair: string }) => r.pair)).toEqual([
      'BTCUSDT',
      'BAD',
      'ETHUSDT',
    ]);
    expect(report.results.map((r: { status: string }) => r.status)).toEqual([
      'success',
      'error',
      'success',
    ]);
    expect(process.exitCode).toBe(1);
  });
  it('supports hybrid interaction and validates the resulting dates', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true,
    });
    ask.mockResolvedValue({
      start: '2024-02-30',
      end: '2024-03-01',
      output: dir,
    });
    try {
      await invoke('download', '--pair', 'ETHUSDT', '--interval', '1m');
      expect(ask).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(2);
      expect(http.get).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(process.stdin, 'isTTY', descriptor);
      else Reflect.deleteProperty(process.stdin, 'isTTY');
    }
  });
  it('uses explicit root options with the subcommand', async () => {
    await invoke(
      '--market',
      'coin-m',
      '--format',
      'csv',
      'download',
      ...args(),
      '--json',
    );
    const result = JSON.parse(stdout).results[0];
    expect(result.market).toBe('coin-m');
    expect(result.outputPath).toMatch(/\.csv$/);
  });
});

it('keeps JSON reporting when a flag value happens to be "describe"', async () => {
  // An invalid pair avoids creating the relative output directory.
  await invoke(
    'download',
    '--pair',
    '../BAD',
    '--output',
    'describe',
    '--json',
  );
  expect(JSON.parse(stdout).error.code).toBe('INVALID_ARGUMENT');
  expect(stderr).toBe('');
});
