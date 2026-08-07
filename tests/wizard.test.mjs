import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWizard, setMetadata } from './harness.mjs';

test('wizard se nacte a vystavi cisté funkce', async () => {
  const w = await loadWizard();
  assert.equal(typeof w.getProjectId, 'function');
  assert.equal(typeof w.buildTree, 'function');
  assert.equal(typeof w.generateClaudePrompt, 'function');
});

test('getProjectId sklada YYYYMMDD_KratkyNazev', async () => {
  const w = await loadWizard();
  setMetadata(w, { date: '2026-08-07', shortName: 'CasovaOkna' });
  assert.equal(w.getProjectId(), '20260807_CasovaOkna');
});

test('ZAK ma v ceste uroven zakaznika, INT nema', async () => {
  const w = await loadWizard();
  setMetadata(w, { date: '2026-08-07', shortName: 'Test', projectType: 'ZAK', customer: 'KOFOLA' });
  assert.match(w.getExecutionRoot(), /Zakaznici\\KOFOLA\\20260807_Test$/);
  setMetadata(w, { projectType: 'INT', customer: '' });
  assert.match(w.getExecutionRoot(), /Interni\\20260807_Test$/);
  assert.doesNotMatch(w.getExecutionRoot(), /Zakaznici/);
});

test('buildTree vraci strom s korenem = PROJECT_ID', async () => {
  const w = await loadWizard();
  setMetadata(w, { date: '2026-08-07', shortName: 'Test' });
  const tree = w.buildTree();
  assert.equal(tree.name, '20260807_Test');
  assert.ok(tree.children.some((c) => c.name === '00_PROJECT_CONTROL'));
});

test('generatePowerShell je odstranen (mrtvy kod)', async () => {
  const w = await loadWizard();
  assert.equal(typeof w.generatePowerShell, 'undefined');
});
