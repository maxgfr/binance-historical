const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const temp = fs.mkdtempSync(join(tmpdir(), 'binance-package-'));
function exec(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: root,
    ...options,
  });
  assert.equal(
    result.status,
    0,
    result.error?.message || result.stderr + result.stdout,
  );
  return result.stdout;
}
try {
  const packed = JSON.parse(
    exec('npm', ['pack', '--json', '--pack-destination', temp]),
  );
  assert.ok(
    packed[0].files.some(
      (f) => f.path === 'skills/binance-historical/SKILL.md',
    ),
  );
  assert.ok(!packed[0].files.some((f) => f.path.includes('__tests__')));
  exec('tar', ['-xzf', join(temp, packed[0].filename), '-C', temp]);
  const packageDir = join(temp, 'package');
  fs.symlinkSync(
    join(root, 'node_modules'),
    join(packageDir, 'node_modules'),
    'dir',
  );
  const entry = join(packageDir, 'build/index.js');
  assert.equal(
    exec(process.execPath, [entry, '--version']).trim(),
    require('../package.json').version,
  );
  assert.equal(
    JSON.parse(exec(process.execPath, [entry, 'describe', '--json']))
      .schemaVersion,
    1,
  );
  const loaded = exec(process.execPath, [
    '-e',
    'const p=require(process.argv[1]); if(typeof p.getKlines!=="function" || typeof p.iterateKlines!=="function") process.exit(1)',
    packageDir,
  ]);
  assert.equal(loaded, '');
  const consumer = join(packageDir, 'consumer.ts');
  fs.writeFileSync(
    consumer,
    `import { getKline, getKlines, iterateKlines, Kline, CoinMKline } from './build';
const opts = { pair: 'BTCUSDT', interval: '1m' as const, startDate: new Date(), endDate: new Date() };
async function check() {
  const spot: Kline[] = await getKlines(opts);
  const coin: CoinMKline[] = await getKlines({ ...opts, market: 'coin-m' });
  const legacy: Kline[] = await getKline(opts.pair, opts.interval, opts.startDate, opts.endDate);
  for await (const candle of iterateKlines({ ...opts, market: 'coin-m' })) candle.baseAssetVolume;
  // @ts-expect-error COIN-M has no quote volume
  coin[0].quoteAssetVolume;
  return { spot, coin, legacy };
}
void check;
`,
  );
  exec(process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--target',
    'es2021',
    '--module',
    'commonjs',
    '--moduleResolution',
    'node',
    consumer,
  ]);
  console.log(
    'Package tarball, CLI, side-effect-free import, skill and TypeScript consumer: OK',
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
