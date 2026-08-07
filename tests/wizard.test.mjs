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

test('getProjectRoot miri do C:\\PROJECT se segmentem VELKYMI pismeny', async () => {
  const w = await loadWizard();
  setMetadata(w, { date: '2026-08-07', shortName: 'Test', projectType: 'ZAK', customer: 'KOFOLA' });
  assert.equal(w.getProjectRoot(), 'C:\\PROJECT\\ZAKAZNICI\\KOFOLA\\20260807_Test');
  setMetadata(w, { projectType: 'INT', customer: '' });
  assert.equal(w.getProjectRoot(), 'C:\\PROJECT\\INTERNI\\20260807_Test');
});

test('execution vrstva si drzi puvodni casing segmentu', async () => {
  const w = await loadWizard();
  setMetadata(w, { date: '2026-08-07', shortName: 'Test', projectType: 'ZAK', customer: 'KOFOLA' });
  assert.equal(w.getExecutionRoot(), 'C:\\DEV\\Claude\\Zakaznici\\KOFOLA\\20260807_Test');
});

test('getAssetsRoot se NEdopocitava — vraci prazdno bez explicitniho vstupu', async () => {
  const w = await loadWizard();
  setMetadata(w, { date: '2026-08-07', shortName: 'Test', projectType: 'ZAK', customer: 'KOFOLA', assetsBase: '' });
  assert.equal(w.getAssetsRoot(), '');
});

test('getAssetsRoot doplni zakaznika a PID k zadanemu korenu', async () => {
  const w = await loadWizard();
  setMetadata(w, {
    date: '2026-08-07', shortName: 'Test', projectType: 'ZAK', customer: 'KOFOLA',
    assetsBase: 'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\SAP Service - Projekty\\Zakaznici',
  });
  assert.equal(
    w.getAssetsRoot(),
    'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\SAP Service - Projekty\\Zakaznici\\KOFOLA\\20260807_Test'
  );
});

test('getRepoName: ZAK ma prefix zakaznika, INT nema', async () => {
  const w = await loadWizard();
  setMetadata(w, { date: '2026-08-07', shortName: 'Test', projectType: 'ZAK', customer: 'KOFOLA' });
  assert.equal(w.getRepoName(), 'KOFOLA_20260807_Test');
  setMetadata(w, { projectType: 'INT', customer: '' });
  assert.equal(w.getRepoName(), '20260807_Test');
});

test('parseTemplateMarkdown: PROJECT_ROOT (INT) se rozparsuje bez zdvojeni cesty', async () => {
  const w = await loadWizard();
  setMetadata(w, { projectBase: 'WRONG_BASE_MUSI_BYT_PREPSANA' });
  const tpl = `PROJECT_ID:      20260807_Test
PROJECT_NAME:    Test
DATE:            2026-08-07
PROJECT_TYPE:    INT
CUSTOMER:
PROJECT_ROOT:    C:\\PROJECT\\INTERNI\\20260807_Test
EXECUTION_ROOT:  C:\\DEV\\Claude\\Interni\\20260807_Test
INITIAL_MODE:    C
`;
  w.parseTemplateMarkdown(tpl);
  assert.equal(w.state.metadata.projectBase, 'C:\\PROJECT');
  assert.equal(w.getProjectRoot(), 'C:\\PROJECT\\INTERNI\\20260807_Test');
});

test('parseTemplateMarkdown: PROJECT_ROOT (ZAK) se rozparsuje bez zdvojeni cesty', async () => {
  const w = await loadWizard();
  setMetadata(w, { projectBase: 'WRONG_BASE_MUSI_BYT_PREPSANA' });
  const tpl = `PROJECT_ID:      20260807_Test
PROJECT_NAME:    Test
DATE:            2026-08-07
PROJECT_TYPE:    ZAK
CUSTOMER:        KOFOLA
PROJECT_ROOT:    C:\\PROJECT\\ZAKAZNICI\\KOFOLA\\20260807_Test
EXECUTION_ROOT:  C:\\DEV\\Claude\\Zakaznici\\KOFOLA\\20260807_Test
INITIAL_MODE:    C
`;
  w.parseTemplateMarkdown(tpl);
  assert.equal(w.state.metadata.projectBase, 'C:\\PROJECT');
  assert.equal(w.getProjectRoot(), 'C:\\PROJECT\\ZAKAZNICI\\KOFOLA\\20260807_Test');
});

test('parseTemplateMarkdown: legacy klic KNOWLEDGE_ROOT se stale parsuje (zpetna kompatibilita)', async () => {
  const w = await loadWizard();
  setMetadata(w, { projectBase: 'WRONG_BASE_MUSI_BYT_PREPSANA' });
  const tpl = `PROJECT_ID:      20260807_Test
PROJECT_NAME:    Test
DATE:            2026-08-07
PROJECT_TYPE:    INT
CUSTOMER:
KNOWLEDGE_ROOT:  C:\\PROJECT\\INTERNI\\20260807_Test
EXECUTION_ROOT:  C:\\DEV\\Claude\\Interni\\20260807_Test
INITIAL_MODE:    C
`;
  w.parseTemplateMarkdown(tpl);
  assert.equal(w.state.metadata.projectBase, 'C:\\PROJECT');
  assert.equal(w.getProjectRoot(), 'C:\\PROJECT\\INTERNI\\20260807_Test');
});

test('parseTemplateMarkdown: ASSETS_ROOT se rozparsuje do assetsBase a getAssetsRoot() vrati puvodni cestu', async () => {
  const w = await loadWizard();
  const fullAssetsPath = 'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\SAP Service - Projekty\\Zakaznici\\KOFOLA\\20260807_Test';
  const tpl = `PROJECT_ID:      20260807_Test
PROJECT_NAME:    Test
DATE:            2026-08-07
PROJECT_TYPE:    ZAK
CUSTOMER:        KOFOLA
PROJECT_ROOT:    C:\\PROJECT\\ZAKAZNICI\\KOFOLA\\20260807_Test
EXECUTION_ROOT:  C:\\DEV\\Claude\\Zakaznici\\KOFOLA\\20260807_Test
ASSETS_ROOT:     ${fullAssetsPath}
INITIAL_MODE:    C
`;
  w.parseTemplateMarkdown(tpl);
  assert.equal(
    w.state.metadata.assetsBase,
    'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\SAP Service - Projekty\\Zakaznici'
  );
  assert.equal(w.getAssetsRoot(), fullAssetsPath);
});

test('parseTemplateMarkdown: ASSETS_ROOT (INT, bez zakaznika) se rozparsuje a getAssetsRoot() vrati puvodni cestu', async () => {
  const w = await loadWizard();
  const fullAssetsPath = 'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\Interni\\20260807_Test';
  const tpl = `PROJECT_ID:      20260807_Test
PROJECT_NAME:    Test
DATE:            2026-08-07
PROJECT_TYPE:    INT
CUSTOMER:
PROJECT_ROOT:    C:\\PROJECT\\INTERNI\\20260807_Test
EXECUTION_ROOT:  C:\\DEV\\Claude\\Interni\\20260807_Test
ASSETS_ROOT:     ${fullAssetsPath}
INITIAL_MODE:    C
`;
  w.parseTemplateMarkdown(tpl);
  assert.equal(
    w.state.metadata.assetsBase,
    'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\Interni'
  );
  assert.equal(w.getAssetsRoot(), fullAssetsPath);
});

test('parseTemplateMarkdown: ASSETS_ROOT bez ocekavaneho suffixu NEuhodne base — vynuluje assetsBase', async () => {
  const w = await loadWizard();
  setMetadata(w, { assetsBase: 'WRONG_ASSETS_BASE_MUSI_BYT_VYNULOVANA' });
  const tpl = `PROJECT_ID:      20260807_Test
PROJECT_NAME:    Test
DATE:            2026-08-07
PROJECT_TYPE:    ZAK
CUSTOMER:        KOFOLA
PROJECT_ROOT:    C:\\PROJECT\\ZAKAZNICI\\KOFOLA\\20260807_Test
EXECUTION_ROOT:  C:\\DEV\\Claude\\Zakaznici\\KOFOLA\\20260807_Test
ASSETS_ROOT:     C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\SAP Service - Projekty\\Zakaznici\\OTHER\\20260807_Test
INITIAL_MODE:    C
`;
  w.parseTemplateMarkdown(tpl);
  assert.equal(w.state.metadata.assetsBase, '');
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

test('steps obsahuji krok topology pred vystupem', async () => {
  const w = await loadWizard();
  // Array.from (not .map) here: w.steps lives in the vm sandbox realm, so .map()
  // would build the result via that realm's Array constructor and fail
  // deepStrictEqual's prototype check against a main-realm literal array.
  const ids = Array.from(w.steps, (s) => s.id);
  assert.deepEqual(ids.slice(-2), ['topology', 'output']);
  assert.equal(w.steps.length, 11);
});

test('render nespadne na zadnem kroku', async () => {
  const w = await loadWizard();
  for (let i = 0; i < w.steps.length; i++) {
    w.state.currentStep = i;
    assert.doesNotThrow(() => w.render(), `krok ${i} (${w.steps[i].id}) spadl`);
  }
});

test('renderStepTopology nabizi oba zname OneDrive rooty', async () => {
  const w = await loadWizard();
  const html = w.renderStepTopology();
  assert.ok(html.includes('SAP Service - Projekty'), 'chybi SAP Service root');
  assert.ok(html.includes('9999Claude'), 'chybi 9999Claude root');
  assert.ok(html.includes('ARICOMAAEA'), 'chybi default org');
});

/** Zplosti strom na seznam jmen (rekurzivne). */
function flatten(node, acc = []) {
  acc.push(node.name);
  (node.children || []).forEach((c) => flatten(c, acc));
  return acc;
}

test('08_DEV ma repos.json a REPOS.md, ne ExecutionLayer.lnk', async () => {
  const w = await loadWizard();
  const names = flatten(w.buildTree());
  assert.ok(names.includes('repos.json'));
  assert.ok(names.includes('REPOS.md'));
  assert.ok(!names.includes('ExecutionLayer.lnk'), 'ExecutionLayer.lnk uz do V4 nepatri');
});

test('strom obsahuje V4 nadstavbu', async () => {
  const w = await loadWizard();
  const names = flatten(w.buildTree());
  for (const expected of ['_dev', '_assets', '_local', '.github', 'scripts',
                          '.gitignore', '.gitattributes', 'CHANGELOG.md',
                          'bootstrap.ps1', 'check-drift.ps1', 'Generate-ReposMd.ps1', 'Test-Topology.ps1',
                          'CODEOWNERS', 'CONTRIBUTING.md', 'PULL_REQUEST_TEMPLATE.md']) {
    assert.ok(names.includes(expected), `ve stromu chybi ${expected}`);
  }
});
