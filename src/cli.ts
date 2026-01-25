import prompts from 'prompts';
import type { PromptResult, BinanceInterval } from './types';
import { getKline } from './klines';
import { formatDate, saveKline } from './utils';
import { Command } from 'commander';

const VALID_INTERVALS: BinanceInterval[] = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
];

const questions: Array<prompts.PromptObject> = [
  {
    type: 'text',
    name: 'pair',
    message: 'Pair that you want to track:',
    initial: 'ETHUSDT',
  },
  {
    type: 'select',
    name: 'interval',
    message: 'The interval:',
    choices: [
      { title: '1 minute', value: '1m' },
      { title: '3 minutes', value: '3m' },
      { title: '5 minutes', value: '5m' },
      { title: '15 minutes', value: '15m' },
      { title: '30 minutes', value: '30m' },
      { title: '1 hour', value: '1h' },
      { title: '2 hours', value: '2h' },
      { title: '4 hours', value: '4h' },
      { title: '6 hours', value: '6h' },
      { title: '8 hours', value: '8h' },
      { title: '12 hours', value: '12h' },
      { title: '1 day', value: '1d' },
      { title: '3 days', value: '3d' },
      { title: '1 week', value: '1w' },
    ],
    initial: 7,
  },
  {
    type: 'date',
    name: 'startDate',
    message: 'The starting date of the interval:',
    initial: new Date(),
  },
  {
    type: 'date',
    name: 'endDate',
    message: 'The ending date of the interval:',
    initial: new Date(),
  },
  {
    type: 'text',
    name: 'fileName',
    message: 'The path of the file that will be saved:',
    initial: `${process.cwd()}/`,
  },
];

interface CliOptions {
  pair?: string;
  interval?: string;
  start?: string;
  end?: string;
  output?: string;
}

function isValidInterval(interval: string): interval is BinanceInterval {
  return VALID_INTERVALS.includes(interval as BinanceInterval);
}

function parseDate(dateStr: string): Date | null {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function validateOptions(options: CliOptions): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (options.interval && !isValidInterval(options.interval)) {
    errors.push(
      `Invalid interval "${options.interval}". Valid intervals: ${VALID_INTERVALS.join(', ')}`,
    );
  }

  if (options.start && !parseDate(options.start)) {
    errors.push(
      `Invalid start date "${options.start}". Use format: YYYY-MM-DD or ISO 8601`,
    );
  }

  if (options.end && !parseDate(options.end)) {
    errors.push(
      `Invalid end date "${options.end}". Use format: YYYY-MM-DD or ISO 8601`,
    );
  }

  if (options.start && options.end) {
    const startDate = parseDate(options.start);
    const endDate = parseDate(options.end);
    if (startDate && endDate && startDate >= endDate) {
      errors.push('Start date must be before end date');
    }
  }

  return { valid: errors.length === 0, errors };
}

function hasAllRequiredOptions(options: CliOptions): boolean {
  return !!(
    options.pair &&
    options.interval &&
    options.start &&
    options.end &&
    options.output
  );
}

async function promptUser(): Promise<Partial<PromptResult>> {
  const { pair, interval, startDate, endDate, fileName } =
    await prompts(questions);
  return { pair, interval, startDate, endDate, fileName };
}

async function promptMissingOptions(
  options: CliOptions,
): Promise<Partial<PromptResult>> {
  const providedValues: Partial<PromptResult> = {};
  const missingQuestions: prompts.PromptObject[] = [];

  if (options.pair) {
    providedValues.pair = options.pair;
  } else {
    missingQuestions.push(questions[0]);
  }

  if (options.interval && isValidInterval(options.interval)) {
    providedValues.interval = options.interval;
  } else {
    missingQuestions.push(questions[1]);
  }

  if (options.start) {
    const date = parseDate(options.start);
    if (date) {
      providedValues.startDate = date;
    } else {
      missingQuestions.push(questions[2]);
    }
  } else {
    missingQuestions.push(questions[2]);
  }

  if (options.end) {
    const date = parseDate(options.end);
    if (date) {
      providedValues.endDate = date;
    } else {
      missingQuestions.push(questions[3]);
    }
  } else {
    missingQuestions.push(questions[3]);
  }

  if (options.output) {
    providedValues.fileName = options.output;
  } else {
    missingQuestions.push(questions[4]);
  }

  if (missingQuestions.length > 0) {
    const answers = await prompts(missingQuestions);
    return { ...providedValues, ...answers };
  }

  return providedValues;
}

async function downloadKlines(config: PromptResult): Promise<void> {
  const { pair, interval, startDate, endDate, fileName } = config;

  const kLines = await getKline(pair, interval, startDate, endDate).catch(
    (error) => {
      console.error('Error fetching klines:', error.message || error);
      return null;
    },
  );

  if (kLines) {
    const outputPath =
      fileName +
      `${pair}_${interval}_${formatDate(startDate)}_${formatDate(endDate)}.json`;
    saveKline(outputPath, kLines);
    console.log(`Downloaded ${kLines.length} klines to ${outputPath}`);
  }
}

async function processWithOptions(options: CliOptions): Promise<void> {
  const validation = validateOptions(options);
  if (!validation.valid) {
    for (const err of validation.errors) {
      console.error(`Error: ${err}`);
    }
    process.exit(1);
  }

  if (hasAllRequiredOptions(options)) {
    const pair = options.pair as string;
    const interval = options.interval as BinanceInterval;
    const startDate = parseDate(options.start as string) as Date;
    const endDate = parseDate(options.end as string) as Date;
    const fileName = options.output as string;

    await downloadKlines({ pair, interval, startDate, endDate, fileName });
  } else {
    const result = await promptMissingOptions(options);
    if (
      !result.pair ||
      !result.interval ||
      !result.startDate ||
      !result.endDate ||
      !result.fileName
    ) {
      console.error('Missing required information');
      process.exit(1);
    }
    await downloadKlines(result as PromptResult);
  }
}

async function processInteractive(): Promise<void> {
  const result = await promptUser();
  if (
    !result.pair ||
    !result.interval ||
    !result.startDate ||
    !result.endDate ||
    !result.fileName
  ) {
    console.error('Missing required information');
    process.exit(1);
  }
  await downloadKlines(result as PromptResult);
}

export async function runCommand(): Promise<void> {
  const program = new Command();

  program
    .name('binance-historical')
    .description('Utility to download historical klines from Binance')
    .version(process.env.npm_package_version || '1.0.0');

  program
    .command('download')
    .description(
      'Download a JSON file containing historical klines from Binance API',
    )
    .option('-p, --pair <symbol>', 'Trading pair (e.g., BTCUSDT, ETHUSDT)')
    .option(
      '-i, --interval <interval>',
      `Kline interval (${VALID_INTERVALS.join(', ')})`,
    )
    .option('-s, --start <date>', 'Start date (YYYY-MM-DD or ISO 8601)')
    .option('-e, --end <date>', 'End date (YYYY-MM-DD or ISO 8601)')
    .option(
      '-o, --output <path>',
      'Output directory path (filename is auto-generated)',
    )
    .action(async (options: CliOptions) => {
      const hasAnyOption =
        options.pair ||
        options.interval ||
        options.start ||
        options.end ||
        options.output;

      if (hasAnyOption) {
        await processWithOptions(options);
      } else {
        await processInteractive();
      }
    });

  program.parse();
}
