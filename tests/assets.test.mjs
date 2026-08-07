import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED = [
  'assets/scripts/bootstrap.ps1',
  'assets/scripts/check-drift.ps1',
  'assets/scripts/Generate-ReposMd.ps1',
  'assets/github/CODEOWNERS',
  'assets/github/CONTRIBUTING.md',
  'assets/github/PULL_REQUEST_TEMPLATE.md',
  'assets/git/gitignore',
  'assets/git/gitattributes',
];

test('vsechny povinne assety existuji', async () => {
  for (const rel of REQUIRED) {
    await access(join(ROOT, rel));
  }
});

test('skripty odvozuji koren pres PSScriptRoot, ne pres cwd', async () => {
  for (const rel of REQUIRED.filter((r) => r.endsWith('.ps1'))) {
    const src = await readFile(join(ROOT, rel), 'utf8');
    assert.ok(src.includes('Split-Path -Parent $PSScriptRoot'), `${rel} neodvozuje repoRoot z PSScriptRoot`);
    assert.ok(!/Get-Location|\$PWD/.test(src), `${rel} se opira o cwd`);
  }
});

test('v assetech nezustala zadna zakaznicka hodnota', async () => {
  for (const rel of REQUIRED) {
    const src = await readFile(join(ROOT, rel), 'utf8');
    assert.doesNotMatch(src, /KOFOLA|20260308_CasovaOkna|ZTMS_/, `${rel} obsahuje zakaznickou hodnotu`);
  }
});

test('gitignore pokryva vsech pet povinnych vzoru', async () => {
  const src = await readFile(join(ROOT, 'assets/git/gitignore'), 'utf8');
  for (const pat of ['_dev/', '_assets/', '_local/*', '.claude/worktrees/', '.claude/settings.local.json']) {
    assert.ok(src.includes(pat), `gitignore neobsahuje ${pat}`);
  }
});
