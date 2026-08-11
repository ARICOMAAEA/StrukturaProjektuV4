# Changelog

Vsechny vyznamne zmeny tohoto nastroje. Format: [Keep a Changelog](https://keepachangelog.com/), verzovani: [SemVer](https://semver.org/).

## [2.1.0] - 2026-08-10

Uklidova session nad hotovym nastrojem — dotazeni zbytkovych nalezu z finalniho review
a objasneni jedineho neovereneho tvrzeni specu.

### Added
- Prompt nove zaklada i **vsechny zbyvajici soubory ze stromu**. Seznam se odvozuje z `buildTree()`
  za behu (`flattenTreeFiles()` / `remainingTreeFiles()`), takze uz nemuze zestarnout. `.md` vznikaji
  jako stub s YAML origin hlavickou; `settings.json` a `session-guard.ps1` se zamerne nestubuji
  naslepo — prompt si o jejich obsah rekne uzivateli.
- Prompt dava `CLAUDE.md` skutecne **telo** (identita projektu, topologie, session protokol,
  git pravidla, povinna YAML hlavicka). Drive existovala jen instrukce „pridej dve sekce
  za existujici sekce" pro soubor, ktery zadna faze nevytvarela.
- Popis schematu `repos.json` primo v FAZI 2 vcetne vety, ze manifest je **evidence, ne
  synchronizator** — eviduje i nekonzistentni stavy a nesjednocuje je.
- Testy (`npm test` 47 -> 51):
  - `kazdy soubor ze stromu je v promptu pokryty (vsechny presety)` — hlida presne to riziko,
    ktere spec par. 11 pojmenovava a kvuli kteremu stromem prochazelo 17 nezalozenych souboru.
  - `remainingTreeFiles nevraci nic, co uz prompt sam pise nebo kopiruje`
  - `prompt dava CLAUDE.md telo, ne jen sekce k pripojeni`
  - `FAZE 6 nevydava ruleset za vynucenou ochranu (plan team ho nevynucuje)`

### Fixed
- **Ruleset `personal-branch-naming` mel spatnou koncovou kotvu** — hole `$` misto `\n?$`,
  ktere dokumentace GitHubu u metadata restrictions vyslovne pozaduje. S holym `$` by vzor
  nefungoval spravne ani na planu, kde se ruleset vynucuje.
- Fallback `getToolRoot()` se **viditelne oznamuje** v promptu (spec par. 6.1 to pozadoval,
  implementace mlcela). Funkce nove vraci `{ path, isFallback }` — samotna cesta nerekne,
  jestli je odvozena nebo hadana.
- FAZE 2 a 3 uvadeji `repos.json` a `REPOS.md` **plnou cestou**, ne holym nazvem souboru.
- `_local/.gitkeep` je i ve stromu (prompt a README ho uvadely, strom mel `_local` prazdne).
- YAML origin hlavicka generovanych souboru ma v poli `author` **jmeno cloveka** (`branchOwner`),
  ne nazev projektu.

### Changed
- Poznamka o UTF-8 BOM v FAZI 2 **zpresnena**. Puvodni plosne „totez plati pro vsechny generovane
  `.md`" neodpovidalo skutecnosti: BOM potrebuji jen soubory, ktere PS 5.1 cte zpatky bez
  explicitniho `-Encoding` (`repos.json`, `REPOS.md`). `STALE.md` se zamerne pise **bez** BOM —
  `check-drift.ps1` ho cte s explicitnim `-Encoding UTF8` a plosne pridani BOM by pri prvnim
  `-UpdateStale` zpusobilo zbytecny diff. Skripty v `assets/` zustaly nedotcene (sha256 piny plati,
  byte-identita s KOFOLA zdrojem zachovana, zadny back-port neni potreba).
- `renderStep9()` prejmenovano na `renderStepOutput()` — vystupni krok je na indexu 10.
- README: strom struktury doplnen o `.claude/`, `CLAUDE.md`, `ContextQuick.md`, hlavni `.md`
  jednotlivych vrstev, `START_HERE.md` a `DIAGRAMS_INDEX.md`; nove vyslovne uvadi, ze
  **autoritativni je strom ve wizardu**, ne tento nacrt.
- Spec par. 5: `REPOS.md` presunut z faze 2 na konec faze 3 (kod a plan to tak mely, spec ne).
- Spec par. 5.1: vzor rulesetu je genericky `^[a-z0-9-]+/[a-z0-9-]+\n?$`, ne `<branchOwner>/…`.
- Spec par. 11.1 prepsan — viz nize.

### Security
- **Objasnena pricina, proc ruleset nevynucoval vzor** (jedine neoverene tvrzeni specu).
  `branch_name_pattern` patri mezi *metadata restrictions*, ktere GitHub nabizi az organizacim
  na planu **Enterprise**; `ARICOMAAEA` je na planu `team`. Na nizsim planu GitHub payload tise
  prijme, ruleset vytvori a hlasi jako aktivni — ale nevyhodnocuje ho. Slo tedy o **licencni limit
  bez chybove hlasky**, ne o chybu generatoru.
  Ruleset se zaklada dal (po prechodu na Enterprise zacne vynucovat sam), ale prompt nyni nahlas
  uvadi, ze **na planu `team` nejde o vynucenou ochranu**. Jedina skutecne vynucena ochrana je
  branch protection na `main` (`GH006`); konvenci nazvu vetvi drzi `.github/CONTRIBUTING.md`.

## [2.0.0] - 2026-08-07

### Added
- Krok „Topologie & Git" — explicitni koren binarniho mirroru, GitHub org/repo/private, jmeno pro branch ruleset.
- `assets/` se ctyrmi PowerShell skripty a `.github` sablonami dodavanymi do generovaneho projektu.
- `Test-Topology.ps1` — projekt-agnosticky health-check (9 kontrol) dodavany do kazdeho projektu.
- Testy: Node harness pro cisté funkce wizardu, Pester testy pro `Test-Topology.ps1`.

### Changed
- Slozka i GitHub repo prejmenovany na StrukturaProjektuV4 (GitHub drzi redirect ze stareho nazvu).
- **Breaking:** wizard generuje topologii V4 misto V3. Projektova vrstva je git repo v `C:\PROJECT`, ne slozka na OneDrive.
- `08_DEV/` obsahuje `repos.json` + generovany `REPOS.md` misto `ExecutionLayer.lnk`.
- Claude Code prompt provadi 8 fazi vcetne `gh repo create` a branch protection — obe s potvrzenim uzivatele.

### Removed
- **Breaking:** `generatePowerShell()` (616 radku). Slo o mrtvy kod bez volajiciho; README ho chybne inzeroval jako treti vystup.
- Moznost zalozit projekt ve V3 topologii.

### Fixed
- `assets/` uz nepodleha eol konverzi (`core.autocrlf=true` bez `.gitattributes` menilo LF na CRLF pri checkoutu, coz rozbijelo byte-fidelitu sablon a sha256 pin testy nezavisle na jakekoli skutecne zmene).
