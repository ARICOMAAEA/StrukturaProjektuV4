import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED = [
  'assets/scripts/bootstrap.ps1',
  'assets/scripts/check-drift.ps1',
  'assets/scripts/Generate-ReposMd.ps1',
  'assets/scripts/Test-Topology.ps1',
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
    assert.doesNotMatch(src, /KOFOLA|20260308_CasovaOkna|ZTMS_|Pivovar|S23|KSF/, `${rel} obsahuje zakaznickou/projektovou hodnotu`);
  }
});

test('CODEOWNERS: kazdy neKomentarovy owner radek zacina owner token znakem @', async () => {
  const src = await readFile(join(ROOT, 'assets/github/CODEOWNERS'), 'utf8');
  const ownerLines = src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  assert.ok(ownerLines.length > 0, 'CODEOWNERS neobsahuje zadny owner radek');
  for (const line of ownerLines) {
    const parts = line.split(/\s+/).filter(Boolean);
    const ownerTokens = parts.slice(1);
    assert.ok(ownerTokens.length > 0, `radek "${line}" nema owner token`);
    for (const token of ownerTokens) {
      assert.ok(token.startsWith('@'), `owner token "${token}" v radku "${line}" nezacina znakem @`);
    }
  }
});

// Sha-256 pins guarding against silent drift in the copied .ps1 assets.
// bootstrap.ps1 and check-drift.ps1 are still byte-identical to the KOFOLA
// source copied in Task 9. Generate-ReposMd.ps1 is the one exception: the
// KOFOLA source has a bug — `Sort-Object` over an empty `repos` array returns
// $null (not an empty array), and `.Count` on that $null then throws under
// `Set-StrictMode -Version Latest`. It never surfaced in KOFOLA because that
// manifest is never empty, but every freshly generated V4 project starts with
// `repos: []`, so the bug fired on 100% of generated projects. It was fixed
// here (wrapped in `@(...)`), so this pin no longer means "byte-identical to
// KOFOLA forever" for this one file — it means "byte-identical to the
// corrected source". If this test fails, someone edited the script by hand;
// if you intentionally change it again, recompute and update the pin.
// The KOFOLA source itself still has the bug and needs a separate back-port —
// that repo is production/read-only from here and is not touched by this test.
const PS1_SHA256 = {
  'assets/scripts/bootstrap.ps1': 'a0aa9abe54f039e3b66f8f023a383a40b05e72865916654fdf7ac8cd7a0b59b5',
  'assets/scripts/check-drift.ps1': '42d697f71be8360a86872b8a35fe1b22ec9b7d6be7d600692ab668c497faba12',
  'assets/scripts/Generate-ReposMd.ps1': '5091c899b88deaf49bdf8e5a79eeff1da7b5b46601f72583180dbe83a529c768',
};

test('kopirovane .ps1 skripty zustavaji byte-identicke se zdrojem (sha256 pin)', async () => {
  for (const [rel, expected] of Object.entries(PS1_SHA256)) {
    const buf = await readFile(join(ROOT, rel));
    const actual = createHash('sha256').update(buf).digest('hex');
    assert.equal(actual, expected, `${rel} se zmenil oproti ocekavane (pinovane) verzi`);
  }
});

test('gitignore pokryva vsech pet povinnych vzoru', async () => {
  const src = await readFile(join(ROOT, 'assets/git/gitignore'), 'utf8');
  for (const pat of ['_dev/', '_assets/', '_local/*', '.claude/worktrees/', '.claude/settings.local.json']) {
    assert.ok(src.includes(pat), `gitignore neobsahuje ${pat}`);
  }
});
