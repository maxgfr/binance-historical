# CLAUDE.md

## Project overview
CLI tool and library to download historical klines (candlestick data) from the Binance API. Supports JSON/CSV export. Distributed via npm, Homebrew, and standalone binaries.

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
- `pnpm run lint` - run ESLint
- `pnpm run dev` - watch mode with nodemon
- `pnpm run build:binaries` - build all platform binaries
- `pnpm run release` - semantic-release

## Project structure
- `src/` - source code
  - `index.ts` - entry point (CLI + library export)
  - `cli.ts` - CLI commands (Commander.js)
  - `klines.ts` - Binance API client
  - `types.ts` - type definitions
  - `utils.ts` - utility functions
  - `__tests__/` - test files
- `build/` - compiled output
- `dist/` - binary output
- `.github/workflows/` - CI/CD (build, test, lint, publish)

## Code conventions
- Strict TypeScript (`strict: true`)
- Single quotes, trailing commas (Prettier)
- Tests use `describe`/`it` blocks with `it.each` for parametrized tests
- Conventional commits (semantic-release parses them)
