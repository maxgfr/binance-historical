// Deterministic transport for process tests. Never loaded by the published CLI.
const axios = require('../node_modules/axios');
const fs = require('node:fs');
let calls = 0;
axios.get = async (_url, options) => {
  calls++;
  if (
    process.env.BINANCE_TEST_MODE === 'failure' ||
    options.params.symbol === 'BAD'
  ) {
    throw {
      response: { status: 400, data: { code: -1121, msg: 'Invalid symbol' } },
    };
  }
  if (process.env.BINANCE_TEST_MODE === 'interrupt' && calls === 2) {
    fs.writeFileSync(process.env.BINANCE_TEST_READY, 'ready');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 60000);
      options.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject({ code: 'ERR_CANCELED' });
        },
        { once: true },
      );
    });
  }
  const { startTime, endTime, limit, interval } = options.params;
  const step = interval === '1h' ? 3600000 : 60000;
  const first = Math.ceil(startTime / step) * step;
  const count = Math.max(
    0,
    Math.min(limit, Math.floor((endTime - first) / step) + 1),
  );
  return {
    data: Array.from({ length: count }, (_, i) => {
      const t = first + i * step;
      return [
        t,
        '1',
        '2',
        '0.5',
        '1.5',
        '10',
        t + step - 1,
        '15',
        2,
        '5',
        '7.5',
        '0',
      ];
    }),
  };
};
