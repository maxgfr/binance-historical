import axios from 'axios';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportKlines } from '../export';
import type { ExportOptions } from '../export';

jest.mock('axios');
const http = axios as jest.Mocked<typeof axios>;
const start = Date.UTC(2024, 0, 1);
const row = (t: number) => [
  t,
  '1',
  '2',
  '0.5',
  '1.5',
  '10',
  t + 59999,
  '15',
  2,
  '5',
  '7.5',
  '0',
];
let dir: string;
let options: ExportOptions;
function respond() {
  http.get.mockImplementation(async (_url, config) => ({
    data: [row(config!.params.startTime)],
  }));
}
beforeEach(async () => {
  jest.resetAllMocks();
  dir = await fs.mkdtemp(join(tmpdir(), 'binance-test-'));
  options = {
    pair: 'BTCUSDT',
    interval: '1m',
    startDate: new Date(start),
    endDate: new Date(start + 180000),
    limit: 1,
    requestDelayMs: 0,
    outputPath: join(dir, 'nested', 'data.json'),
  };
  respond();
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});
describe('durable exports', () => {
  it.each(['json', 'csv'] as const)(
    'resumes %s after a partially written page and produces identical bytes',
    async (format) => {
      const complete = { ...options, format };
      await exportKlines(complete);
      const expected = await fs.readFile(options.outputPath, 'utf8');
      expect(await fs.readdir(join(dir, 'nested'))).toEqual(['data.json']);
      const interrupted = {
        ...complete,
        outputPath: join(dir, `interrupted.${format}`),
      };
      http.get
        .mockReset()
        .mockResolvedValueOnce({ data: [row(start)] })
        .mockRejectedValueOnce(new Error('offline'));
      await expect(exportKlines(interrupted)).rejects.toThrow('offline');
      await expect(fs.access(interrupted.outputPath)).rejects.toThrow();
      await fs.appendFile(`${interrupted.outputPath}.part`, 'incomplete write');
      const checkpoint = JSON.parse(
        await fs.readFile(`${interrupted.outputPath}.checkpoint.json`, 'utf8'),
      );
      expect(checkpoint.count).toBe(1);
      http.get.mockReset();
      respond();
      const result = await exportKlines({
        ...interrupted,
        resume: true,
        referenceTime: Date.now() + 10000,
      });
      expect(result.count).toBe(3);
      expect(result.resumed).toBe(true);
      expect(result.referenceTime).toBe(checkpoint.referenceTime);
      expect(http.get.mock.calls[0][1]?.params.startTime).toBe(start + 60000);
      expect(await fs.readFile(interrupted.outputPath, 'utf8')).toBe(expected);
      await expect(
        fs.access(`${interrupted.outputPath}.checkpoint.json`),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
  it('removes completed checkpoints and refuses replacing the final export, including with resume', async () => {
    await exportKlines(options);
    await expect(exportKlines(options)).rejects.toMatchObject({
      code: 'DESTINATION_EXISTS',
    });
    http.get.mockClear();
    await expect(
      exportKlines({ ...options, resume: true }),
    ).rejects.toMatchObject({ code: 'DESTINATION_EXISTS' });
    expect(await fs.readdir(join(dir, 'nested'))).toEqual(['data.json']);
    expect(http.get).not.toHaveBeenCalled();
  });
  it('preserves the old final file while overwriting and can resume the replacement', async () => {
    await exportKlines(options);
    const old = await fs.readFile(options.outputPath, 'utf8');
    http.get
      .mockReset()
      .mockResolvedValueOnce({ data: [row(start)] })
      .mockRejectedValueOnce(new Error('offline'));
    await expect(exportKlines({ ...options, overwrite: true })).rejects.toThrow(
      'offline',
    );
    expect(await fs.readFile(options.outputPath, 'utf8')).toBe(old);
    http.get.mockReset();
    respond();
    expect((await exportKlines({ ...options, resume: true })).count).toBe(3);
    expect(await fs.readFile(options.outputPath, 'utf8')).toBe(old);
  });
  it('rejects mismatched or corrupted checkpoints', async () => {
    http.get
      .mockResolvedValueOnce({ data: [row(start)] })
      .mockRejectedValueOnce(new Error('offline'));
    await expect(exportKlines(options)).rejects.toThrow();
    await expect(
      exportKlines({ ...options, pair: 'ETHUSDT', resume: true }),
    ).rejects.toMatchObject({ code: 'INVALID_CHECKPOINT' });
    const part = `${options.outputPath}.part`;
    const data = await fs.readFile(part, 'utf8');
    await fs.writeFile(part, data.replace('1.5', '9.5'));
    await expect(
      exportKlines({ ...options, resume: true }),
    ).rejects.toMatchObject({ code: 'INVALID_CHECKPOINT' });
  });
  it('writes valid empty outputs', async () => {
    http.get.mockResolvedValue({ data: [] });
    expect((await exportKlines(options)).count).toBe(0);
    expect(JSON.parse(await fs.readFile(options.outputPath, 'utf8'))).toEqual(
      [],
    );
    expect(await fs.readdir(join(dir, 'nested'))).toEqual(['data.json']);
  });
  it('uses COIN-M CSV field names and units', async () => {
    await exportKlines({ ...options, market: 'coin-m', format: 'csv' });
    const text = await fs.readFile(options.outputPath, 'utf8');
    expect(text.split('\n')[0]).toContain(
      'baseAssetVolume,trades,takerVolume,takerBaseAssetVolume',
    );
    expect(text).not.toContain('quoteAssetVolume');
  });
  it('leaves a resumable checkpoint on cancellation between pages', async () => {
    const controller = new AbortController();
    await expect(
      exportKlines({
        ...options,
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    const cp = JSON.parse(
      await fs.readFile(`${options.outputPath}.checkpoint.json`, 'utf8'),
    );
    expect(cp.count).toBe(1);
    await expect(fs.access(`${options.outputPath}.lock`)).rejects.toThrow();
    await exportKlines({ ...options, resume: true });
    expect(
      JSON.parse(await fs.readFile(options.outputPath, 'utf8')),
    ).toHaveLength(3);
    expect(await fs.readdir(join(dir, 'nested'))).toEqual(['data.json']);
  });
  it('refuses a second writer', async () => {
    await fs.mkdir(join(dir, 'nested'));
    await fs.writeFile(`${options.outputPath}.lock`, 'another writer');
    await expect(exportKlines(options)).rejects.toMatchObject({
      code: 'EXPORT_LOCKED',
    });
    expect(http.get).not.toHaveBeenCalled();
  });
});

describe('finalization recovery', () => {
  afterEach(() => jest.restoreAllMocks());
  it('resumes a ready export after failure to publish the final path', async () => {
    jest.spyOn(fs, 'link').mockRejectedValueOnce(new Error('publish failure'));
    await expect(exportKlines(options)).rejects.toThrow('publish failure');
    http.get.mockClear();
    await exportKlines({ ...options, resume: true });
    expect(http.get).not.toHaveBeenCalled();
    expect(
      JSON.parse(await fs.readFile(options.outputPath, 'utf8')),
    ).toHaveLength(3);
  });
  it('recovers interruption between linking the final file and removing the partial name', async () => {
    jest.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('unlink failure'));
    await expect(exportKlines(options)).rejects.toThrow('unlink failure');
    await fs.access(options.outputPath);
    await fs.access(`${options.outputPath}.part`);
    http.get.mockClear();
    await exportKlines({ ...options, resume: true });
    expect(http.get).not.toHaveBeenCalled();
    await expect(fs.access(`${options.outputPath}.part`)).rejects.toThrow();
    expect(await fs.readdir(join(dir, 'nested'))).toEqual(['data.json']);
  });
  it('recovers a completed export after checkpoint cleanup fails without downloading it again', async () => {
    const originalRm = fs.rm.bind(fs);
    const checkpointPath = `${options.outputPath}.checkpoint.json`;
    jest.spyOn(fs, 'rm').mockImplementation(async (path, rmOptions) => {
      if (path === checkpointPath) throw new Error('cleanup failure');
      return originalRm(path, rmOptions);
    });
    await expect(exportKlines(options)).rejects.toThrow('cleanup failure');
    await fs.access(options.outputPath);
    await fs.access(`${options.outputPath}.checkpoint.json`);
    jest.restoreAllMocks();
    http.get.mockClear();
    const result = await exportKlines({ ...options, resume: true });
    expect(result.count).toBe(3);
    expect(result.resumed).toBe(true);
    expect(http.get).not.toHaveBeenCalled();
    expect(await fs.readdir(join(dir, 'nested'))).toEqual(['data.json']);
  });
  it('detects corrupted cursor metadata even if the stored prefix is intact', async () => {
    http.get
      .mockResolvedValueOnce({ data: [row(start)] })
      .mockRejectedValueOnce(new Error('offline'));
    await expect(exportKlines(options)).rejects.toThrow();
    const path = `${options.outputPath}.checkpoint.json`;
    const cp = JSON.parse(await fs.readFile(path, 'utf8'));
    cp.cursor += 60000;
    await fs.writeFile(path, JSON.stringify(cp));
    await expect(
      exportKlines({ ...options, resume: true }),
    ).rejects.toMatchObject({ code: 'INVALID_CHECKPOINT' });
  });
});
