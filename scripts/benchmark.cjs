const { spawnSync, execFileSync } = require('node:child_process');
const { join } = require('node:path');
if (!process.argv[2] || process.argv[2] === '--baseline') {
  const revision =
    process.argv[2] === '--baseline' ? process.argv[3] || 'HEAD' : '';
  const modes = revision ? ['legacy', 'array', 'export'] : ['array', 'export'];
  for (const count of [10000, 100000, 1000000])
    for (const mode of modes) {
      const child = spawnSync(
        process.execPath,
        [
          '--expose-gc',
          ...(mode === 'export' ? ['--max-old-space-size=128'] : []),
          __filename,
          String(count),
          mode,
          revision,
        ],
        { encoding: 'utf8' },
      );
      process.stdout.write(child.stdout);
      process.stderr.write(child.stderr);
      if (child.status !== 0) process.exit(child.status || 1);
    }
} else {
  const assert = require('node:assert/strict');
  const fs = require('node:fs/promises');
  const { tmpdir } = require('node:os');
  const axios = require('axios');
  const { getKlines, exportKlines } = require('../build');
  const count = Number(process.argv[2]);
  const mode = process.argv[3];
  const revision = process.argv[4] || undefined;
  let legacy;
  if (mode === 'legacy') {
    const ts = require('typescript');
    const vm = require('node:vm');
    const load = (path, dependencies) => {
      const source = execFileSync('git', ['show', `${revision}:${path}`], {
        encoding: 'utf8',
      });
      const js = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2021,
          esModuleInterop: true,
        },
      }).outputText;
      const module = { exports: {} };
      vm.runInThisContext(`(function(require,module,exports){${js}\n})`)(
        (name) => dependencies[name] || require(name),
        module,
        module.exports,
      );
      return module.exports;
    };
    const utils = load('src/utils.ts', {});
    legacy = load('src/klines.ts', { './utils': utils }).getKline;
  }
  const start = Date.UTC(2020, 0, 1);
  let calls = 0;
  let peakHeap = 0;
  const sample = () => {
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  };
  axios.get = async (url, config) => {
    const q =
      config?.params ||
      Object.fromEntries(
        [...new URL(url).searchParams].map(([key, value]) => [
          key,
          key.endsWith('Time') || key === 'limit' ? Number(value) : value,
        ]),
      );
    calls++;
    sample();
    return {
      data: Array.from(
        {
          length: Math.min(
            q.limit,
            Math.floor((q.endTime - q.startTime) / 60000) + 1,
          ),
        },
        (_, i) => {
          const t = q.startTime + i * 60000;
          return [
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
        },
      ),
    };
  };
  (async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'binance-benchmark-'));
    const options = {
      pair: 'BTCUSDT',
      interval: '1m',
      startDate: new Date(start),
      endDate: new Date(start + count * 60000),
      requestDelayMs: 0,
      onProgress: sample,
    };
    global.gc();
    const t = performance.now();
    try {
      const result =
        mode === 'legacy'
          ? await legacy(
              options.pair,
              options.interval,
              options.startDate,
              options.endDate,
            )
          : mode === 'array'
            ? await getKlines(options)
            : await exportKlines({
                ...options,
                outputPath: join(dir, 'export.json'),
              });
      sample();
      const returned = mode === 'export' ? result.count : result.length;
      if (mode !== 'legacy') assert.equal(returned, count);
      assert.equal(calls, Math.ceil(count / 1000));
      if (mode === 'array') {
        for (let i = 0; i < result.length; i++)
          assert.equal(result[i].openTime, start + i * 60000);
      }
      console.log(
        JSON.stringify({
          mode,
          revision,
          count,
          returned,
          calls,
          elapsedMs: Math.round(performance.now() - t),
          peakHeapMiB: Math.round(peakHeap / 1048576),
          rssMiB: Math.round(process.memoryUsage().rss / 1048576),
        }),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  })().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
