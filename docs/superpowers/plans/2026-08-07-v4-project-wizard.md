---
created: 2026-08-07 11:15
author: Vojta (p. Lička)
origin_type: analysis
origin_source: "Spec 2026-08-07-v4-project-wizard-design.md (schválen 2026-08-07)"
purpose: Implementační plán rozšíření StrukturaProjektu wizardu z topologie V3 na V4 — task po tasku, s testy.
---

# V4 Project Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozšířit `struktura-wizard.html` tak, aby generoval Claude Code prompt zakládající projekt v topologii V4 (git projektová vrstva v `C:\PROJECT`, execution vrstva, binární mirror na OneDrive, manifest `repos.json`, čtyři podpůrné skripty, chráněný `main`).

**Architecture:** Wizard je jeden HTML soubor s inline `<script>`. Zásah je lokalizovaný do pěti míst: cestové funkce, `steps`/`renderers`, `buildTree()`, `generateClaudePrompt()` a smazání mrtvého `generatePowerShell()`. Obsah skriptů a `.github` šablon se do promptu nevkládá — leží jako reálné soubory v `assets/` a prompt na ně odkáže absolutní cestou odvozenou z `location.pathname`.

**Tech Stack:** Vanilla JS v jednom HTML souboru (bez build stepu, bez frameworku) · Node 24 `node:test` + `node:vm` pro testy wizardu · PowerShell 5.1 + Pester 3.4 pro test `Test-Topology.ps1` · `gh` CLI 2.86 pro akceptační test.

## Global Constants

Hodnoty opsané doslovně ze specu. Platí pro každý task.

- Projektová vrstva: `C:\PROJECT\ZAKAZNICI\<CUSTOMER>\<PID>` (ZAK) / `C:\PROJECT\INTERNI\<PID>` (INT) — segment **velkými písmeny**
- Execution vrstva: `C:\DEV\Claude\Zakaznici\<CUSTOMER>\<PID>` / `C:\DEV\Claude\Interni\<PID>` — segment **s velkým počátečním**
- `assetsRoot` je vždy **explicitní vstup**, nikdy se nedopočítává z názvu zákazníka
- Repo name: `<CUSTOMER>_<PID>` (ZAK) / `<PID>` (INT); org default `ARICOMAAEA`, private
- Branch protection: PR povinný i pro adminy, `required_approving_review_count: 0`, `delete_branch_on_merge: true`, ruleset `personal-branch-naming` se vzorem `<branchOwner>/<co-dela>`
- Pořadí `git init` → první commit → `gh repo create` → push → **až pak** branch protection
- Každý soubor čtený zpátky PowerShellem 5.1 musí být **UTF-8 s BOM**
- Každý PS skript odvozuje kořen přes `$repoRoot = Split-Path -Parent $PSScriptRoot`, nikdy přes cwd
- `.gitignore` musí od prvního commitu obsahovat: `_dev/`, `_assets/`, `_local/*`, `.claude/worktrees/`, `.claude/settings.local.json`
- Fáze `gh repo create` a branch protection se **nikdy neprovedou bez potvrzení uživatele**

**Pracovní adresář všech tasků:** `C:\Users\licka\OneDrive - ARICOMA\Prace\projekty\00_TOOLS\StrukturaProjektuV3`
(přejmenuje se na `…V4` až v Tasku 11 — do té doby všechny cesty používají `V3`)

## File Structure

| Soubor | Odpovědnost | Task |
|---|---|---|
| `package.json` | deklarace `npm test` | 1 |
| `tests/harness.mjs` | načte HTML, vytáhne `<script>`, vyhodnotí ve `vm` s DOM stuby, vrátí sandbox | 1 |
| `tests/wizard.test.mjs` | testy čistých funkcí wizardu | 1–8 |
| `struktura-wizard.html` | wizard samotný | 2–8 |
| `assets/scripts/*.ps1` | čtyři skripty dodávané do projektu | 9 |
| `assets/github/*` | CODEOWNERS, CONTRIBUTING.md, PULL_REQUEST_TEMPLATE.md | 9 |
| `assets/git/{gitignore,gitattributes}` | bez tečky, aby je git tooling neignoroval | 9 |
| `tests/Test-Topology.Tests.ps1` | Pester testy health-checku | 10 |
| `README.md`, `CHANGELOG.md` | dokumentace nástroje | 11 |
| `~\.claude\skills\meta-framework-init\SKILL.md` | deprecation stub | 12 |
| `~\.claude\CLAUDE.md` | přeformulování pravidla execution layer | 12 |

---

### Task 1: Testovací harness

Wizard dnes nemá žádné testy. Bez nich je každá další změna v 2940řádkovém souboru slepá. Tento task nemění chování — jen zamyká to současné.

**Files:**
- Create: `package.json`
- Create: `tests/harness.mjs`
- Create: `tests/wizard.test.mjs`

**Interfaces:**
- Produces: `loadWizard()` → `Promise<sandbox>`, kde `sandbox` má `state`, `getProjectId()`, `getKnowledgeRoot()`, `getExecutionRoot()`, `buildTree()`, `generateClaudePrompt()`, `render()`. Používají ho všechny další tasky.

- [ ] **Step 1: Napiš harness**

Vytvoř `tests/harness.mjs`:

```javascript
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = join(HERE, '..', 'struktura-wizard.html');

/** Minimalni DOM stub — wizard pouziva jen getElementById, body, createElement,
 *  addEventListener, execCommand. Kazdy prvek je zapisovatelny no-op objekt. */
function makeElement() {
  return {
    innerHTML: '', textContent: '', className: '', value: '', disabled: false,
    style: {}, checked: false,
    classList: { add() {}, remove() {} },
    appendChild() {}, removeChild() {}, select() {}, click() {}, focus() {},
    addEventListener() {},
  };
}

function makeDocument() {
  const body = makeElement();
  return {
    body,
    getElementById: () => makeElement(),
    createElement: () => makeElement(),
    addEventListener: () => {},
    execCommand: () => true,
  };
}

/** Vytahne hlavni inline <script> blok.
 *  Soubor jich ma vic (radek 7 = tailwind CDN se src, radek 10 = tailwind config,
 *  radek 134 = wizard). Bereme nejdelsi blok BEZ atributu src — to je vzdy wizard.
 *  Greedy regex pres cely soubor by slepil vsechny bloky dohromady a rozbil syntaxi. */
function extractMainScript(html) {
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length) throw new Error('V struktura-wizard.html nenalezen zadny inline <script> blok.');
  return blocks.reduce((longest, b) => (b.length > longest.length ? b : longest), '');
}

/** Nacte wizard, vyhodnoti jeho <script> v izolovanem kontextu a vrati sandbox. */
export async function loadWizard(overrides = {}) {
  const html = await readFile(HTML, 'utf8');
  const source = extractMainScript(html);

  const store = new Map();
  const sandbox = {
    document: makeDocument(),
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout: () => 0,
    console,
    Blob: class { constructor() {} },
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} },
    FileReader: class { readAsText() {} },
    confirm: () => false,
    alert: () => {},
    ...overrides,
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'struktura-wizard.js' });

  // Deklarace `const` / `let` se ve vm kontextu NENAVESI na globalni objekt —
  // na sandbox se dostanou jen `var` a deklarace funkci. `state` (let) a `steps`
  // (const) proto musime vyexportovat explicitne. `this` je na top-levelu
  // vm skriptu globalni objekt kontextu.
  vm.runInContext('this.state = state; this.steps = steps;', sandbox);

  return sandbox;
}

/** Nastavi metadata a znovu vyhodnoti odvozene hodnoty. */
export function setMetadata(w, patch) {
  Object.assign(w.state.metadata, patch);
  return w;
}
```

- [ ] **Step 2: Napiš charakterizační testy současného chování**

Vytvoř `tests/wizard.test.mjs`:

```javascript
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
```

- [ ] **Step 3: Vytvoř `package.json`**

```json
{
  "name": "struktura-projektu-wizard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  }
}
```

Pozn.: glob `tests/*.test.mjs`, **ne** `tests/`. Bare-directory forma pada na Node v24.13.0
s `MODULE_NOT_FOUND`. Glob resi Node nativne, takze funguje i pres cmd.exe, ktery npm
na Windows spousti.

- [ ] **Step 4: Spusť testy**

Run: `npm test`
Expected: **PASS**, 4 testy. Pokud harness spadne na chybějícím DOM API, doplň ho do `makeElement()` / `makeDocument()` — neupravuj kvůli tomu wizard.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/
git commit -m "test: harness a charakterizacni testy wizardu"
```

---

### Task 2: Smazat mrtvý `generatePowerShell()`

Funkce nemá volajícího — `renderOutputPanel()` (ř. 760) má jen dvě záložky. Smazání je bezpečné a zmenší soubor o 616 řádků, které by jinak bylo nutné držet v souladu s novým promptem.

**Files:**
- Modify: `struktura-wizard.html:1606-2221` (smazat)
- Modify: `tests/wizard.test.mjs`

**Interfaces:**
- Produces: nic. Pouze odstranění.

- [ ] **Step 1: Napiš selhávající test**

Přidej do `tests/wizard.test.mjs`:

```javascript
test('generatePowerShell je odstranen (mrtvy kod)', async () => {
  const w = await loadWizard();
  assert.equal(typeof w.generatePowerShell, 'undefined');
});
```

- [ ] **Step 2: Ověř, že test selže**

Run: `npm test`
Expected: FAIL — `Expected values to be strictly equal: 'function' !== 'undefined'`

- [ ] **Step 3: Ověř, že funkci nikdo nevolá**

Run: `grep -n "generatePowerShell" struktura-wizard.html`
Expected: přesně **jeden** výskyt — řádek s `function generatePowerShell() {`. Pokud jich je víc, ZASTAV a nahlas to; funkce není mrtvá a plán je špatně.

- [ ] **Step 4: Smaž funkci**

Smaž souvislý blok od řádku `function generatePowerShell() {` po jeho uzavírací `}` (poslední řádky bloku jsou `  return script;` a `}`), včetně prázdného řádku za ním. Blok končí těsně před bannerem `// ====…` / `// CLIPBOARD & DOWNLOAD`.

- [ ] **Step 5: Ověř, že testy prochází**

Run: `npm test`
Expected: PASS, 5 testů. Ostatní čtyři testy musí projít beze změny — pokud ne, smazal jsi příliš.

- [ ] **Step 6: Commit**

```bash
git add struktura-wizard.html tests/wizard.test.mjs
git commit -m "refactor: smazat mrtvy generatePowerShell (616 radku bez volajiciho)"
```

---

### Task 3: Cesty na topologii V4

Přepnout projektovou vrstvu z OneDrive na `C:\PROJECT` (segment velkými písmeny) a zavést explicitní `assetsRoot`. Execution vrstva zůstává beze změny.

**Files:**
- Modify: `struktura-wizard.html:149` (`knowledgeBase` → `projectBase`, nová pole)
- Modify: `struktura-wizard.html:303-311` (`getKnowledgeRoot` → `getProjectRoot`)
- Modify: `struktura-wizard.html` — všechna volání `getKnowledgeRoot()`
- Modify: `tests/wizard.test.mjs`

**Interfaces:**
- Produces:
  - `getProjectRoot(): string` — `<projectBase>\ZAKAZNICI\<CUSTOMER>\<PID>` nebo `<projectBase>\INTERNI\<PID>`
  - `getAssetsRoot(): string` — `<assetsBase>\<CUSTOMER>\<PID>` (ZAK) nebo `<assetsBase>\<PID>` (INT); prázdný řetězec když `assetsBase` není vyplněn
  - `getRepoName(): string` — `<CUSTOMER>_<PID>` (ZAK) nebo `<PID>` (INT)
  - nová metadata: `projectBase`, `assetsBase`, `githubOrg`, `repoName`, `repoPrivate`, `branchOwner`

- [ ] **Step 1: Napiš selhávající testy**

Přidej do `tests/wizard.test.mjs`:

```javascript
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
```

Zároveň **smaž** starý test `'ZAK ma v ceste uroven zakaznika, INT nema'` z Tasku 1 — je nahrazen dvěma přesnějšími výše.

- [ ] **Step 2: Ověř, že testy selžou**

Run: `npm test`
Expected: FAIL — `w.getProjectRoot is not a function`

- [ ] **Step 3: Rozšiř `defaultState.metadata`**

Nahraď v `defaultState.metadata` řádek `knowledgeBase: …` blokem:

```javascript
    projectBase: 'C:\\PROJECT',
    executionBase: 'C:\\DEV\\Claude',
    assetsBase: '',
    githubOrg: 'ARICOMAAEA',
    repoName: '',
    repoPrivate: true,
    branchOwner: '',
```

(řádek `executionBase` byl původně za `knowledgeBase` — nezdvojuj ho.)

- [ ] **Step 4: Nahraď `getKnowledgeRoot()` funkcí `getProjectRoot()`**

```javascript
function getProjectRoot() {
  const pid = getProjectId();
  const rawBase = state.metadata.projectBase || 'C:\\PROJECT';
  const base = sanitizeBase(rawBase, state.metadata.projectType, state.metadata.customer);
  if (state.metadata.projectType === 'ZAK' && state.metadata.customer) {
    return `${base}\\ZAKAZNICI\\${state.metadata.customer}\\${pid}`;
  }
  return `${base}\\INTERNI\\${pid}`;
}

/** Binarni mirror. Cesta se NIKDY nedopocitava z nazvu zakaznika — na OneDrive
 *  existuji dva ruzne zakaznicke rooty (viz spec par. 4.2). Uzivatel zada koren
 *  explicitne; tato funkce k nemu jen doplni zakaznika a PROJECT_ID. */
function getAssetsRoot() {
  const raw = (state.metadata.assetsBase || '').trim();
  if (!raw) return '';
  const base = raw.replace(/[\\/]+$/, '');
  const pid = getProjectId();
  if (state.metadata.projectType === 'ZAK' && state.metadata.customer) {
    return `${base}\\${state.metadata.customer}\\${pid}`;
  }
  return `${base}\\${pid}`;
}

function getRepoName() {
  if (state.metadata.repoName && state.metadata.repoName.trim()) return state.metadata.repoName.trim();
  const pid = getProjectId();
  if (state.metadata.projectType === 'ZAK' && state.metadata.customer) {
    return `${state.metadata.customer}_${pid}`;
  }
  return pid;
}
```

Pozn.: `sanitizeBase()` zůstává beze změny — pro `C:\PROJECT` nic nestripuje, protože ten řetězec nekončí na `Interni`/`Zakaznici`.

- [ ] **Step 5: Přepiš všechna volání**

Run: `grep -n "getKnowledgeRoot\|knowledgeBase" struktura-wizard.html`

Každý výskyt nahraď: `getKnowledgeRoot()` → `getProjectRoot()`, `state.metadata.knowledgeBase` → `state.metadata.projectBase`. Popisek pole v renderStep0 přejmenuj z `'Knowledge base'` na `'Project base'` a helptext na:
`'Korenova cesta BEZ segmentu ZAKAZNICI/INTERNI — ten se doplni automaticky.'`
Popisek `KNOWLEDGE:` v náhledu odvozených cest přejmenuj na `PROJECT:`.

- [ ] **Step 6: Ověř, že testy prochází**

Run: `npm test`
Expected: PASS, 9 testů. Následně:
Run: `grep -c "getKnowledgeRoot\|knowledgeBase" struktura-wizard.html`
Expected: `0`

- [ ] **Step 7: Commit**

```bash
git add struktura-wizard.html tests/wizard.test.mjs
git commit -m "feat: cesty na topologii V4 — projectRoot, assetsRoot, repoName"
```

---

### Task 4: Krok „Topologie & Git"

**Files:**
- Modify: `struktura-wizard.html:260-271` (`steps`)
- Modify: `struktura-wizard.html` (nová funkce `renderStepTopology`)
- Modify: `struktura-wizard.html:2565,2577,2908` (odvázání od indexu 9)
- Modify: `tests/wizard.test.mjs`

**Interfaces:**
- Consumes: `getProjectRoot()`, `getAssetsRoot()`, `getRepoName()` z Tasku 3
- Produces: `renderStepTopology(): string`; `steps` má 11 položek, výstupní krok je poslední

- [ ] **Step 1: Napiš selhávající testy**

```javascript
test('steps obsahuji krok topology pred vystupem', async () => {
  const w = await loadWizard();
  const ids = w.steps.map((s) => s.id);
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
```

- [ ] **Step 2: Ověř, že testy selžou**

Run: `npm test`
Expected: FAIL — `w.renderStepTopology is not a function`

- [ ] **Step 3: Přidej krok do `steps`**

Vlož před položku `output`:

```javascript
  { id: 'topology', label: 'Topologie & Git', icon: 'G' },
```

- [ ] **Step 4: Napiš `renderStepTopology()`**

Vlož před `function renderStep9()`:

```javascript
const ASSETS_ROOT_PRESETS = [
  { value: 'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\Zakaznici',
    label: '9999Claude\\Zakaznici (Alika, ARICOMA, HEINEKEN, LINET, Promet, QUICK, Schwan)' },
  { value: 'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\SAP Service - Projekty\\Zakaznici',
    label: '9999Claude\\SAP Service - Projekty\\Zakaznici (KOFOLA a dalsi SAP Service)' },
  { value: 'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\9999Claude\\Interni',
    label: '9999Claude\\Interni (interni projekty)' },
];

function renderStepTopology() {
  const m = state.metadata;
  let html = sectionHeader('Topologie & Git',
    'Tri fyzicka mista projektu a nastaveni GitHub repozitare. Cesta k binarnimu mirroru se NEDOPOCITAVA — musi byt zadana explicitne.');

  const presetButtons = ASSETS_ROOT_PRESETS.map((p) => `
    <button onclick="state.metadata.assetsBase='${escAttr(p.value)}';saveState();render();"
      class="w-full text-left px-3 py-2 text-xs border rounded-md mb-1.5 transition-colors ${m.assetsBase === p.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-zinc-200 hover:bg-zinc-50'}">
      ${escHtml(p.label)}
    </button>`).join('');

  html += card(
    `<label class="block text-sm font-medium text-zinc-700 mb-2">Koren binarniho mirroru (assets)<span class="text-red-500 ml-0.5">*</span></label>
     <p class="text-xs text-zinc-500 mb-2">Na OneDrive existuji dva ruzne zakaznicke rooty. Vyber ten spravny — dopocitat se neda.</p>
     ${presetButtons}` +
    inputField('…nebo vlastni cesta', m.assetsBase,
      "state.metadata.assetsBase=this.value;saveState();updatePreview();",
      { placeholder: 'C:\\Users\\licka\\ARICOMA\\<Teams kanal> - General', helpText: 'Bez zakaznika a bez PROJECT_ID — ty se doplni automaticky.' })
  );

  html += card(
    inputField('GitHub organizace', m.githubOrg, "state.metadata.githubOrg=this.value;saveState();updatePreview();", { placeholder: 'ARICOMAAEA' }) +
    inputField('Nazev repozitare', m.repoName, "state.metadata.repoName=this.value;saveState();updatePreview();", { placeholder: getRepoName(), helpText: 'Prazdne = odvodi se automaticky (viz nahled nize).' }) +
    `<label class="flex items-center gap-2 mb-4 cursor-pointer">
       <input type="checkbox" ${m.repoPrivate ? 'checked' : ''} onchange="state.metadata.repoPrivate=this.checked;saveState();updatePreview();" class="rounded text-primary-600 focus:ring-primary-500">
       <span class="text-sm text-zinc-700">Private repozitar</span>
     </label>` +
    inputField('Jmeno pro branch ruleset', m.branchOwner, "state.metadata.branchOwner=this.value;saveState();updatePreview();", { placeholder: 'vojta', helpText: 'Vetve pak musi mit tvar <jmeno>/<co-dela>, napr. vojta/br-115-analyza.', required: true })
  );

  const assets = getAssetsRoot();
  html += `<div class="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-xs font-mono">
    <div class="mb-2"><span class="text-zinc-500">PROJECT:</span> <span class="text-zinc-700">${escHtml(getProjectRoot())}</span></div>
    <div class="mb-2"><span class="text-zinc-500">EXECUTION:</span> <span class="text-zinc-700">${escHtml(getExecutionRoot())}</span></div>
    <div class="mb-2"><span class="text-zinc-500">ASSETS:</span> ${assets ? `<span class="text-zinc-700">${escHtml(assets)}</span>` : '<span class="text-red-600">NEZADANO — povinne</span>'}</div>
    <div><span class="text-zinc-500">GITHUB:</span> <span class="text-zinc-700">${escHtml(m.githubOrg || 'ARICOMAAEA')}/${escHtml(getRepoName())}</span> <span class="text-zinc-400">${m.repoPrivate ? '(private)' : '(public)'}</span></div>
  </div>`;

  return html;
}
```

- [ ] **Step 5: Odvaž `render()` od pevného indexu 9**

V `render()` nahraď pole `renderers` a podmínku:

```javascript
  const renderers = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4,
                     renderStep5, renderStep6, renderStep7, renderStep8,
                     renderStepTopology, renderStep9];
  const content = el('stepContent');
  content.innerHTML = renderers[step]();
```

a dále:

```javascript
  if (step === steps.length - 1) {
    setTimeout(() => setOutputTab(activeOutputTab), 0);
  }
```

V `parseTemplateMarkdown()` nahraď `state.currentStep = 9;` za `state.currentStep = steps.length - 1;`.

- [ ] **Step 6: Ověř, že testy prochází**

Run: `npm test`
Expected: PASS, 12 testů.
Run: `grep -n "step === 9\|currentStep = 9" struktura-wizard.html`
Expected: prázdný výstup.

- [ ] **Step 7: Commit**

```bash
git add struktura-wizard.html tests/wizard.test.mjs
git commit -m "feat: krok Topologie a Git + odvazani vystupniho kroku od indexu"
```

---

### Task 5: Strom — V4 nadstavba a `08_DEV`

**Files:**
- Modify: `struktura-wizard.html:872-875` (`08_DEV`)
- Modify: `struktura-wizard.html:964-980` (kořenové soubory)
- Modify: `tests/wizard.test.mjs`

**Interfaces:**
- Consumes: `buildTree()` z Tasku 1
- Produces: strom obsahuje `_dev`, `_assets`, `_local`, `.github`, `scripts`, `.gitignore`, `.gitattributes`, `CHANGELOG.md`; `08_DEV` obsahuje `repos.json` + `REPOS.md` místo `ExecutionLayer.lnk`

- [ ] **Step 1: Napiš selhávající testy**

```javascript
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
```

- [ ] **Step 2: Ověř, že testy selžou**

Run: `npm test`
Expected: FAIL — `ve stromu chybi _dev`

- [ ] **Step 3: Přepiš uzel `08_DEV`**

```javascript
  pc.children.push({ name: '08_DEV', type: 'dir', children: [
    { name: 'repos.json', type: 'file' },
    { name: 'REPOS.md', type: 'file' },
    { name: 'README.md', type: 'file' },
  ]});
```

- [ ] **Step 4: Přidej V4 nadstavbu**

Vlož do `buildTree()` těsně před `// Root files`:

```javascript
  // V4 — git a nadstavba projektove vrstvy
  tree.children.push({ name: '.github', type: 'dir', children: [
    { name: 'CODEOWNERS', type: 'file' },
    { name: 'CONTRIBUTING.md', type: 'file' },
    { name: 'PULL_REQUEST_TEMPLATE.md', type: 'file' },
  ]});
  tree.children.push({ name: 'scripts', type: 'dir', children: [
    { name: 'bootstrap.ps1', type: 'file' },
    { name: 'check-drift.ps1', type: 'file' },
    { name: 'Generate-ReposMd.ps1', type: 'file' },
    { name: 'Test-Topology.ps1', type: 'file' },
  ]});
  tree.children.push({ name: '_dev', type: 'dir', children: [] });
  tree.children.push({ name: '_assets', type: 'dir', children: [] });
  tree.children.push({ name: '_local', type: 'dir', children: [] });
```

a mezi kořenové soubory (za `README.md`):

```javascript
  tree.children.push({ name: '.gitignore', type: 'file' });
  tree.children.push({ name: '.gitattributes', type: 'file' });
  tree.children.push({ name: 'CHANGELOG.md', type: 'file' });
```

- [ ] **Step 5: Ověř, že testy prochází**

Run: `npm test`
Expected: PASS, 14 testů.

- [ ] **Step 6: Commit**

```bash
git add struktura-wizard.html tests/wizard.test.mjs
git commit -m "feat: strom generuje V4 nadstavbu a repos.json misto ExecutionLayer.lnk"
```

---

### Task 6: Prompt — cesty, metadata a `08_DEV`

Menší polovina přepisu promptu: hlavička, metadata, texty zmiňující `ExecutionLayer.lnk` a OneDrive. Fáze se přidávají až v Tasku 7 — tenhle task drží prompt konzistentní s Tasky 3–5.

**Files:**
- Modify: `struktura-wizard.html` — `generateClaudePrompt()`
- Modify: `tests/wizard.test.mjs`

**Interfaces:**
- Consumes: `getProjectRoot()`, `getAssetsRoot()`, `getRepoName()`
- Produces: prompt obsahuje `PROJECT_ROOT`, `ASSETS_ROOT`, `GITHUB_REPO`; neobsahuje `ExecutionLayer.lnk`

- [ ] **Step 1: Napiš selhávající testy**

```javascript
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
```

- [ ] **Step 2: Ověř, že testy selžou**

Run: `npm test`
Expected: FAIL — `chybi PROJECT_ROOT`

- [ ] **Step 3: Přepiš hlavičku promptu**

Na začátku `generateClaudePrompt()` nahraď `const kRoot = getKnowledgeRoot();` za:

```javascript
  const pRoot = getProjectRoot();
  const eRoot = getExecutionRoot();
  const aRoot = getAssetsRoot();
  const repoFull = `${m.githubOrg || 'ARICOMAAEA'}/${getRepoName()}`;
```

a blok `## Metadata` za:

```javascript
  // Bez explicitniho assetsRoot je prompt nepouzitelny (junction _assets by mirilo nikam)
  // a nesmi se tvarit jako hotovy. Viz spec par. 4.2 — cesta se nedopocitava.
  const guard = getAssetsRoot()
    ? ''
    : '!! NEDOKONCENY VSTUP — ve wizardu neni vyplnen koren binarniho mirroru (krok "Topologie & Git").\n' +
      '!! NESPOUSTEJ tento prompt. Vrat se do wizardu, vyber koren a zkopiruj prompt znovu.\n\n';

  let prompt = `${guard}Zaloz novy projekt "${m.fullName || pid}" v topologii V4 (Meta Framework).

## Metadata
- PROJECT_ID: ${pid}
- PROJECT_NAME: ${m.fullName || pid}
- DATE: ${today}
- PROJECT_TYPE: ${m.projectType}${m.projectType === 'ZAK' ? `\n- CUSTOMER: ${m.customer}` : ''}
- INITIAL_MODE: ${m.mode}
- PROJECT_ROOT:   ${pRoot}
- EXECUTION_ROOT: ${eRoot}
- ASSETS_ROOT:    ${aRoot}
- GITHUB_REPO:    ${repoFull}${m.repoPrivate ? ' (private)' : ' (public)'}
- BRANCH_OWNER:   ${m.branchOwner}

## Projektova vrstva: ${pRoot}

### Adresarova struktura
Vytvor nasledujici slozky:
`;
```

- [ ] **Step 4: Přepiš zbylá volání a texty**

Run: `grep -n "kRoot\|ExecutionLayer.lnk\|Knowledge Layer" struktura-wizard.html`

Každý výskyt `${kRoot}` nahraď `${pRoot}`. Dále:
- řádek tabulky `| \`00_PROJECT_CONTROL/08_DEV/\` | Bridge | \`ExecutionLayer.lnk\` |` → `| \`00_PROJECT_CONTROL/08_DEV/\` | Manifest dev repozitaru | \`repos.json\` + generovany \`REPOS.md\` |`
- řádek strukturální mapy `08_DEV/  Most na execution layer (ExecutionLayer.lnk)` → `08_DEV/  Manifest dev repozitaru (repos.json + REPOS.md)`
- sekci `### 08_DEV shortcut` **smaž celou** — nahradí ji junction `_dev` z fáze 7 (Task 7)
- text `08_DEV = most do execution layer (zadny spustitelny kod)` → `08_DEV = manifest dev repozitaru (repos.json je jedina pravda, REPOS.md je generovany)`
- nadpis `## Knowledge Layer:` → `## Projektova vrstva:`

- [ ] **Step 5: Ověř, že testy prochází**

Run: `npm test`
Expected: PASS, 17 testů.

- [ ] **Step 6: Commit**

```bash
git add struktura-wizard.html tests/wizard.test.mjs
git commit -m "feat: prompt zna tri koreny V4 a repos.json misto ExecutionLayer.lnk"
```

---

### Task 7: Prompt — 8 fází se závaznou posloupností

**Files:**
- Modify: `struktura-wizard.html` — konec `generateClaudePrompt()`
- Modify: `tests/wizard.test.mjs`

**Interfaces:**
- Consumes: `pRoot`, `eRoot`, `aRoot`, `repoFull` z Tasku 6
- Produces: prompt obsahuje osm očíslovaných fází a dvě potvrzovací brány

- [ ] **Step 1: Napiš selhávající testy**

```javascript
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
  // POZOR: indexOf vraci -1 pri nenalezeni, takze `-1 < kladne` by proslo i tehdy,
  // kdyby `gh repo create` z promptu uplne zmizel. Oba vyskyty proto pinujeme zvlast.
  const create = p.indexOf('gh repo create');
  const protect = p.toLowerCase().indexOf('branch protection');
  assert.ok(create > -1, 'prompt musi obsahovat gh repo create');
  assert.ok(protect > -1, 'prompt musi obsahovat branch protection');
  assert.ok(create < protect,
    'protection se nesmi zapinat pred prvnim pushem — na prazdny main by push neprosel');
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
```

- [ ] **Step 2: Ověř, že testy selžou**

Run: `npm test`
Expected: FAIL — `chybi FAZE 0`

- [ ] **Step 3: Přidej odvození cesty k `assets/`**

Nad `generateClaudePrompt()` vlož:

```javascript
const TOOL_ROOT_FALLBACK = 'C:\\Users\\licka\\OneDrive - ARICOMA\\Prace\\projekty\\00_TOOLS\\StrukturaProjektuV4';

/** Odvodi absolutni cestu ke slozce nastroje z location (bezi pres file://).
 *  Kdyz to nejde, vrati fallback — a volajici to viditelne oznami. */
function getToolRoot() {
  try {
    const p = decodeURIComponent(location.pathname).replace(/^\//, '').replace(/\//g, '\\');
    const dir = p.slice(0, p.lastIndexOf('\\'));
    if (dir && /:\\/.test(dir)) return dir;
  } catch (e) { /* file:// neni k dispozici (testy, http) */ }
  return TOOL_ROOT_FALLBACK;
}
```

Harness `location` nedefinuje, takže v testech se použije fallback — to je záměr a test na `assets\scripts` na tom nezávisí.

- [ ] **Step 4: Nahraď koncovou sekci promptu osmi fázemi**

Nahraď blok od `## Execution Layer: ${eRoot}` po `return prompt;` tímto:

```javascript
  const toolRoot = getToolRoot();
  const visibility = m.repoPrivate ? '--private' : '--public';

  prompt += `
---

# Postup — 8 fazi

Provadej je v tomto poradi. Fáze oznacene [POTVRZENI] jsou navenek pusobici a nevratne —
pred kazdou z nich se ZEPTEJ uzivatele a vypis presny prikaz, ktery se chysta se spustit.

## FAZE 0 — Preflight (nic se nemeni)
1. \`gh auth status\` — musi byt prihlaseny. Kdyz ne, ZASTAV.
2. \`git --version\` — musi existovat. Kdyz ne, ZASTAV.
3. Overit, ze NEEXISTUJE zadna z techto cest:
   - ${pRoot}
   - ${eRoot}
   - ${aRoot}
   Kdyz kterakoliv existuje, ZASTAV a nahlas ji. Tento nastroj zaklada jen nove projekty.

## FAZE 1 — Tri koreny
Vytvor prazdne slozky:
- ${pRoot}
- ${eRoot}\\apps
- ${eRoot}\\.claude\\skills
- ${aRoot}

## FAZE 2 — Obsah projektove vrstvy
Vytvor strukturu a soubory popsane vyse v ${pRoot}.
V \`00_PROJECT_CONTROL\\08_DEV\\\` vytvor \`repos.json\` s prazdnym seznamem repozitaru:

\`\`\`json
{
  "project": "${getRepoName()}",
  "devRoot": "${eRoot.replace(/\\/g, '\\\\')}",
  "assetsRoot": "${aRoot.replace(/\\/g, '\\\\')}",
  "repos": []
}
\`\`\`

DULEZITE: \`repos.json\` cte PowerShell 5.1 — uloz ho jako **UTF-8 s BOM**. Bez BOM ho PS 5.1
precte pres ANSI codepage a rozbije diakritiku. Totez plati pro vsechny generovane \`.md\`.

## FAZE 3 — V4 nadstavba
Zkopiruj sablony ze slozky nastroje **${toolRoot}\\assets\\** do ${pRoot}:

| Zdroj | Cil |
|---|---|
| \`assets\\scripts\\bootstrap.ps1\` | \`scripts\\bootstrap.ps1\` |
| \`assets\\scripts\\check-drift.ps1\` | \`scripts\\check-drift.ps1\` |
| \`assets\\scripts\\Generate-ReposMd.ps1\` | \`scripts\\Generate-ReposMd.ps1\` |
| \`assets\\scripts\\Test-Topology.ps1\` | \`scripts\\Test-Topology.ps1\` |
| \`assets\\github\\CODEOWNERS\` | \`.github\\CODEOWNERS\` |
| \`assets\\github\\CONTRIBUTING.md\` | \`.github\\CONTRIBUTING.md\` |
| \`assets\\github\\PULL_REQUEST_TEMPLATE.md\` | \`.github\\PULL_REQUEST_TEMPLATE.md\` |
| \`assets\\git\\gitignore\` | \`.gitignore\` (POZOR: pridat tecku) |
| \`assets\\git\\gitattributes\` | \`.gitattributes\` (POZOR: pridat tecku) |

Skripty kopiruj **beze zmeny** — jsou plne manifest-driven. V \`.github\\CODEOWNERS\`
a \`.github\\CONTRIBUTING.md\` nahrad zastupny symbol \`{{BRANCH_OWNER}}\` hodnotou \`${m.branchOwner}\`.
Dale vytvor \`_local\\.gitkeep\` (prazdny) a \`CHANGELOG.md\` se zaznamem verze \`1.0.0\` dle Keep a Changelog.

Teprve ted, kdyz \`Generate-ReposMd.ps1\` uz existuje na disku, vygeneruj \`REPOS.md\`:
\`\`\`powershell
powershell -File "${pRoot}\\scripts\\Generate-ReposMd.ps1"
\`\`\`
(prazdny manifest = prazdna tabulka, to je spravne — aplikace se pridavaji az pozdeji)

## FAZE 4 — Git a prvni commit
\`\`\`bash
cd "${pRoot}"
git init -b main
git add -A
git commit -m "chore: zalozeni projektu v topologii V4"
\`\`\`
Pred commitem overit, ze \`git status --short\` neukazuje zadnou binarku ani \`_dev\`/\`_assets\`.

## FAZE 5 — [POTVRZENI] Zalozeni GitHub repozitare a push
ZEPTEJ SE UZIVATELE, nez cokoliv spustis. Vypis mu presne tyto prikazy:
\`\`\`bash
gh repo create ${repoFull} ${visibility} --source="${pRoot}" --remote=origin --push
\`\`\`
Toto zaklada repozitar v organizaci — preklep v nazvu vytvori nechtenou repo, kterou pak nekdo musi uklidit.

## FAZE 6 — [POTVRZENI] Branch protection a ruleset
Teprve ted, kdyz \`main\` uz existuje a neni prazdny. ZEPTEJ SE UZIVATELE.
\`\`\`bash
gh api -X PUT repos/${repoFull}/branches/main/protection \\
  -F required_pull_request_reviews[required_approving_review_count]=0 \\
  -F enforce_admins=true \\
  -F required_status_checks=null \\
  -F restrictions=null
gh api -X PATCH repos/${repoFull} -F delete_branch_on_merge=true
\`\`\`
Pote v repu vytvor ruleset \`personal-branch-naming\`, ktery odmitne push vetve mimo vzor
\`${m.branchOwner}/<co-dela>\` (napr. \`${m.branchOwner}/br-001-analyza\`).

## FAZE 7 — Junctiony
\`\`\`powershell
powershell -File "${pRoot}\\scripts\\bootstrap.ps1"
\`\`\`
Vytvori \`_dev\` -> EXECUTION_ROOT, \`_assets\` -> ASSETS_ROOT a reverzni \`CONTEXT\` v execution vrstve.
Skript nikdy nic nemaze ani neprepisuje — pri nesouladu jen varuje.

## FAZE 8 — Akceptacni brana
\`\`\`powershell
powershell -File "${pRoot}\\scripts\\Test-Topology.ps1"
\`\`\`
Musi vypsat \`GATE PROSEL\`. Kdyz ne, NEHLAS uspech — vypis, ktera kontrola selhala, a zastav.
`;

  return prompt;
}
```

- [ ] **Step 5: Ověř, že testy prochází**

Run: `npm test`
Expected: PASS, 21 testů.

- [ ] **Step 6: Commit**

```bash
git add struktura-wizard.html tests/wizard.test.mjs
git commit -m "feat: prompt provadi 8 fazi vcetne potvrzovacich bran pro GitHub"
```

---

### Task 8: Ruční kontrola wizardu v prohlížeči

Testy pokrývají čisté funkce, ne UI. Tenhle task ověří, že se wizard skutečně otevře a proklikáte ho.

**Files:** žádné změny (jen ověření; případné opravy patří do commitu tohoto tasku)

- [ ] **Step 1: Otevři wizard**

Run: `start "" "struktura-wizard.html"`

- [ ] **Step 2: Projdi kroky**

Klikni postupně všemi 11 kroky. Ověř:
- žádná chyba v konzoli prohlížeče (F12)
- krok „Topologie & Git" zobrazuje tři přednastavené OneDrive rooty a klik na ně vyplní pole
- náhled cest ukazuje `ASSETS: NEZADANO — povinne` červeně, dokud není root vybrán
- přepnutí `INT` / `ZAK` mění tvar cesty (u `INT` mizí úroveň zákazníka i pole Zakaznik)

- [ ] **Step 3: Zkontroluj výstup**

Na posledním kroku přepni na záložku „Claude Code Prompt". Ověř, že prompt obsahuje osm fází a že cesty odpovídají náhledu. Zkontroluj, že se **nezobrazuje** žádná záložka pro PowerShell skript.

- [ ] **Step 4: Commit (jen pokud jsi něco opravoval)**

```bash
git add struktura-wizard.html
git commit -m "fix: opravy nalezene pri rucni kontrole wizardu"
```

---

### Task 9: Assets — skripty a šablony

**Files:**
- Create: `assets/scripts/{bootstrap,check-drift,Generate-ReposMd}.ps1` (kopie z KOFOLA)
- Create: `assets/github/{CODEOWNERS,CONTRIBUTING.md,PULL_REQUEST_TEMPLATE.md}`
- Create: `assets/git/{gitignore,gitattributes}`
- Create: `tests/assets.test.mjs`

**Interfaces:**
- Produces: soubory, na které odkazuje FÁZE 3 promptu (Task 7). `Test-Topology.ps1` přidá Task 10.

- [ ] **Step 1: Napiš selhávající test**

Vytvoř `tests/assets.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Ověř, že testy selžou**

Run: `npm test`
Expected: FAIL — `ENOENT … assets/scripts/bootstrap.ps1`

- [ ] **Step 3: Zkopíruj tři skripty**

```bash
mkdir -p assets/scripts assets/github assets/git
KOFOLA="/c/PROJECT/ZAKAZNICI/KOFOLA/20260308_CasovaOkna"
cp "$KOFOLA/scripts/bootstrap.ps1"         assets/scripts/
cp "$KOFOLA/scripts/check-drift.ps1"       assets/scripts/
cp "$KOFOLA/scripts/Generate-ReposMd.ps1"  assets/scripts/
```

Pak je projdi a **odstraň KOFOLA-specifické zmínky v komentářích**, pokud tam nějaké jsou (test na `KOFOLA` to odhalí). Logiku neměň.

- [ ] **Step 4: Zkopíruj `.github` šablony a nahraď jméno zástupným symbolem**

```bash
cp "$KOFOLA/.github/CODEOWNERS"               assets/github/
cp "$KOFOLA/.github/CONTRIBUTING.md"          assets/github/
cp "$KOFOLA/.github/PULL_REQUEST_TEMPLATE.md" assets/github/
```

V `CODEOWNERS` a `CONTRIBUTING.md` nahraď konkrétní jméno vlastníka za `{{BRANCH_OWNER}}` — FÁZE 3 promptu ho dosadí. Ověř, že `CONTRIBUTING.md` obsahuje postup pro odstranění worktree s junctiony; pokud ne, doplň:

```markdown
### Odstraneni worktree

`git worktree remove` na Windows padne "Permission denied", pokud worktree obsahuje
junctiony `_dev` / `_assets`. Nejdriv je zrus — jen link, nikdy ne cil:

```powershell
[System.IO.Directory]::Delete("$wt\_dev", $false)
[System.IO.Directory]::Delete("$wt\_assets", $false)
Remove-Item -Recurse -Force $wt
git worktree prune
```

NIKDY nepouzivej `Remove-Item -Recurse` primo na junction — na nekterych kombinacich
PowerShellu a filesystemu projde skrz a smaze cilova data.
```

- [ ] **Step 5: Vytvoř `assets/git/gitignore`**

```
# Junctiony — vytvari bootstrap.ps1, nikdy neverzovat
_dev/
_assets/

# Git worktree pracovni adresare (viz .github/CONTRIBUTING.md).
# Musi tu byt od prvniho commitu — jinak `git add .` z hlavniho checkoutu
# commitne rozbity gitlink.
.claude/worktrees/

# Lokalni pracovni slozka — prompty, poznamky, docasne soubory
_local/*
!_local/.gitkeep

# Stroj-specificka konfigurace Claude Code (absolutni cesty, permissions)
.claude/settings.local.json

# OS / editor
desktop.ini
Thumbs.db
.DS_Store
*.tmp
*~
.obsidian/

# Binarky nikdy do gitu — zijou v _assets/ na OneDrive
*.mp4
*.xlsx
*.vsdx
*.pdf
*.png
*.jpg
*.jpeg
*.pptx
```

- [ ] **Step 6: Vytvoř `assets/git/gitattributes`**

```
* text=auto eol=lf
*.ps1 text eol=crlf
```

- [ ] **Step 7: Ověř, že testy prochází**

Run: `npm test`
Expected: PASS, 25 testů.

- [ ] **Step 8: Commit**

```bash
git add assets/ tests/assets.test.mjs
git commit -m "feat: assets se skripty a github sablonami pro generovane projekty"
```

---

### Task 10: `Test-Topology.ps1`

Jediný skutečně nový kód. Projekt-agnostický health-check, který je zároveň akceptačním kritériem celého nástroje.

**Files:**
- Create: `assets/scripts/Test-Topology.ps1`
- Create: `tests/Test-Topology.Tests.ps1`

**Interfaces:**
- Consumes: `repos.json` (pole `project`, `devRoot`, `assetsRoot`, `repos`)
- Produces: exit 0 při průchodu, 1 při selhání; parametry `-ManifestPath`, `-ExpectedRemote`, `-NoGitHub`

- [ ] **Step 1: Napiš selhávající Pester test**

Vytvoř `tests/Test-Topology.Tests.ps1` (Pester 3.4 syntax — bez `BeforeAll`, setup se dělá v `Describe` těle):

```powershell
$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $here '..\assets\scripts\Test-Topology.ps1'

Describe 'Test-Topology.ps1' {

    # --- fixture: minimalni, ale platny V4 projekt v TEMP ---
    $root   = Join-Path $env:TEMP ("v4gate_" + [guid]::NewGuid().ToString('N').Substring(0,8))
    $devDir = Join-Path $root 'devsrc'
    $assDir = Join-Path $root 'assetsrc'
    $proj   = Join-Path $root 'project'

    New-Item -ItemType Directory -Force -Path $devDir, $assDir, (Join-Path $proj 'scripts'),
        (Join-Path $proj '00_PROJECT_CONTROL\08_DEV') | Out-Null

    Copy-Item $script (Join-Path $proj 'scripts\Test-Topology.ps1')
    Copy-Item (Join-Path $here '..\assets\scripts\check-drift.ps1') (Join-Path $proj 'scripts\check-drift.ps1')
    Copy-Item (Join-Path $here '..\assets\git\gitignore') (Join-Path $proj '.gitignore')

    $manifest = @{
        project    = 'TEST_projekt'
        devRoot    = $devDir
        assetsRoot = $assDir
        repos      = @()
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText(
        (Join-Path $proj '00_PROJECT_CONTROL\08_DEV\repos.json'), $manifest,
        (New-Object System.Text.UTF8Encoding $true))   # $true = s BOM

    Push-Location $proj
    & git init -b main --quiet 2>$null
    & git -c user.email=t@t -c user.name=t commit --allow-empty -m init --quiet 2>$null
    Pop-Location

    New-Item -ItemType Junction -Path (Join-Path $proj '_dev')    -Target $devDir | Out-Null
    New-Item -ItemType Junction -Path (Join-Path $proj '_assets') -Target $assDir | Out-Null
    New-Item -ItemType Junction -Path (Join-Path $devDir 'CONTEXT') -Target $proj | Out-Null

    $gate = Join-Path $proj 'scripts\Test-Topology.ps1'

    It 'projde na kompletnim projektu bez remote (-NoGitHub)' {
        & powershell -NoProfile -File $gate -NoGitHub | Out-Null
        $LASTEXITCODE | Should Be 0
    }

    It 'selze, kdyz chybi junction _assets' {
        [System.IO.Directory]::Delete((Join-Path $proj '_assets'), $false)
        & powershell -NoProfile -File $gate -NoGitHub | Out-Null
        $LASTEXITCODE | Should Be 1
        New-Item -ItemType Junction -Path (Join-Path $proj '_assets') -Target $assDir | Out-Null
    }

    It 'selze, kdyz .gitignore nepokryva povinny vzor' {
        $gi = Join-Path $proj '.gitignore'
        $orig = Get-Content -LiteralPath $gi -Raw
        Set-Content -LiteralPath $gi -Value ($orig -replace [regex]::Escape('.claude/worktrees/'), '') -Encoding UTF8
        & powershell -NoProfile -File $gate -NoGitHub | Out-Null
        $LASTEXITCODE | Should Be 1
        Set-Content -LiteralPath $gi -Value $orig -Encoding UTF8
    }

    It 'selze, kdyz je v gitu trackovana binarka' {
        Push-Location $proj
        Set-Content -LiteralPath (Join-Path $proj 'x.png') -Value 'x'
        & git add -f x.png 2>$null
        & git -c user.email=t@t -c user.name=t commit -m bin --quiet 2>$null
        Pop-Location
        & powershell -NoProfile -File $gate -NoGitHub | Out-Null
        $LASTEXITCODE | Should Be 1
    }

    # --- uklid: junctiony jen jako link, nikdy ne cil ---
    foreach ($j in @((Join-Path $proj '_dev'), (Join-Path $proj '_assets'), (Join-Path $devDir 'CONTEXT'))) {
        if (Test-Path -LiteralPath $j) { [System.IO.Directory]::Delete($j, $false) }
    }
    Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
}
```

- [ ] **Step 2: Ověř, že testy selžou**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\Test-Topology.Tests.ps1"`
Expected: FAIL — skript `assets\scripts\Test-Topology.ps1` neexistuje

- [ ] **Step 3: Napiš `assets/scripts/Test-Topology.ps1`**

```powershell
<#
.SYNOPSIS
    Health-check projektu v topologii V4.
.DESCRIPTION
    Read-only. Projekt-agnosticky — vsechny hodnoty cte z repos.json.
    Exit 0 jen kdyz projdou vsechny kontroly.
.PARAMETER ManifestPath
    Cesta k repos.json. Default: ..\00_PROJECT_CONTROL\08_DEV\repos.json relativne ke skriptu.
.PARAMETER ExpectedRemote
    Ocekavany origin ve tvaru <org>/<repo>. Kdyz neni zadan, vezme se z .topology-remote,
    pokud existuje; jinak se kontrola 8 preskoci se zaznamem SKIP.
.PARAMETER NoGitHub
    Preskoci kontrolu 8 (projekt zatim nema remote).
.EXAMPLE
    powershell -File scripts\Test-Topology.ps1
.EXAMPLE
    powershell -File scripts\Test-Topology.ps1 -NoGitHub
#>
[CmdletBinding()]
param(
    [string]$ManifestPath,
    [string]$ExpectedRemote,
    [switch]$NoGitHub
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# NIKDY cwd — skript musi fungovat i pri spusteni z git worktree,
# ktery ma vlastni fyzickou kopii tohoto souboru.
$repoRoot = Split-Path -Parent $PSScriptRoot

$results = @()
function Add-Result {
    param([string]$Name, [string]$Verdict, [string]$Detail)
    $script:results += [pscustomobject]@{ Kontrola = $Name; Vysledek = $Verdict; Detail = $Detail }
}
function Add-Check {
    param([string]$Name, [bool]$Passed, [string]$Detail)
    Add-Result $Name $(if ($Passed) { 'PASS' } else { 'FAIL' }) $Detail
}

<# Vrati cil junctionu, nebo $null kdyz na ceste neni reparse point. #>
function Get-LinkTarget {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $item = Get-Item -LiteralPath $Path -Force
    if (-not ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { return $null }
    $t = $item.Target
    if ($t -is [array]) { $t = $t[0] }
    return "$t".TrimEnd('\')
}

# --- 1) Manifest ---
if (-not $ManifestPath) { $ManifestPath = Join-Path $repoRoot '00_PROJECT_CONTROL\08_DEV\repos.json' }
$manifest = $null
if (-not (Test-Path -LiteralPath $ManifestPath)) {
    Add-Check 'Manifest repos.json' $false "neexistuje: $ManifestPath"
} else {
    try {
        $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
        $missing = @('project', 'devRoot', 'assetsRoot', 'repos') |
            Where-Object { -not $manifest.PSObject.Properties[$_] }
        Add-Check 'Manifest repos.json' ($missing.Count -eq 0) $(
            if ($missing) { "chybi pole: $($missing -join ', ')" } else { "projekt=$($manifest.project), repos=$(@($manifest.repos).Count)" })
    } catch {
        Add-Check 'Manifest repos.json' $false "nelze parsovat: $_"
    }
}

if ($null -eq $manifest -or -not $manifest.PSObject.Properties['devRoot']) {
    Write-Host ''
    Write-Host 'HEALTH-CHECK topologie V4' -ForegroundColor Cyan
    $results | Format-Table -AutoSize
    Write-Host 'GATE NEPROSEL — bez platneho manifestu nelze pokracovat.' -ForegroundColor Red
    exit 1
}

# --- 2) Koreny existuji ---
$devOk = Test-Path -LiteralPath $manifest.devRoot
$assOk = Test-Path -LiteralPath $manifest.assetsRoot
Add-Check 'devRoot a assetsRoot existuji' ($devOk -and $assOk) "devRoot=$devOk, assetsRoot=$assOk"

# --- 3) _dev junction ---
$devLink = Get-LinkTarget (Join-Path $repoRoot '_dev')
Add-Check 'Junction _dev' ($devLink -eq $manifest.devRoot.TrimEnd('\')) $(
    if ($devLink) { "-> $devLink" } else { 'neexistuje nebo neni junction' })

# --- 4) _assets junction ---
$assLink = Get-LinkTarget (Join-Path $repoRoot '_assets')
Add-Check 'Junction _assets' ($assLink -eq $manifest.assetsRoot.TrimEnd('\')) $(
    if ($assLink) { "-> $assLink" } else { 'neexistuje nebo neni junction' })

# --- 5) CONTEXT junction v execution vrstve ---
$ctxLink = Get-LinkTarget (Join-Path $manifest.devRoot 'CONTEXT')
Add-Check 'Junction CONTEXT' ($ctxLink -eq $repoRoot.TrimEnd('\')) $(
    if ($ctxLink) { "-> $ctxLink" } else { 'neexistuje nebo neni junction' })

# --- 6) Zadna trackovana binarka ---
Push-Location $repoRoot
try {
    $tracked = @(& git ls-files 2>$null)
    $bin = @($tracked | Where-Object { $_ -match '\.(mp4|xlsx|vsdx|pdf|png|jpg|jpeg|pptx|lnk)$' })
} finally { Pop-Location }
Add-Check 'Zadna binarka v gitu' ($bin.Count -eq 0) $(
    if ($bin.Count) { "$($bin.Count) nalezu, napr. $($bin[0])" } else { "0 z $($tracked.Count) souboru" })

# --- 7) .gitignore pokryva povinne vzory ---
$required = @('_dev/', '_assets/', '_local/*', '.claude/worktrees/', '.claude/settings.local.json')
$giPath = Join-Path $repoRoot '.gitignore'
if (-not (Test-Path -LiteralPath $giPath)) {
    Add-Check '.gitignore pokryva povinne vzory' $false '.gitignore neexistuje'
} else {
    $gi = Get-Content -LiteralPath $giPath -Raw
    $absent = @($required | Where-Object { $gi -notlike "*$_*" })
    Add-Check '.gitignore pokryva povinne vzory' ($absent.Count -eq 0) $(
        if ($absent) { "chybi: $($absent -join ', ')" } else { "vsech $($required.Count) vzoru" })
}

# --- 8) Git repo, commit, remote ---
Push-Location $repoRoot
try {
    $isRepo    = (& git rev-parse --is-inside-work-tree 2>$null) -eq 'true'
    $commits   = if ($isRepo) { @(& git rev-list --count HEAD 2>$null)[0] } else { '0' }
    $originUrl = if ($isRepo) { (& git remote get-url origin 2>$null) } else { $null }
} finally { Pop-Location }

if (-not $ExpectedRemote) {
    $remoteFile = Join-Path $repoRoot '.topology-remote'
    if (Test-Path -LiteralPath $remoteFile) { $ExpectedRemote = (Get-Content -LiteralPath $remoteFile -Raw).Trim() }
}

if ($NoGitHub) {
    Add-Result 'Git repo a remote' 'SKIP' 'preskoceno (-NoGitHub)'
} elseif (-not $ExpectedRemote) {
    Add-Result 'Git repo a remote' 'SKIP' 'ocekavany remote nezadan (-ExpectedRemote ani .topology-remote)'
} else {
    $normalized = if ($originUrl) {
        ($originUrl.Trim() -replace '^git@github\.com:', '' -replace '^https://github\.com/', '' -replace '\.git$', '').TrimEnd('/')
    } else { '' }
    $ok = $isRepo -and ([int]$commits -ge 1) -and ($normalized -eq $ExpectedRemote)
    Add-Check 'Git repo a remote' $ok "repo=$isRepo, commitu=$commits, origin='$normalized', ocekavano='$ExpectedRemote'"
}

# --- 9) check-drift ---
$driftScript = Join-Path $PSScriptRoot 'check-drift.ps1'
if (-not (Test-Path -LiteralPath $driftScript)) {
    Add-Check 'check-drift' $false 'scripts\check-drift.ps1 neexistuje'
} else {
    & powershell -NoProfile -File $driftScript | Out-Null
    Add-Check 'check-drift' ($LASTEXITCODE -eq 0) "exit=$LASTEXITCODE"
}

# --- vystup ---
Write-Host ''
Write-Host 'HEALTH-CHECK topologie V4' -ForegroundColor Cyan
$results | Format-Table -AutoSize
$failed = @($results | Where-Object { $_.Vysledek -eq 'FAIL' })
if ($failed.Count -gt 0) {
    Write-Host "GATE NEPROSEL — $($failed.Count) z $($results.Count) kontrol selhalo." -ForegroundColor Red
    exit 1
}
$skipped = @($results | Where-Object { $_.Vysledek -eq 'SKIP' }).Count
Write-Host "GATE PROSEL — $($results.Count - $skipped) kontrol OK$(if ($skipped) { ", $skipped preskoceno" })." -ForegroundColor Green
exit 0
```

- [ ] **Step 4: Ověř, že Pester testy prochází**

Run: `powershell -NoProfile -Command "Invoke-Pester -Path tests\Test-Topology.Tests.ps1"`
Expected: 4 passed, 0 failed

- [ ] **Step 5: Ověř, že prochází i Node testy**

Run: `npm test`
Expected: PASS. Test `'vsechny povinne assety existuji'` teď musí zahrnovat i `Test-Topology.ps1` — přidej ho do pole `REQUIRED` v `tests/assets.test.mjs`.

- [ ] **Step 6: Commit**

```bash
git add assets/scripts/Test-Topology.ps1 tests/Test-Topology.Tests.ps1 tests/assets.test.mjs
git commit -m "feat: Test-Topology.ps1 — projekt-agnosticky health-check V4"
```

---

### Task 11: Přejmenování a dokumentace nástroje

**Files:**
- Rename: `StrukturaProjektuV3` → `StrukturaProjektuV4`
- Modify: `README.md`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Přepiš README**

Nahraď obsah `README.md`. Musí popisovat: co nástroj generuje (V4 topologie, tři místa), jak se používá (otevřít wizard → vyplnit → zkopírovat prompt → vložit do Claude Code), co je v `assets/`, jak spustit testy (`npm test`, `Invoke-Pester`). **Nepiš ho jako changelog** — je to uživatelská dokumentace. Odstraň zmínku o PowerShell init skriptu jako výstupu (byl mrtvý kód, viz Task 2) a sekci „Recent updates" (patří do CHANGELOG).

- [ ] **Step 2: Vytvoř CHANGELOG**

```markdown
# Changelog

Vsechny vyznamne zmeny tohoto nastroje. Format: [Keep a Changelog](https://keepachangelog.com/), verzovani: [SemVer](https://semver.org/).

## [2.0.0] - 2026-08-07

### Added
- Krok „Topologie & Git" — explicitni koren binarniho mirroru, GitHub org/repo/private, jmeno pro branch ruleset.
- `assets/` se ctyrmi PowerShell skripty a `.github` sablonami dodavanymi do generovaneho projektu.
- `Test-Topology.ps1` — projekt-agnosticky health-check (9 kontrol) dodavany do kazdeho projektu.
- Testy: Node harness pro cisté funkce wizardu, Pester testy pro `Test-Topology.ps1`.

### Changed
- **Breaking:** wizard generuje topologii V4 misto V3. Projektova vrstva je git repo v `C:\PROJECT`, ne slozka na OneDrive.
- `08_DEV/` obsahuje `repos.json` + generovany `REPOS.md` misto `ExecutionLayer.lnk`.
- Claude Code prompt provadi 8 fazi vcetne `gh repo create` a branch protection — obe s potvrzenim uzivatele.

### Removed
- **Breaking:** `generatePowerShell()` (616 radku). Slo o mrtvy kod bez volajiciho; README ho chybne inzeroval jako treti vystup.
- Moznost zalozit projekt ve V3 topologii.
```

- [ ] **Step 3: Commit před přejmenováním**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: README a CHANGELOG pro V4"
```

- [ ] **Step 4: Přejmenuj složku**

Zavři všechny editory a prohlížeče, které mají soubory otevřené, pak:

```powershell
Rename-Item "C:\Users\licka\OneDrive - ARICOMA\Prace\projekty\00_TOOLS\StrukturaProjektuV3" "StrukturaProjektuV4"
```

- [ ] **Step 5: Ověř, že repo funguje z nové cesty**

```bash
cd "/c/Users/licka/OneDrive - ARICOMA/Prace/projekty/00_TOOLS/StrukturaProjektuV4"
git status
npm test
```
Expected: `git status` čistý, testy PASS.

- [ ] **Step 6: [POTVRZENÍ] Přejmenuj GitHub repo**

**Zeptej se uživatele, než tohle spustíš** — je to navenek působící krok.

```bash
gh repo rename StrukturaProjektuV4 --repo ARICOMAAEA/StrukturaProjektuV3 --yes
git remote set-url origin https://github.com/ARICOMAAEA/StrukturaProjektuV4.git
git remote -v
```

GitHub drží redirect ze starého názvu, takže existující klony se nerozbijí.

---

### Task 12: Deprecation `meta-framework-init` a oprava globální CLAUDE.md

**Files:**
- Modify: `C:\Users\licka\.claude\skills\meta-framework-init\SKILL.md`
- Modify: `C:\Users\licka\.claude\CLAUDE.md`

Oba soubory jsou **mimo** repo nástroje — necommitují se sem.

- [ ] **Step 1: Nahraď SKILL.md stubem**

Zachovej frontmatter (jméno, `disable-model-invocation: true`), tělo nahraď:

```markdown
# meta-framework-init — DEPRECATED (2026-08-07)

Tento skill zakladal projekty v topologii **V3** (knowledge layer na OneDrive,
`08_DEV/ExecutionLayer.lnk`, bez gitu). Ta uz se nepouziva.

**Pouzij misto nej wizard:**

```
C:\Users\licka\OneDrive - ARICOMA\Prace\projekty\00_TOOLS\StrukturaProjektuV4\struktura-wizard.html
```

Otevri ho v prohlizeci, vypln kroky, zkopiruj vygenerovany Claude Code prompt a vloz ho sem.

Duvod deprecace: dve cesty ke stejne strukture se garantovane rozejdou.
Viz `StrukturaProjektuV4\docs\superpowers\specs\2026-08-07-v4-project-wizard-design.md`, rozhodnuti W5.

**Nezakladej projekt podle stareho postupu nize — byl odstranen.**
```

Zároveň v `description:` frontmatteru předřaď `DEPRECATED — ` před stávající text, aby to bylo vidět v seznamu skillů.

- [ ] **Step 2: Ověř, že se skill načte**

Run: `powershell -NoProfile -Command "Get-Content 'C:\Users\licka\.claude\skills\meta-framework-init\SKILL.md' -TotalCount 12"`
Expected: platný YAML frontmatter s `DEPRECATED` v description.

- [ ] **Step 3: Přeformuluj pravidlo v globální CLAUDE.md**

V `C:\Users\licka\.claude\CLAUDE.md` nahraď v sekci `NON-NEGOTIABLE RULE: EXECUTION LAYER FOR ALL DEV ARTIFACTS` úvodní dvojici odrážek:

```markdown
- Knowledge layer (OneDrive): documentation, markdown, reference data only
- Execution layer (`C:\DEV\...`): all code, apps, scripts, tools
```

za:

```markdown
Delici linie je **spustitelne/deployovatelne vs prohlizitelne** (topologie V4, 2026-08-07):

- **Execution layer** (`C:\DEV\Claude\...`): kod, ktery se buildi, deployuje nebo bezi — UI5 aplikace, ABAP, skripty s dopadem na system, notebooky, binarky. Priklad: `apps/app01/prevodnik.html` (interaktivni nastroj).
- **Project layer** (`C:\PROJECT\...`, git repo): dokumentace + self-contained HTML k prohlizeni — diagramy, analyticke reporty, `07_OUTPUTS`. Bez build stepu, bez dependencies, otevira se pres `file://`. Priklad: `diagrams/dev-loop-swimlane.html`.
- **Binarni mirror** (OneDrive, junction `_assets/`): jen binarky (`.mp4`, `.xlsx`, `.pdf`, `.pptx`, `.vsdx`, screenshoty). Zadny `.md`.

Puvodni zneni ("knowledge layer = OneDrive") platilo pro topologii V3 a je pro V4 projekty neplatne — projektova vrstva uz neni na OneDrive, ale v lokalnim git repu.
```

Zbytek sekce (App placement convention, výjimka `07_OUTPUTS/`, README pravidlo) ponech beze změny.

- [ ] **Step 4: Ověř, že nikde nezůstalo staré tvrzení**

Run: `grep -n "Knowledge layer (OneDrive)" "C:\Users\licka\.claude\CLAUDE.md"`
Expected: prázdný výstup.

---

### Task 13: Akceptační test end-to-end

Poslední task. Ověří, že nástroj skutečně funguje — ne že prošly unit testy.

**Files:** žádné trvalé změny; vytváří a maže testovací projekt

- [ ] **Step 1: Vyplň wizard pro testovací projekt**

Otevři `struktura-wizard.html` a vyplň:

| Pole | Hodnota |
|---|---|
| Typ projektu | `INT — Interni` |
| Kratky nazev | `V4WizardTest` |
| Plny nazev | `Akceptacni test V4 wizardu` |
| Datum | `2026-08-07` |
| Koren binarniho mirroru | `…\9999Claude\Interni` |
| GitHub organizace | `ARICOMAAEA` |
| Jmeno pro branch ruleset | `vojta` |

Segment `INT` je zvolen záměrně — je to asymetrická větev bez úrovně zákazníka, kde se chyba v tvaru cesty projeví.

- [ ] **Step 2: Zkontroluj náhled cest**

Očekávané hodnoty:
```
PROJECT:   C:\PROJECT\INTERNI\20260807_V4WizardTest
EXECUTION: C:\DEV\Claude\Interni\20260807_V4WizardTest
ASSETS:    C:\Users\licka\OneDrive - ARICOMA\Prace\projekty\9999Claude\Interni\20260807_V4WizardTest
GITHUB:    ARICOMAAEA/20260807_V4WizardTest (private)
```
Žádná z nich nesmí obsahovat `Zakaznici` ani prázdnou úroveň (`\\`).

- [ ] **Step 3: Spusť prompt**

Zkopíruj prompt a vlož ho do Claude Code. Projdi všech 8 fází. U fází 5 a 6 potvrď.

- [ ] **Step 4: Spusť akceptační bránu**

Run: `powershell -File "C:\PROJECT\INTERNI\20260807_V4WizardTest\scripts\Test-Topology.ps1"`
Expected: `GATE PROSEL — 9 kontrol OK.`

Pokud brána neprojde, **nepokračuj na Step 5** — zapiš, která kontrola selhala, oprav příčinu v nástroji a zopakuj od Step 1.

- [ ] **Step 5: Ověř branch protection**

```bash
cd "C:\PROJECT\INTERNI\20260807_V4WizardTest"
git checkout -b vojta/test-protection
git commit --allow-empty -m "test: overeni protection"
git push -u origin vojta/test-protection
git checkout main
git push origin main --force-with-lease
```
Expected: push větve `vojta/test-protection` **projde**, přímý push do `main` **selže** hláškou o vyžadovaném PR. Pokud přímý push projde, protection není nastavená a Task 7 FÁZE 6 je špatně.

- [ ] **Step 6: Lokální běh pro variantu ZAK**

Zopakuj Step 1–2 s `ZAK` / `KOFOLA` / `V4WizardTestZak`, spusť prompt jen po FÁZI 4, pak FÁZE 7–8 (GitHub fáze vynech), a spusť:

Run: `powershell -File "C:\PROJECT\ZAKAZNICI\KOFOLA\20260807_V4WizardTestZak\scripts\Test-Topology.ps1" -NoGitHub`
Expected: `GATE PROSEL — 8 kontrol OK, 1 preskoceno.`

Ověř, že cesta obsahuje `ZAKAZNICI\KOFOLA\` a že projekt nekoliduje s ostrým KOFOLA projektem (`20260308_CasovaOkna`).

- [ ] **Step 7: [POTVRZENÍ] Úklid**

**Zeptej se uživatele, než cokoliv smažeš.** Vypiš mu seznam všeho, co se odstraní.

```powershell
# Junctiony NEJDRIV a jen jako link — nikdy Remove-Item -Recurse na junction
foreach ($p in @(
    'C:\PROJECT\INTERNI\20260807_V4WizardTest\_dev',
    'C:\PROJECT\INTERNI\20260807_V4WizardTest\_assets',
    'C:\DEV\Claude\Interni\20260807_V4WizardTest\CONTEXT',
    'C:\PROJECT\ZAKAZNICI\KOFOLA\20260807_V4WizardTestZak\_dev',
    'C:\PROJECT\ZAKAZNICI\KOFOLA\20260807_V4WizardTestZak\_assets',
    'C:\DEV\Claude\Zakaznici\KOFOLA\20260807_V4WizardTestZak\CONTEXT')) {
    if (Test-Path -LiteralPath $p) { [System.IO.Directory]::Delete($p, $false); "smazan junction: $p" }
}

# Teprve ted slozky
Remove-Item -Recurse -Force 'C:\PROJECT\INTERNI\20260807_V4WizardTest'
Remove-Item -Recurse -Force 'C:\DEV\Claude\Interni\20260807_V4WizardTest'
Remove-Item -Recurse -Force 'C:\Users\licka\OneDrive - ARICOMA\Prace\projekty\9999Claude\Interni\20260807_V4WizardTest'
Remove-Item -Recurse -Force 'C:\PROJECT\ZAKAZNICI\KOFOLA\20260807_V4WizardTestZak'
Remove-Item -Recurse -Force 'C:\DEV\Claude\Zakaznici\KOFOLA\20260807_V4WizardTestZak'
Remove-Item -Recurse -Force 'C:\Users\licka\OneDrive - ARICOMA\Prace\projekty\9999Claude\Interni\20260807_V4WizardTestZak'
```

```bash
gh repo delete ARICOMAAEA/20260807_V4WizardTest --yes
```

Po úklidu ověř, že ostrý KOFOLA projekt je nedotčený:

Run: `powershell -File "C:\PROJECT\ZAKAZNICI\KOFOLA\20260308_CasovaOkna\scripts\Test-Migration.ps1"`
Expected: `GATE PROSEL — vsech 9 kontrol OK.`
