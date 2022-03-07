import { promptUser } from './cli';
import { getKline } from './klines';
import { formatDate, saveKline } from './utils';

export { Kline } from './types';
export { getKline } from './klines';

async function main() {
  const { pair, interval, startDate, endDate, fileName } = await promptUser();
  const kLines = await getKline(pair, interval, startDate, endDate);
  saveKline(
    fileName +
      `${pair}_${interval}_${formatDate(startDate)}_${formatDate(
        endDate,
      )}.json`,
    kLines,
  );
}

main();
