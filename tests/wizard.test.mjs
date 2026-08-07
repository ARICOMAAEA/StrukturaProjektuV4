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

/** Bezne naplnena metadata pro testy promptu. */
function fullMetadata(w) {
  return setMetadata(w, {
    date: '2026-08-07', shortName: 'Test', fullName: 'Testovaci projekt',
    projectType: 'ZAK', customer: 'KOFOLA',
    assetsBase: 'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\SAP Service - Projekty\\Zakaznici',
    githubOrg: 'ARICOMAAEA', branchOwner: 'vojta',
  });
}

test('prompt uvadi vsechny tri koreny a GitHub repo', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  const p = w.generateClaudePrompt();
  assert.ok(p.includes('C:\\PROJECT\\ZAKAZNICI\\KOFOLA\\20260807_Test'), 'chybi PROJECT_ROOT');
  assert.ok(p.includes('C:\\DEV\\Claude\\Zakaznici\\KOFOLA\\20260807_Test'), 'chybi EXECUTION_ROOT');
  assert.ok(p.includes('SAP Service - Projekty\\Zakaznici\\KOFOLA\\20260807_Test'), 'chybi ASSETS_ROOT');
  assert.ok(p.includes('ARICOMAAEA/KOFOLA_20260807_Test'), 'chybi GITHUB_REPO');
});

test('prompt uz nezminuje ExecutionLayer.lnk', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  assert.ok(!w.generateClaudePrompt().includes('ExecutionLayer.lnk'));
});

test('prompt varuje, kdyz assetsRoot neni vyplnen', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  setMetadata(w, { assetsBase: '' });
  const p = w.generateClaudePrompt();
  assert.ok(p.startsWith('!! NEDOKONCENY VSTUP'), 'prompt bez assetsRoot musi zacinat varovanim');
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

test('prompt ma vsech 8 fazi ve spravnem poradi', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  const p = w.generateClaudePrompt();
  const order = ['FAZE 0', 'FAZE 1', 'FAZE 2', 'FAZE 3', 'FAZE 4', 'FAZE 5', 'FAZE 6', 'FAZE 7', 'FAZE 8'];
  let last = -1;
  for (const f of order) {
    const at = p.indexOf(f);
    assert.ok(at > -1, `chybi ${f}`);
    assert.ok(at > last, `${f} je mimo poradi`);
    last = at;
  }
});

test('branch protection prijde az PO prvnim pushi', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  const p = w.generateClaudePrompt();
  const create = p.indexOf('gh repo create');
  const protect = p.toLowerCase().indexOf('branch protection');
  assert.ok(create > -1, 'prompt musi obsahovat gh repo create');
  assert.ok(protect > -1, 'prompt musi obsahovat branch protection');
  assert.ok(create < protect, 'protection se nesmi zapinat pred prvnim pushem');
});

test('obe GitHub faze maji potvrzovaci branu', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  const p = w.generateClaudePrompt();
  assert.equal((p.match(/\[POTVRZENI\]/g) || []).length, 2);
});

test('prompt predepisuje UTF-8 s BOM a odkazuje na assets sablony', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  const p = w.generateClaudePrompt();
  assert.ok(/UTF-8 s BOM/i.test(p), 'chybi pozadavek na BOM');
  assert.ok(p.includes('assets\\scripts'), 'chybi odkaz na zdroj skriptu');
});

// --- Finding 2: wizard je V4, ne V3 ---

test('wizard se hlasi jako V4 v title, sidebar hlavicce a verzi', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const html = await readFile(join(here, '..', 'struktura-wizard.html'), 'utf8');
  assert.ok(html.includes('<title>Meta Framework V4'), 'title stale rika V3');
  assert.ok(html.includes('Meta Framework V4</h1>'), 'sidebar hlavicka stale rika V3');
  assert.ok(html.includes('>V4.0<'), 'verze v patce stale rika V3.0');
  assert.ok(!/Meta Framework V3/.test(html), 'nekde v HTML jeste zbylo "Meta Framework V3"');
});

test('folder-description README frontmatter uvadi V4 init, ne V3', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  const p = w.generateClaudePrompt();
  assert.ok(p.includes('origin_source: Meta Framework V4 init'), 'origin_source stale rika V3 init');
  assert.ok(!p.includes('Meta Framework V3 init'), 'origin_source jeste rika V3 init');
});

test('stahnutelna sablona ma nadpis V4, ne V3', async () => {
  let captured = '';
  const w = await loadWizard({
    Blob: class { constructor(parts) { captured = parts.join(''); } },
  });
  w.downloadBlankTemplate();
  assert.ok(captured.includes('# META FRAMEWORK V4'), 'sablona stale rika V3');
});

// --- Finding 3: akceptacni brana musi overit remote ---

test('FAZE 8 vola Test-Topology.ps1 s -ExpectedRemote', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  const p = w.generateClaudePrompt();
  const faze8 = p.slice(p.indexOf('FAZE 8'));
  assert.ok(/Test-Topology\.ps1"\s+-ExpectedRemote\s+"ARICOMAAEA\/KOFOLA_20260807_Test"/.test(faze8),
    'FAZE 8 nepreda -ExpectedRemote, kontrola 8 gate se pak vzdy SKIPne');
});

// --- Finding 4: Rychly import nesmi tise zahodit GitHub pole ---

test('downloadBlankTemplate emituje GITHUB_ORG/REPO_NAME/REPO_PRIVATE/BRANCH_OWNER', async () => {
  let captured = '';
  const w = await loadWizard({
    Blob: class { constructor(parts) { captured = parts.join(''); } },
  });
  w.downloadBlankTemplate();
  assert.ok(/GITHUB_ORG:/.test(captured), 'sablona neobsahuje GITHUB_ORG');
  assert.ok(/REPO_NAME:/.test(captured), 'sablona neobsahuje REPO_NAME');
  assert.ok(/REPO_PRIVATE:/.test(captured), 'sablona neobsahuje REPO_PRIVATE');
  assert.ok(/BRANCH_OWNER:/.test(captured), 'sablona neobsahuje BRANCH_OWNER');
});

test('parseTemplateMarkdown: GITHUB_ORG/REPO_NAME/REPO_PRIVATE/BRANCH_OWNER se rozparsuji (round-trip)', async () => {
  const w = await loadWizard();
  const tpl = `PROJECT_ID:      20260807_Test
PROJECT_NAME:    Test
DATE:            2026-08-07
PROJECT_TYPE:    INT
CUSTOMER:
PROJECT_ROOT:    C:\\PROJECT\\INTERNI\\20260807_Test
EXECUTION_ROOT:  C:\\DEV\\Claude\\Interni\\20260807_Test
INITIAL_MODE:    C
GITHUB_ORG:      MojeOrg
REPO_NAME:       muj-repo
REPO_PRIVATE:    ne
BRANCH_OWNER:    petr
`;
  w.parseTemplateMarkdown(tpl);
  assert.equal(w.state.metadata.githubOrg, 'MojeOrg');
  assert.equal(w.state.metadata.repoName, 'muj-repo');
  assert.equal(w.state.metadata.repoPrivate, false);
  assert.equal(w.state.metadata.branchOwner, 'petr');
});

test('parseTemplateMarkdown: REPO_PRIVATE chybejici nebo nerozpoznane zustava private (bezpecny vychozi stav)', async () => {
  const w = await loadWizard();
  const tplMissing = `PROJECT_ID:      20260807_Test
PROJECT_NAME:    Test
DATE:            2026-08-07
PROJECT_TYPE:    INT
CUSTOMER:
PROJECT_ROOT:    C:\\PROJECT\\INTERNI\\20260807_Test
EXECUTION_ROOT:  C:\\DEV\\Claude\\Interni\\20260807_Test
INITIAL_MODE:    C
`;
  w.parseTemplateMarkdown(tplMissing);
  assert.equal(w.state.metadata.repoPrivate, true, 'chybejici REPO_PRIVATE musi zustat private');

  const w2 = await loadWizard();
  const tplGibberish = tplMissing + 'REPO_PRIVATE:    asi jo\n';
  w2.parseTemplateMarkdown(tplGibberish);
  assert.equal(w2.state.metadata.repoPrivate, true, 'nerozpoznana hodnota REPO_PRIVATE musi zustat private');
});

test('prompt varuje, kdyz branchOwner neni vyplnen (spec ho oznacuje jako povinny)', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  setMetadata(w, { branchOwner: '' });
  const p = w.generateClaudePrompt();
  assert.ok(p.startsWith('!! NEDOKONCENY VSTUP'), 'prompt bez branchOwner musi zacinat varovanim');
});

// --- Finding 5: FAZE 6 ma konkretni prikaz a ruleset je genericky ---

test('FAZE 6 obsahuje konkretni gh api prikaz pro ruleset, ne jen prozu', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  const p = w.generateClaudePrompt();
  const faze6 = p.slice(p.indexOf('FAZE 6'), p.indexOf('FAZE 7'));
  assert.ok(/gh api repos\/ARICOMAAEA\/KOFOLA_20260807_Test\/rulesets/.test(faze6),
    'FAZE 6 neobsahuje konkretni gh api prikaz pro ruleset');
  assert.ok(faze6.includes('branch_name_pattern'), 'FAZE 6 neobsahuje JSON telo rulesetu');
});

test('FAZE 6 ruleset vynucuje genericky vzor <jmeno>/<co-dela>, ne jen branchOwner', async () => {
  const w = await loadWizard();
  fullMetadata(w);
  const p = w.generateClaudePrompt();
  const faze6 = p.slice(p.indexOf('FAZE 6'), p.indexOf('FAZE 7'));
  assert.ok(faze6.includes('^[a-z0-9-]+/[a-z0-9-]+$'), 'ruleset pattern neni genericky (chybi regex z CONTRIBUTING.md)');
  assert.ok(/ZAMERNE GENERICKY|genericky/i.test(faze6), 'text nevysvetluje, ze vzor je genericky pro vsechny contributory');
});

// --- Finding 5b: kazdy {{TOKEN}} v assets/ musi mit instrukci k substituci v promptu ---

test('kazdy {{TOKEN}} zastupny symbol v assets/ je zminen v generovanem promptu', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const assetsRoot = join(here, '..', 'assets');

  const entries = await readdir(assetsRoot, { recursive: true, withFileTypes: true });
  const tokens = new Set();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = join(entry.path ?? entry.parentPath, entry.name);
    const content = await readFile(full, 'utf8');
    for (const m of content.matchAll(/\{\{[A-Z0-9_]+\}\}/g)) tokens.add(m[0]);
  }
  assert.ok(tokens.size > 0, 'test setup: v assets/ nebyl nalezen zadny {{TOKEN}} — over cestu/regex');

  const w = await loadWizard();
  fullMetadata(w);
  const p = w.generateClaudePrompt();
  for (const token of tokens) {
    assert.ok(p.includes(token), `prompt nezminuje zastupny symbol ${token} (chybi instrukce k substituci)`);
  }
});
