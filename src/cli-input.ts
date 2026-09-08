import prompts from 'prompts';
import { Command } from 'commander';
import {
  DownloadError,
  INTERVALS,
  invalid,
  MARKETS,
  normalizePair,
  parseDate,
} from './config';
import type { BinanceInterval, Market } from './types';

export interface CliOptions {
  pair?: string;
  pairs?: string;
  interval?: string;
  start?: string;
  end?: string;
  output?: string;
  format: string;
  market: string;
  concurrency: string;
  nonInteractive?: boolean;
  json?: boolean;
  includeOpen?: boolean;
  resume?: boolean;
  overwrite?: boolean;
  formatExplicit?: boolean;
}
export function downloadOptions(command: Command): Command {
  return command
    .option('-p, --pair <symbol>', 'Trading pair or contract symbol')
    .option(
      '--pairs <symbols>',
      'Comma-separated symbols; mutually exclusive with --pair',
    )
    .option(
      '-i, --interval <interval>',
      `Candle interval (${INTERVALS.join(', ')})`,
    )
    .option(
      '-s, --start <date>',
      'Inclusive start: YYYY-MM-DD or ISO 8601 with timezone',
    )
    .option(
      '-e, --end <date>',
      'Exclusive end: YYYY-MM-DD or ISO 8601 with timezone',
    )
    .option(
      '-o, --output <directory>',
      'Output directory; filenames are generated',
    )
    .option('-f, --format <format>', 'Export file format (json, csv)', 'json')
    .option('--market <market>', 'spot, usd-m or coin-m', 'spot')
    .option('--concurrency <number>', 'Concurrent symbols (1–4)', '2')
    .option(
      '--include-open',
      'Include candles still forming at the reference instant',
    )
    .option('--resume', 'Resume a matching export using its checkpoint')
    .option(
      '--overwrite',
      'Replace existing exports after a successful download',
    )
    .option(
      '--non-interactive',
      'Fail on missing arguments instead of prompting',
    )
    .option(
      '--json',
      'Emit one machine-readable report on stdout; implies non-interactive',
    );
}
export async function completeOptions(
  options: CliOptions,
): Promise<CliOptions> {
  if (options.pair !== undefined && options.pairs !== undefined)
    invalid('--pair and --pairs are mutually exclusive');
  if (!Object.prototype.hasOwnProperty.call(MARKETS, options.market))
    invalid('Market must be spot, usd-m or coin-m');
  if (options.format !== 'json' && options.format !== 'csv')
    invalid('Format must be json or csv');
  if (options.resume && options.overwrite)
    invalid('--resume and --overwrite are mutually exclusive');
  if (!/^[1-4]$/.test(options.concurrency))
    invalid('Concurrency must be between 1 and 4');
  if (options.start !== undefined) parseDate(options.start);
  if (options.end !== undefined) parseDate(options.end);
  if (
    options.interval !== undefined &&
    !MARKETS[options.market as Market].intervals.includes(
      options.interval as BinanceInterval,
    )
  )
    invalid('Invalid interval for market');
  if (options.pair !== undefined) normalizePair(options.pair);
  if (options.pairs !== undefined)
    options.pairs.split(',').forEach(normalizePair);
  const required = ['interval', 'start', 'end', 'output'] as const;
  const missing: string[] = required.filter((key) => !options[key]);
  if (!options.pair && !options.pairs) missing.unshift('pair');
  if (
    missing.length &&
    (options.nonInteractive || options.json || !process.stdin.isTTY)
  )
    invalid(
      `Missing required options: ${missing.map((k) => `--${k}`).join(', ')}`,
    );
  if (!missing.length) return options;
  const defaultEnd = options.end ?? new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(
    parseDate(defaultEnd).getTime() - 30 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const questions: prompts.PromptObject[] = [
    {
      name: 'pair',
      type: 'text',
      message: 'Trading pair or contract:',
      initial: 'ETHUSDT',
    },
    {
      name: 'interval',
      type: 'select',
      message: 'Interval:',
      choices: MARKETS[options.market as Market].intervals.map((value) => ({
        title: value,
        value,
      })),
      initial: MARKETS[options.market as Market].intervals.indexOf('4h'),
    },
    {
      name: 'start',
      type: 'text',
      message: 'Inclusive start (YYYY-MM-DD or ISO with timezone):',
      initial: defaultStart,
    },
    {
      name: 'end',
      type: 'text',
      message: 'Exclusive end (YYYY-MM-DD or ISO with timezone):',
      initial: defaultEnd,
    },
    {
      name: 'output',
      type: 'text',
      message: 'Output directory:',
      initial: process.cwd(),
    },
  ];
  // Keep format selection in a fully interactive invocation.
  if (missing.length === 5 && !options.formatExplicit)
    questions.push({
      name: 'format',
      type: 'select',
      message: 'Output format:',
      choices: [
        { title: 'JSON', value: 'json' },
        { title: 'CSV', value: 'csv' },
      ],
    });
  const answers = await prompts(
    questions.filter(
      (q) => missing.includes(String(q.name)) || q.name === 'format',
    ),
    {
      onCancel: () => {
        throw new DownloadError('Download interrupted', 'ABORTED');
      },
    },
  );
  const result = { ...options, ...answers };
  for (const key of required) if (!result[key]) invalid(`Missing --${key}`);
  if (!result.pair && !result.pairs) invalid('Missing --pair or --pairs');
  return result;
}
