import { Command } from 'commander';

describe('CLI Options', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program
      .name('binance-historical')
      .description('Utility to download historical klines from Binance')
      .version('1.0.0');

    program
      .command('download')
      .description('Download historical klines from Binance API')
      .option('-p, --pair <symbol>', 'Trading pair (e.g., BTCUSDT, ETHUSDT)')
      .option(
        '-i, --interval <interval>',
        'Kline interval (1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w)',
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
      program.parse(['node', 'test', 'download', '--pair', 'BTCUSDT']);
      const options = program.commands[0].opts();
      expect(options.pair).toBe('BTCUSDT');
    });

    it('should parse short pair option', () => {
      program.parse(['node', 'test', 'download', '-p', 'ETHUSDT']);
      const options = program.commands[0].opts();
      expect(options.pair).toBe('ETHUSDT');
    });

    it('should parse interval option', () => {
      program.parse(['node', 'test', 'download', '--interval', '1h']);
      const options = program.commands[0].opts();
      expect(options.interval).toBe('1h');
    });

    it('should parse short interval option', () => {
      program.parse(['node', 'test', 'download', '-i', '4h']);
      const options = program.commands[0].opts();
      expect(options.interval).toBe('4h');
    });

    it('should parse start date option', () => {
      program.parse(['node', 'test', 'download', '--start', '2020-01-01']);
      const options = program.commands[0].opts();
      expect(options.start).toBe('2020-01-01');
    });

    it('should parse short start date option', () => {
      program.parse(['node', 'test', 'download', '-s', '2020-01-01']);
      const options = program.commands[0].opts();
      expect(options.start).toBe('2020-01-01');
    });

    it('should parse end date option', () => {
      program.parse(['node', 'test', 'download', '--end', '2020-12-31']);
      const options = program.commands[0].opts();
      expect(options.end).toBe('2020-12-31');
    });

    it('should parse short end date option', () => {
      program.parse(['node', 'test', 'download', '-e', '2020-12-31']);
      const options = program.commands[0].opts();
      expect(options.end).toBe('2020-12-31');
    });

    it('should parse output path option', () => {
      program.parse(['node', 'test', 'download', '--output', './data/']);
      const options = program.commands[0].opts();
      expect(options.output).toBe('./data/');
    });

    it('should parse short output path option', () => {
      program.parse(['node', 'test', 'download', '-o', './data/']);
      const options = program.commands[0].opts();
      expect(options.output).toBe('./data/');
    });

    it('should parse format option', () => {
      program.parse(['node', 'test', 'download', '--format', 'csv']);
      const options = program.commands[0].opts();
      expect(options.format).toBe('csv');
    });

    it('should parse short format option', () => {
      program.parse(['node', 'test', 'download', '-f', 'csv']);
      const options = program.commands[0].opts();
      expect(options.format).toBe('csv');
    });

    it('should use json as default format', () => {
      program.parse(['node', 'test', 'download']);
      const options = program.commands[0].opts();
      expect(options.format).toBe('json');
    });

    it('should parse all options together', () => {
      program.parse([
        'node',
        'test',
        'download',
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
      const options = program.commands[0].opts();
      expect(options.pair).toBe('BTCUSDT');
      expect(options.interval).toBe('1h');
      expect(options.start).toBe('2020-01-01');
      expect(options.end).toBe('2020-12-31');
      expect(options.output).toBe('./data/');
      expect(options.format).toBe('csv');
    });
  });

  describe('Command Structure', () => {
    it('should have download command', () => {
      const downloadCommand = program.commands.find(
        (cmd) => cmd.name() === 'download',
      );
      expect(downloadCommand).toBeDefined();
    });

    it('should have correct command description', () => {
      const downloadCommand = program.commands.find(
        (cmd) => cmd.name() === 'download',
      );
      expect(downloadCommand?.description()).toBe(
        'Download historical klines from Binance API',
      );
    });

    it('should have all required options', () => {
      const downloadCommand = program.commands.find(
        (cmd) => cmd.name() === 'download',
      );
      const options = downloadCommand?.options || [];
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--pair');
      expect(optionNames).toContain('--interval');
      expect(optionNames).toContain('--start');
      expect(optionNames).toContain('--end');
      expect(optionNames).toContain('--output');
      expect(optionNames).toContain('--format');
    });

    it('should have correct short options', () => {
      const downloadCommand = program.commands.find(
        (cmd) => cmd.name() === 'download',
      );
      const options = downloadCommand?.options || [];
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
        'Utility to download historical klines from Binance',
      );
    });

    it('should have version', () => {
      expect(program.version()).toBe('1.0.0');
    });
  });
});
