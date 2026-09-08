---
name: binance-historical
description: Download and resume Binance historical candles with the binance-historical CLI, including Spot, USDⓈ-M and COIN-M futures, multiple symbols, and JSON or CSV exports. Use for requests to retrieve Binance OHLCV data or operate this downloader from Claude Code or Codex.
---

# Download Binance historical candles

Use the installed `binance-historical` CLI. Inside its source checkout, install
locked dependencies with `pnpm install --frozen-lockfile`, build with
`pnpm run build`, and substitute `node build/index.js` for the command below.
The skill installs instructions, not the executable; outside a checkout the
executable is installed with `npm install -g binance-historical`.

## Discover the installed contract

Run `binance-historical --version` and `binance-historical describe --json`.
The latter is the source of truth for markets, intervals, fields, defaults and
exit codes. If the installed release lacks `describe`, use a newer release or
the current source build before using these options.

## Translate the request

Resolve the market, exact symbol(s), interval, start, exclusive end and output
directory from the request. Ask only for missing intent. Use Spot when the user
has not requested derivatives. Futures symbols are contract identifiers, such
as `BTCUSDT` for USDⓈ-M and `BTCUSD_PERP` for COIN-M; dated contracts require
their exact exchange symbol. Preserve the requested contract rather than
substituting an underlying pair.

Dates without a time mean midnight UTC. To request January 2024 in full, use
`--start 2024-01-01 --end 2024-02-01`. Convert a requested local timezone to an
explicit ISO timestamp with offset. The exclusive end lets adjacent exports
join without duplicates. Closed candles are the default; use `--include-open`
only when the request calls for an unfinished candle.

## Execute without prompts

Always pass `--non-interactive --json` and an explicit output directory.
`--format` selects the file encoding; `--json` selects the command report.
Prices and volumes remain decimal strings. Read the result report rather than
loading a large candle file into the conversation.

```sh
binance-historical download --pair BTCUSDT --interval 1h \
  --start 2024-01-01 --end 2024-02-01 --output ./data \
  --format csv --non-interactive --json

binance-historical download --pairs BTCUSDT,ETHUSDT --market usd-m \
  --interval 1h --start 2024-01-01 --end 2024-02-01 \
  --output ./data --format json --non-interactive --json

binance-historical download --pair BTCUSD_PERP --market coin-m \
  --interval 1h --start 2024-01-01 --end 2024-02-01 \
  --output ./data --format csv --non-interactive --json
```

COIN-M has different volume units and field names. Consult its fields from
`describe`; do not interpret contract volume as base or quote asset volume.

## Check the outcome and resume

A zero exit code and `status: "success"` mean the requested operation finished.
Report the output paths, counts and any failed symbols. An empty result is a
valid export, not evidence that Binance must have data for that period. The
report and dates describe the requested slice, not a promise of continuous
trading or complete exchange history.

For an interrupted export whose result is `resumable: true`, rerun the same
command and add `--resume`. Keep the original market, symbols, dates, format,
output path and open-candle policy. The checkpoint preserves the original
reference instant; it does not extend the export through the current time.

The downloader retries temporary network errors itself. On a persistent error,
use the error code and message to decide whether to resume, correct a symbol,
or report an unavailable market. Stop on bans and checkpoint corruption.
Use `--overwrite` only when replacing the existing export is requested;
it is mutually exclusive with `--resume`. Keep `.part` and
`.checkpoint.json` files together until the export is finished.
After success, the checkpoint is deleted automatically and only the exported
CSV or JSON remains. Use that final file directly; `--resume` requires a
checkpoint from an interrupted export.
