# AGENTS.md

## Project overview
CLI tool and library to download historical klines (candlestick data) from the Binance API. Supports JSON, CSV and JSON Lines export. Distributed via npm, Homebrew, and standalone binaries.

## Tech stack
- TypeScript 5.9, Node.js 20+, CommonJS modules
- pnpm as package manager
- Jest + @swc/jest for tests
- ESLint + Prettier for code quality
- semantic-release for versioning
- @yao-pkg/pkg for binary builds

## Commands
- `pnpm install` - install dependencies
- `pnpm run build` - compile TypeScript to `./build`
- `pnpm run test` - run Jest tests
- `pnpm run test:process` - CLI end-to-end tests against the build (needs `pnpm run build`)
- `pnpm run test:package` - packs the tarball and checks the CLI, import and TypeScript consumer
- `pnpm run test:skill` - installs the agent skill with `npx skills` and checks its frontmatter
- `pnpm run lint` - run ESLint. Inside `.claude/worktrees/*` ESLint also reads the parent checkout's `.eslintrc.json` and fails to resolve plugins; run `pnpm exec eslint ./src --ext .ts --no-eslintrc -c .eslintrc.json` there
- `pnpm run dev` - watch mode with nodemon
- `pnpm run build:binaries` - build all platform binaries
- `pnpm run release` - semantic-release

## Project structure
- `src/` - source code
  - `index.ts` - entry point (CLI + library export)
  - `types.ts` - public types (`Kline`, `CoinMKline`, `PriceKline`, `DownloadOptions`)
  - `config.ts` - `DownloadError`, market and kind tables (`MARKETS`, `KINDS`), argument validation, date parsing, window math
  - `network.ts` - `RequestContext`: shared request spacing, weight-based cooldown, retries, 429/418/451 handling
  - `klines.ts` - pagination (`iteratePages`), row validation and mapping, empty-range probe, public `getKlines`/`iterateKlines`/`getKline`
  - `export.ts` - durable file export: `.part` file, checksummed checkpoint, resume, publication
  - `lock.ts` - per-export lock file and stale-lock detection
  - `contracts.ts` - JSON schemas for the `--json` report and candle output
  - `cli.ts` - Commander program, `describe`, exit codes
  - `cli-input.ts` - CLI options, validation and interactive prompts
  - `cli-download.ts` - batch download, output file names, progress, error reports
  - `__tests__/` - Jest tests (axios is mocked)
- `scripts/` - process, package, skill and benchmark scripts
- `skills/binance-historical/` - agent skill shipped in the npm package
- `build/` - compiled output
- `dist/` - binary output
- `.github/workflows/` - CI/CD (build, test, lint, publish)

## Code conventions
- Strict TypeScript (`strict: true`)
- Single quotes, trailing commas (Prettier)
- Tests use `describe`/`it` blocks with `it.each` for parametrized tests
- Conventional commits (semantic-release parses them)
- Checkpoint fingerprints must stay stable: new export options enter the fingerprint only when they differ from their default, so checkpoints from earlier releases remain resumable
