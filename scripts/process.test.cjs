const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const root = resolve(__dirname, '..');
const preload = join(root, 'fixtures/binance-http.cjs');
const binary = join(root, 'build/index.js');
function run(args, env = {}) {
  return spawnSync(process.execPath, ['--require', preload, binary, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 15000,
  });
}
function options(dir) {
  return [
    'download',
    '--pair',
    'BTCUSDT',
    '--interval',
    '1m',
    '--start',
    '2024-01-01',
    '--end',
    '2024-01-02',
    '--output',
    dir,
    '--non-interactive',
    '--json',
  ];
}
test('real process exports exact rows, exposes errors, and resumes', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'binance-process-'));
  try {
    const args = options(dir);
    const success = run(args);
    assert.equal(success.status, 0, success.stderr + success.stdout);
    assert.equal(success.stderr, '');
    const result = JSON.parse(success.stdout).results[0];
    assert.equal(result.count, 1440);
    assert.equal(
      JSON.parse(await fs.readFile(result.outputPath, 'utf8')).length,
      1440,
    );
    const repeat = run([...args, '--resume']);
    assert.equal(repeat.status, 0, repeat.stderr + repeat.stdout);
    assert.equal(JSON.parse(repeat.stdout).results[0].resumed, true);
    const bad = run([...args, '--overwrite'], { BINANCE_TEST_MODE: 'failure' });
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).results[0].error.binanceCode, -1121);
    const missing = run(['download', '--json']);
    assert.equal(missing.status, 2);
    assert.equal(JSON.parse(missing.stdout).error.code, 'INVALID_ARGUMENT');
    const invalid = run(['download', '--unknown', '--json']);
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stderr, '');
    JSON.parse(invalid.stdout);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
for (const signal of ['SIGINT', 'SIGKILL'])
  test(
    `${signal} leaves a resumable export`,
    { skip: process.platform === 'win32' },
    async () => {
      const dir = await fs.mkdtemp(join(tmpdir(), 'binance-interrupt-'));
      const marker = join(dir, 'ready');
      const args = options(dir);
      const child = spawn(
        process.execPath,
        ['--require', preload, binary, ...args],
        {
          env: {
            ...process.env,
            BINANCE_TEST_MODE: 'interrupt',
            BINANCE_TEST_READY: marker,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stdout.on('data', (b) => {
        output += b;
      });
      let errors = '';
      child.stderr.on('data', (b) => {
        errors += b;
      });
      const stopped = new Promise((resolve) =>
        child.on('close', (code) => resolve(code)),
      );
      try {
        const deadline = Date.now() + 10000;
        while (
          !existsSync(marker) &&
          Date.now() < deadline &&
          child.exitCode === null
        )
          await new Promise((resolve) => setTimeout(resolve, 20));
        assert.ok(existsSync(marker), errors + output);
        child.kill(signal);
        const code = await stopped;
        if (signal === 'SIGINT') {
          assert.equal(code, 130, errors + output);
          assert.equal(JSON.parse(output).results[0].resumable, true);
        } else assert.equal(code, null);
        const resumed = run([...args, '--resume']);
        assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
        assert.equal(JSON.parse(resumed.stdout).results[0].count, 1440);
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
        await stopped;
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  );
test('capability discovery, help and version are side-effect free', () => {
  const result = run(['describe', '--json']);
  assert.equal(result.status, 0);
  assert.deepEqual(Object.keys(JSON.parse(result.stdout).markets), [
    'spot',
    'usd-m',
    'coin-m',
  ]);
  assert.equal(
    run(['--version']).stdout.trim(),
    require('../package.json').version,
  );
  assert.match(run(['download', '--help']).stdout, /--resume/);
});
