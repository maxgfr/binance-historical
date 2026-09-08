const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const temp = mkdtempSync(join(tmpdir(), 'binance-skill-'));
try {
  const result = spawnSync(
    'npx',
    [
      '--yes',
      'skills@1.5.24',
      'add',
      root,
      '--skill',
      'binance-historical',
      '--agent',
      'claude-code',
      'codex',
      '--yes',
    ],
    { cwd: temp, encoding: 'utf8', timeout: 120000 },
  );
  assert.equal(
    result.status,
    0,
    result.error?.message || result.stderr + result.stdout,
  );
  const source = readFileSync(
    join(root, 'skills/binance-historical/SKILL.md'),
    'utf8',
  );
  for (const agent of ['.agents', '.claude'])
    assert.equal(
      readFileSync(
        join(temp, agent, 'skills/binance-historical/SKILL.md'),
        'utf8',
      ),
      source,
    );
  console.log('npx skills installation for Claude Code and Codex: OK');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
