# Validation — 2026-09-08

Environment: macOS ARM64, Node 24.10.0, pnpm 10.8.1.
Baseline: `e45b9265f4282486e32cb8cee794806cba4f2e3f` (1.6.8).

## Correctness and integration

- Build, ESLint and 102 Jest tests pass.
- Four real-process tests pass: export/error/JSON reporting, graceful SIGINT,
  forced SIGKILL recovery, and capability/help/version discovery.
- npm tarball tested after extraction: executable, quiet library import,
  included skill, and a strict TypeScript consumer including distinct COIN-M
  volumes and the legacy `getKline` signature.
- `npx skills@1.5.24 add <checkout> --skill binance-historical --agent
claude-code codex --yes` installs readable skills for both agents in an
  isolated temporary project. Skill frontmatter validation also passes.
- Live CLI downloads returned exactly two consecutive 1-minute candles for
  2024-01-01T00:00:00Z through the exclusive 00:02:00Z boundary on Spot BTCUSDT,
  USDⓈ-M BTCUSDT and COIN-M BTCUSD_PERP.
- All skill examples also ran against Binance: January 2024 yielded 744 hourly
  candles per symbol for Spot CSV, multi-symbol USDⓈ-M JSON and COIN-M CSV.
  Repeating each command with `--resume` verified completed files successfully.
- All four standalone targets compiled: macOS ARM64/x64, Linux x64 and Windows
  x64. Both macOS executables passed version checks and a live two-candle
  download. Linux and Windows executables were compiled but not run locally.
- Rate limits, retry exhaustion, malformed responses, interrupted writes,
  checksums, monthly pagination, publication failures and filesystem conflicts
  are covered with deterministic fixtures rather than provoking API bans or
  disk failures on a real system.

The original 57 tests passed while a targeted reproduction returned only one
of two valid candles. The replacement tests exercise the production CLI and
validate exact rows, bounds and output files; they no longer reconstruct an
unrelated Commander instance.

## Performance

Reproduce with:

```sh
pnpm run build
pnpm run benchmark --baseline e45b9265f4282486e32cb8cee794806cba4f2e3f
```

Each scenario runs in a fresh process with simulated HTTP. The legacy client
is compiled from the pinned Git revision in memory. Its loader includes
TypeScript, which contributes startup heap but is outside the timed section.
The export benchmark writes and synchronizes real files and checkpoints; it
runs with a 128 MiB JavaScript heap limit. Request throttling is disabled for
local measurement. Reported heap is sampled, not an exact profiler maximum.

| Requested candles | Old array time | New array time | New streaming export time | New array heap | Export heap |
| ----------------: | -------------: | -------------: | ------------------------: | -------------: | ----------: |
|            10,000 |           4 ms |           9 ms |                    138 ms |         11 MiB |      12 MiB |
|           100,000 |          32 ms |          57 ms |                    904 ms |         32 MiB |      19 MiB |
|         1,000,000 |       1,043 ms |         200 ms |                  8,319 ms |        200 MiB |      47 MiB |

The new client returned every requested candle using 10, 100 and 1,000
requests respectively. The old client returned one fewer candle in every
scenario. The million-candle collection is approximately 5.2 times faster in
this run. Small collections incur extra validation work (5–25 ms here).
Streaming export timing includes durable disk writes and is not directly
comparable with an in-memory collection. Actual network throughput depends on
latency and Binance rate limits; these measurements do not promise live API
speedups or zero overhead for every workload.

## Distribution and remaining external checks

The repository includes CI coverage for Node 20 and 24 on Linux, macOS and
Windows. Release publishing now runs build, lint, behavioral tests, package
validation and skill installation checks first. Those remote jobs have not
been executed from this local work session.

The skill is validated locally. Its GitHub installation command becomes
available once the changes reach the remote default branch. No package,
Homebrew formula or GitHub release has been published in this session.
