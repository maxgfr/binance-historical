import prompts from 'prompts';
import { PromptResult } from './types';
import { getKline } from './klines';
import { formatDate, saveKline } from './utils';
import { Command } from 'commander';

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

async function promptUser(): Promise<Partial<PromptResult>> {
  const { pair, interval, startDate, endDate, fileName } = await prompts(
    questions,
  );
  return { pair, interval, startDate, endDate, fileName };
}

async function processUserInformations() {
  const { pair, interval, startDate, endDate, fileName } = await promptUser();
  if (!pair || !interval || !startDate || !endDate || !fileName) {
    console.log('Missing informations 😭');
    return;
  }
  const kLines = await getKline(pair, interval, startDate, endDate).catch(
    () => {
      console.log(
        'Error with binance-api, we cannot get klines for this period or pair 😅',
      );
    },
  );
  if (kLines) {
    saveKline(
      fileName +
        `${pair}_${interval}_${formatDate(startDate)}_${formatDate(
          endDate,
        )}.json`,
      kLines,
    );
    console.log('Done 🎉');
  }
}

export async function runCommand() {
  const program = new Command();

  program
    .name('binance-historical')
    .description('Utility to download historical klines from binance');

  program
    .command('download')
    .description(
      'Download a JSON file which contains historical klines from binance api',
    )
    .action(() => processUserInformations());

  program.parse();
}
