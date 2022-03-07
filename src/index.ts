#! /usr/bin/env node
export { Kline } from './types';
export { getKline } from './klines';
import { runCommand } from './cli';

if (require.main === module) {
  runCommand();
}
