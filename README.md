# binance-historical

Download historical Binance candles as JSON, CSV or JSON Lines, from a CLI or TypeScript.
Supports Spot, USDⓈ-M futures and COIN-M futures, multiple symbols, bounded-memory
exports and recovery after interruption. Public market data requires no API key.

Use the [agent skill](#agent-skill) from any skills-compatible agent to request
downloads in natural language.

## Install

```sh
npm install -g binance-historical
# or
brew install maxgfr/tap/binance-historical
```

Standalone macOS, Linux and Windows binaries are available in
[releases](https://github.com/maxgfr/binance-historical/releases).
Node.js 20+ is required for the npm package. To use unreleased changes locally:

```sh
pnpm install --frozen-lockfile
pnpm run build
node build/index.js describe --json
```

## CLI

```sh
binance-historical download --pair BTCUSDT --interval 1h \
  --start 2024-01-01 --end 2024-02-01 --output ./data --format csv
```

This selects candles whose **open time** is in `[2024-01-01, 2024-02-01)`.
The start is inclusive and the end exclusive. Date-only arguments are midnight
UTC; timestamps require `Z` or an explicit offset, such as
`2024-01-01T01:00:00+01:00`. Invalid calendar dates are rejected.

Only candles closed at the launch instant are included by default.
`--include-open` also includes the candle still forming at that instant.
No candles are synthesized for periods without data.

```sh
# Multiple symbols; one file per symbol
binance-historical download --pairs BTCUSDT,ETHUSDT --market usd-m \
  --interval 1h --start 2024-01-01 --end 2024-02-01 --output ./data

# COIN-M contract
binance-historical download --pair BTCUSD_PERP --market coin-m \
  --interval 1h --start 2024-01-01 --end 2024-02-01 --output ./data --format csv

# USDⓈ-M mark price candles, one JSON object per line
binance-historical download --pair BTCUSDT --market usd-m --kind mark \
  --interval 1h --start 2024-01-01 --end 2024-02-01 --output ./data --format jsonl
```

`--kind` selects the candle series. `trade` (default) is the traded-price
series with volumes. On `usd-m` and `coin-m`, `mark`, `index` and `premium`
download mark price, index price and premium index candles. These carry only
`openTime`, `open`, `high`, `low`, `close` and `closeTime`; premium values can
be negative. For `index`, `--pair` is the underlying pair (`BTCUSDT` on USDⓈ-M,
`BTCUSD` on COIN-M) rather than a contract.

| Option              | Meaning / default                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `-p, --pair`        | One symbol or exact futures contract identifier                                                                      |
| `--pairs`           | Comma-separated symbols; exclusive with `--pair`                                                                     |
| `--market`          | `spot` (default), `usd-m`, `coin-m`                                                                                  |
| `--kind`            | `trade` (default); `mark`, `index` or `premium` on `usd-m` and `coin-m`                                              |
| `-i, --interval`    | `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, `1M`; Spot also supports `1s` |
| `-s, --start`       | Inclusive date or timestamp                                                                                          |
| `-e, --end`         | Exclusive date or timestamp                                                                                          |
| `-o, --output`      | Directory; trailing separator is optional                                                                            |
| `-f, --format`      | `json` (default), `csv` or `jsonl`                                                                                   |
| `--concurrency`     | Concurrent symbols, 1–4; default 2                                                                                   |
| `--include-open`    | Include forming candles                                                                                              |
| `--resume`          | Resume an interrupted export using its matching checkpoint                                                           |
| `--overwrite`       | Replace an export after the new download completes                                                                   |
| `--timeout`         | Per-request timeout in milliseconds; default 30000                                                                   |
| `--max-retries`     | Retries for temporary failures; default 3                                                                            |
| `--request-delay`   | Minimum milliseconds between request starts; default 100                                                             |
| `--base-url`        | Replace the market REST root, such as `https://api.binance.us/api/v3`                                                |
| `--non-interactive` | Fail on missing parameters instead of prompting                                                                      |
| `--json`            | One JSON execution report on stdout; implies non-interactive                                                         |
| `-h, --help`        | Help                                                                                                                 |
| `-V, --version`     | Installed version                                                                                                    |

`binance-historical download` prompts in a terminal. Partial options trigger
hybrid mode. Without a terminal, missing required parameters fail immediately.
The date prompts suggest the last 30 complete UTC days: the start is 30 days
before today and the exclusive end is today at midnight UTC. Press Enter to
accept either date or type a replacement. If `--end` is supplied, the suggested
start is 30 days before that date. The pair and date prompts reject invalid
input as you type it. Non-interactive downloads require explicit dates.
The historical invocation without `download` remains supported. In terminals,
each symbol reports its progress on stderr at most once per second: percentage,
candle count, rate and estimated time remaining. JSON reports have no progress
noise.

## Recovery and files

The output name contains market, normalized symbol, interval and both precise
UTC timestamps, such as `spot_BTCUSDT_1h_2024-01-01T00-00-00.000Z_2024-02-01T00-00-00.000Z.csv`.
The `1M` interval is written `1mo` so it never shares a file with `1m` on
case-insensitive filesystems. A kind other than `trade` extends the market
prefix, as in `usd-m-mark_BTCUSDT_…`. JSON contains an array of candle objects,
JSON Lines one candle object per line, and CSV an explicit header followed by
rows. Decimal prices and volumes retain their exchange precision.

Exports write to `<output>.part` first and maintain
`<output>.checkpoint.json`. A page is synchronized to disk before its cursor is
committed. Only a completed file appears at the final path. Existing outputs
are refused unless `--overwrite` is given or `--resume` finds a matching
checkpoint from an interrupted export. A new export that fails before its first
page is saved (an invalid symbol, for instance) removes its `.part` and
checkpoint, so the same command can simply be rerun.

After an interruption, repeat the original command with `--resume`. Keep the
checkpoint and partial file together. A resumed operation retains the original
reference instant and validates the stored prefix before discarding an
uncommitted trailing write. An incompatible or corrupted checkpoint fails
explicitly. Older exports without checkpoints cannot be resumed.

The checkpoint is automatically deleted after the final file is published
successfully. Only the CSV or JSON export remains. Checkpoints are kept on
failure or interruption so `--resume` can continue the export. To replace an
already completed export, use `--overwrite`. A `.lock` prevents simultaneous
writers to the same export. `--resume` recovers a stale lock when its recorded
local process no longer exists; the `--json` report marks such an export
`resumable: true`. Locks from another host or with unreadable metadata require
checking the owner before manual removal. On filesystems without hard links,
such as exFAT, FAT32 or SMB shares, the final file is published by rename.

Requests time out after 30 seconds. Temporary network errors, HTTP 429 and 5xx
receive at most three retries, with exponential waits and `Retry-After` support.
`--timeout`, `--max-retries` and `--request-delay` change these limits.
Bans and permanent API errors stop the affected work. Other symbols finish;
the overall command fails if any symbol fails. Ctrl+C closes files and returns 130. The request scheduler and rate-limit cooldown are shared by batch workers.

Every response reports the request weight used in the current minute
(`x-mbx-used-weight-1m`). Once it reaches 90% of the market budget (6000 on
Spot, 2400 on USDⓈ-M and COIN-M), all workers pause until the next minute,
before Binance answers 429 or bans the address. With `--base-url`, the budget
of the other host is unknown (binance.us allows 1200), so only 429 responses
slow the download. HTTP 451 means Binance refuses requests from your location:
it fails with `RESTRICTED_LOCATION`, without retries; use `--base-url` with an
endpoint available to you.

On Spot and USDⓈ-M, a page with no candles triggers one probe for the next
existing candle, so a start date long before a symbol's listing costs two
requests instead of one per empty window. COIN-M paginates window by window,
because its API can return the latest rows of a range.

## Agent skill

The [binance-historical skill](skills/binance-historical/SKILL.md) lets any
skills-compatible agent download candles, choose the correct market and resume
interrupted exports through the CLI. Install it with:

```sh
npx skills add maxgfr/binance-historical
```

Add `-a <agent>` (for example `-a codex` or `-a opencode`) to target one agent
explicitly. Add `--global` for installation across projects. This installs the
skill, not the CLI executable, which is installed separately as described above.
To try a local checkout, use `npx skills add .`.

For example, ask your agent: “Download January 2024 BTCUSDT hourly candles as
CSV into ./data.” The skill handles exclusive end dates and reads the CLI’s
structured success or error report.

Agents can discover the installed contract and obtain structured results:

```sh
binance-historical describe --json
binance-historical download --pair BTCUSDT --interval 1h \
  --start 2024-01-01 --end 2024-02-01 --output ./data \
  --non-interactive --json
```

`--format` controls the data file; `--json` controls the execution report:

```json
{
  "schemaVersion": 1,
  "status": "success",
  "results": [
    {
      "pair": "BTCUSDT",
      "market": "spot",
      "status": "success",
      "outputPath": "/absolute/path/to/export.json",
      "count": 744,
      "requests": 1,
      "retries": 0,
      "resumed": false,
      "referenceTime": 1735689600000,
      "resumable": false
    }
  ]
}
```

Errors contain `code`, `message`, `retryable` and, when available, `httpStatus`
and `binanceCode`. Argument errors appear at the top level; symbol failures
appear in their result with `resumable`. Exit codes: **0** success, **1** runtime
failure, **2** invalid arguments, **130** interruption. `describe --json` lists
market-specific field order and the report contract.

## Library

```ts
import {
  getKline,
  getKlines,
  iterateKlines,
  exportKlines,
} from 'binance-historical';

const options = {
  pair: 'ETHUSDT',
  interval: '1h' as const,
  startDate: new Date('2024-01-01T00:00:00Z'),
  endDate: new Date('2024-02-01T00:00:00Z'),
};

const candles = await getKlines(options);
// getKline(pair, interval, startDate, endDate, source?, version?, limit?) still works.

for await (const candle of iterateKlines(options)) {
  // Consume incrementally. Breaking the loop stops further requests.
  console.log(candle.openTime, candle.close);
}

await exportKlines({ ...options, outputPath: './data/eth.json', resume: true });

const contracts = await getKlines({
  ...options,
  pair: 'BTCUSD_PERP',
  market: 'coin-m',
});
console.log(contracts[0]?.baseAssetVolume);
```

`DownloadOptions` accepts `market`, `kind` (default `trade`), `limit` (default
1000), `includeOpen`, `referenceTime`, `signal`, `onProgress`, `timeoutMs`,
`maxRetries`, `requestDelayMs` (default 100) and `baseUrl`. `exportKlines` also
accepts `format: 'jsonl'`. `getKlines` collects an array; `iterateKlines`
and `exportKlines` have bounded working memory. The library does not log errors
or exit the process; it rejects with `DownloadError` and preserves API details.

`Kline` is the unchanged Spot/USDⓈ-M schema. `CoinMKline` names contract and
base-asset volumes separately: `volume` and `takerVolume` are contract volumes,
`baseAssetVolume` and `takerBaseAssetVolume` are base-asset volumes. It has no
`quoteAssetVolume` or `takerQuoteAssetVolume`. Mark, index and premium kinds
return `PriceKline` (prices and times only); `KlineFor<Market, Kind>` gives the
candle type for any combination. Prices and volumes are strings; timestamps are
milliseconds.

```ts
const mark = await getKlines({ ...options, pair: 'BTCUSDT', market: 'usd-m', kind: 'mark' });
console.log(mark[0]?.close); // PriceKline: no volume fields
```

## Compatibility and validation

Compared with 1.6.x, end dates are explicitly exclusive, closed candles are the
default, files are protected against implicit overwrite, filenames contain
market and precise UTC timestamps, and runtime failures return nonzero status.
The former unconditional removal of the last candle is fixed. JSON whitespace
is compact for streaming; field values and Spot CSV columns are preserved.
These intentional behavioral changes should ship in a major release.

```sh
pnpm run build
pnpm run lint
pnpm test --runInBand
pnpm run test:process
pnpm run test:package
pnpm run test:skill
pnpm run benchmark
```

The deterministic benchmark records elapsed time, peak sampled heap and request
count at 10k, 100k and 1m candles; it simulates HTTP so network latency cannot
hide local costs. Live Binance checks are separate from offline CI tests.

See [validation results](docs/validation.md) for measurements, reproduction
commands and the limits of the local checks.

## Skill invocation on request

The `binance-historical` skill is model-invocable, but its description restricts it to explicit requests: the agent calls it when you ask for it, not on its own. Ask for it in plain words, or use `$binance-historical` in Codex or `/binance-historical` in Claude Code and OpenCode (with the plugin namespace when installed as a Claude plugin).

You keep the switch in the frontmatter of the installed `SKILL.md`:

| Host | Shipped, on request | Explicit-only |
| --- | --- | --- |
| Claude Code, OpenCode | no `disable-model-invocation` in `SKILL.md` | add `disable-model-invocation: true` |

Claude Code can do it without touching the file: `"skillOverrides": { "binance-historical": "user-invocable-only" }` in `settings.json` leaves `/binance-historical` working while hiding the skill from the model. Plugin installs ignore `skillOverrides`, so edit the frontmatter there. Updating or reinstalling restores the shipped default, so reapply the change afterwards.
