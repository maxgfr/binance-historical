import { Command } from 'commander';

const VALID_INTERVALS = [
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

describe('CLI Options', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program
      .name('binance-historical')
      .description('Download historical klines from Binance')
      .version('1.0.0')
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
      .option('-f, --format <format>', 'Output format (json, csv)', 'json');
  });

  describe('Option Parsing', () => {
    it('should parse pair option', () => {
      program.parse(['node', 'test', '--pair', 'BTCUSDT']);
      const options = program.opts();
      expect(options.pair).toBe('BTCUSDT');
    });

    it('should parse short pair option', () => {
      program.parse(['node', 'test', '-p', 'ETHUSDT']);
      const options = program.opts();
      expect(options.pair).toBe('ETHUSDT');
    });

    it('should parse interval option', () => {
      program.parse(['node', 'test', '--interval', '1h']);
      const options = program.opts();
      expect(options.interval).toBe('1h');
    });

    it('should parse short interval option', () => {
      program.parse(['node', 'test', '-i', '4h']);
      const options = program.opts();
      expect(options.interval).toBe('4h');
    });

    it('should parse start date option', () => {
      program.parse(['node', 'test', '--start', '2020-01-01']);
      const options = program.opts();
      expect(options.start).toBe('2020-01-01');
    });

    it('should parse short start date option', () => {
      program.parse(['node', 'test', '-s', '2020-01-01']);
      const options = program.opts();
      expect(options.start).toBe('2020-01-01');
    });

    it('should parse end date option', () => {
      program.parse(['node', 'test', '--end', '2020-12-31']);
      const options = program.opts();
      expect(options.end).toBe('2020-12-31');
    });

    it('should parse short end date option', () => {
      program.parse(['node', 'test', '-e', '2020-12-31']);
      const options = program.opts();
      expect(options.end).toBe('2020-12-31');
    });

    it('should parse output path option', () => {
      program.parse(['node', 'test', '--output', './data/']);
      const options = program.opts();
      expect(options.output).toBe('./data/');
    });

    it('should parse short output path option', () => {
      program.parse(['node', 'test', '-o', './data/']);
      const options = program.opts();
      expect(options.output).toBe('./data/');
    });

    it('should parse format option', () => {
      program.parse(['node', 'test', '--format', 'csv']);
      const options = program.opts();
      expect(options.format).toBe('csv');
    });

    it('should parse short format option', () => {
      program.parse(['node', 'test', '-f', 'csv']);
      const options = program.opts();
      expect(options.format).toBe('csv');
    });

    it('should use json as default format', () => {
      program.parse(['node', 'test']);
      const options = program.opts();
      expect(options.format).toBe('json');
    });

    it('should parse all options together', () => {
      program.parse([
        'node',
        'test',
        '-p',
        'BTCUSDT',
        '-i',
        '1h',
        '-s',
        '2020-01-01',
        '-e',
        '2020-12-31',
        '-o',
        './data/',
        '-f',
        'csv',
      ]);
      const options = program.opts();
      expect(options.pair).toBe('BTCUSDT');
      expect(options.interval).toBe('1h');
      expect(options.start).toBe('2020-01-01');
      expect(options.end).toBe('2020-12-31');
      expect(options.output).toBe('./data/');
      expect(options.format).toBe('csv');
    });
  });

  describe('Program Structure', () => {
    it('should have all required options', () => {
      const options = program.options || [];
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--pair');
      expect(optionNames).toContain('--interval');
      expect(optionNames).toContain('--start');
      expect(optionNames).toContain('--end');
      expect(optionNames).toContain('--output');
      expect(optionNames).toContain('--format');
    });

    it('should have correct short options', () => {
      const options = program.options || [];
      const shortOptions = options
        .map((opt) => opt.short)
        .filter((opt): opt is string => opt !== undefined);

      expect(shortOptions).toContain('-p');
      expect(shortOptions).toContain('-i');
      expect(shortOptions).toContain('-s');
      expect(shortOptions).toContain('-e');
      expect(shortOptions).toContain('-o');
      expect(shortOptions).toContain('-f');
    });
  });

  describe('Program Metadata', () => {
    it('should have correct program name', () => {
      expect(program.name()).toBe('binance-historical');
    });

    it('should have correct program description', () => {
      expect(program.description()).toBe(
        'Download historical klines from Binance',
      );
    });

    it('should have version', () => {
      expect(program.version()).toBe('1.0.0');
    });
  });
});
