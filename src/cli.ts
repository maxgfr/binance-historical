import prompts from 'prompts';
import { PromptResult } from './types';

import { getKline } from 'binance-historic';

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
    initial: `${__dirname}/`,
  },
];

export async function promptUser(): Promise<PromptResult> {
  const { pair, interval, startDate, endDate, fileName } = await prompts(
    questions,
  );
  return { pair, interval, startDate, endDate, fileName };
}
