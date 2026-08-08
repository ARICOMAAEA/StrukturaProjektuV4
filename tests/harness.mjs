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
  vm.runInContext('this.state = state; this.steps = steps; this.ASSETS_ROOT_PRESETS = ASSETS_ROOT_PRESETS;', sandbox);

  return sandbox;
}

/** Nastavi metadata a znovu vyhodnoti odvozene hodnoty. */
export function setMetadata(w, patch) {
  Object.assign(w.state.metadata, patch);
  return w;
}
