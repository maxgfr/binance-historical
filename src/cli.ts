import { Command, CommanderError } from 'commander';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MARKETS } from './config';
import { fieldsFor } from './export';
import { candleSchema, reportSchema } from './contracts';
import { downloadOptions } from './cli-input';
import type { CliOptions } from './cli-input';
import { download, errorReport } from './cli-download';
import type { RunReport } from './cli-download';
import type { Market } from './types';

export function version(): string {
  return (
    JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
      version: string;
    }
  ).version;
}
export function describe() {
  const command = downloadOptions(new Command());
  return {
    schemaVersion: 1,
    version: version(),
    markets: Object.fromEntries(
      Object.entries(MARKETS).map(([name, config]) => [
        name,
        {
          intervals: config.intervals,
          maxLimit: config.maxLimit,
          fields: fieldsFor(name as Market),
          outputSchema: candleSchema(name as Market),
        },
      ]),
    ),
    defaults: {
      market: 'spot',
      format: 'json',
      concurrency: 2,
      includeOpen: false,
      timeoutMs: 30000,
      maxRetries: 3,
      requestDelayMs: 100,
    },
    dates: {
      start: 'inclusive',
      end: 'exclusive',
      dateOnlyTimezone: 'UTC',
      timestamps: 'ISO 8601 with Z or offset',
      candleSelection:
        'openTime in range; closed at fixed referenceTime unless include-open',
    },
    commands: ['download', 'describe'],
    options: command.options.map((o) => ({
      flags: o.flags,
      description: o.description,
      default: o.defaultValue,
    })),
    exitCodes: {
      success: 0,
      executionError: 1,
      invalidArguments: 2,
      interrupted: 130,
    },
    reportSchema,
    files: {
      json: 'array of candles',
      csv: 'header and rows in fields order',
      checkpoint: '<output>.checkpoint.json',
      partial: '<output>.part',
    },
  };
}
export function createProgram(
  action: (options: CliOptions) => Promise<void>,
): Command {
  const program = downloadOptions(new Command())
    .name('binance-historical')
    .description('Download historical Binance candles')
    .version(version())
    .allowExcessArguments(false)
    .exitOverride()
    .action(async (options) =>
      action({
        ...options,
        formatExplicit: program.getOptionValueSource('format') === 'cli',
      }),
    );
  const sub = downloadOptions(new Command('download').exitOverride())
    .description('Download candles')
    .allowExcessArguments(false)
    .action(async () => {
      const options = { ...program.opts(), ...sub.opts() };
      // Explicit root options win over subcommand defaults, but not explicit subcommand options.
      for (const key of Object.keys(program.opts()))
        if (
          program.getOptionValueSource(key) === 'cli' &&
          sub.getOptionValueSource(key) !== 'cli'
        )
          options[key] = program.opts()[key];
      await action({
        ...options,
        formatExplicit:
          sub.getOptionValueSource('format') === 'cli' ||
          program.getOptionValueSource('format') === 'cli',
      } as CliOptions);
    });
  program.addCommand(sub);
  program
    .command('describe')
    .exitOverride()
    .description('Describe capabilities and output contracts')
    .option('--json', 'Machine-readable capabilities')
    .action(() => {
      process.stdout.write(`${JSON.stringify(describe(), null, 2)}\n`);
    });
  return program;
}
export async function runCommand(argv: string[] = process.argv): Promise<void> {
  const machine = argv.includes('--json');
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  let report: RunReport | undefined;
  try {
    const program = createProgram(async (options) => {
      report = await download(options, controller.signal);
    });
    if (machine) {
      program.configureOutput({ writeErr: () => undefined });
      program.commands.forEach((command) =>
        command.configureOutput({ writeErr: () => undefined }),
      );
    }
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    const detail =
      error instanceof CommanderError
        ? { code: 'INVALID_ARGUMENT', message: error.message, retryable: false }
        : errorReport(error);
    report = { schemaVersion: 1, status: 'error', results: [], error: detail };
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
  if (!report) return;
  const failures = report.error
    ? [report.error]
    : report.results.flatMap((r) => (r.error ? [r.error] : []));
  process.exitCode =
    controller.signal.aborted || failures.some((e) => e.code === 'ABORTED')
      ? 130
      : failures.some((e) => e.code === 'INVALID_ARGUMENT')
        ? 2
        : report.status === 'error'
          ? 1
          : 0;
  if (machine) process.stdout.write(`${JSON.stringify(report)}\n`);
  else {
    for (const result of report.results) {
      if (result.status === 'success')
        process.stdout.write(
          `Downloaded ${result.count} candles to ${result.outputPath}\n`,
        );
      else
        process.stderr.write(
          `${result.pair}: ${result.error?.message}${result.resumable ? ' (use --resume)' : ''}\n`,
        );
    }
    if (report.error) process.stderr.write(`Error: ${report.error.message}\n`);
  }
}
