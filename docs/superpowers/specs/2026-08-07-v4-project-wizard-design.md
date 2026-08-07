---
created: 2026-08-07 10:30
author: Vojta (p. Lička)
origin_type: analysis
origin_source: "Brainstorming session 2026-08-07 — follow-up ze specu 2026-07-29-project-topology-v4-design.md §11 (Mimo rozsah: struktura-wizard.html pro novou topologii)"
purpose: Definuje rozšíření StrukturaProjektu wizardu z V3 na V4 topologii — greenfield zakládání projektů se třemi fyzickými místy, git projektovou vrstvou, manifestem repos.json a čtyřmi podpůrnými skripty.
---

# Design: Wizard pro zakládání projektů v topologii V4

## 1. Kontext

Spec `2026-07-29-project-topology-v4-design.md` zavedl topologii V4 — tři fyzická místa (git projektová vrstva v `C:\PROJECT`, execution vrstva v `C:\DEV\Claude`, binární mirror na OneDrive), manifest `repos.json` a čtyři podpůrné PowerShell skripty. KOFOLA Časová okna byla podle něj **ručně** zmigrována (10 tasků, dvě kola oprav, verifikační gate 9/9).

Spec §11 explicitně vyjmul z rozsahu generování nové topologie pro **nové** projekty:

> **Mimo rozsah:** `meta-framework-init` a `struktura-wizard.html` — generování nové topologie pro nové projekty. To je samostatný follow-up projekt.

Tento spec je ten follow-up.

Dnešní stav nástroje: `00_TOOLS\StrukturaProjektuV3\struktura-wizard.html` (2940 řádků, 134 KB, vlastní git repo). Generuje **V3 topologii** — knowledge layer na OneDrive, execution layer v `C:\DEV\Claude`, propojení přes `CONTEXT` junction a `08_DEV\ExecutionLayer.lnk`. O gitu, manifestu ani binárním mirroru neví nic.

## 2. Rozhodnutí, která tento design formalizuje

| # | Rozhodnutí | Zdůvodnění |
|---|---|---|
| W1 | Forma zůstává **HTML wizard → Claude Code prompt** | Zavedený workflow; Claude umí reagovat na nečekané stavy (existující složka, chybějící `gh auth`), deterministický skript ne |
| W2 | V3 wizard se **rozšíří in-place**, V3 topologie zaniká | Jeden nástroj, jedno místo; fork ani přepínač by znamenal dvě kopie 2940 řádků generující logiky |
| W3 | Rozsah je **jen greenfield** | Každý brownfield projekt má vlastní nekonzistence (dva OneDrive rooty, cizí org, ssh remotes); KOFOLA vyžadovala 10 tasků a dvě kola oprav — automatizace by byla křehká |
| W4 | GitHub kroky se provádějí, ale **s potvrzením před každým** | `gh repo create` v ARICOMAAEA je navenek působící a nevratný krok; překlep v názvu založí zavěječnou repo v organizaci |
| W5 | `meta-framework-init` se **deprecuje** | Dvě cesty ke stejné struktuře se garantovaně rozejdou |
| W6 | `generatePowerShell()` se **ruší** | ~930 řádků (třetina souboru) duplikujících prompt; neumí interaktivní potvrzení GitHub kroků (W4) — držet je v souladu je hlavní riziko rozpadu |
| W7 | Složka se přejmenuje na `StrukturaProjektuV4` | Název má odpovídat tomu, co nástroj generuje |

## 3. Architektura zásahu

Wizard je vnitřně dobře strukturovaný — zásah je **lokalizovaný, ne přepis**:

| Kotva v dnešním souboru | Změna |
|---|---|
| ř. 149 `state.metadata.knowledgeBase` (default OneDrive `9999Claude`) | přejmenovat na `projectBase`, default `C:\PROJECT`; přibývají `assetsRoot`, `segment`, `githubOrg`, `repoName`, `repoPrivate`, `branchOwner` |
| ř. 303 `getKnowledgeRoot()` | → `getProjectRoot()`, skládá cestu podle segmentu (§4.1) |
| ř. 313 `getExecutionRoot()` | beze změny logiky, jen segment se bere z nového pole |
| — (nová) | `getAssetsRoot()` — vrací **explicitní** hodnotu z metadat, nikdy nedopočítává |
| ř. 260 `const steps = [...]` | nový krok „Topologie & Git" |
| ř. 808 `buildTree()` | strom doplnit o V4 nadstavbu (`_dev`, `_assets`, `_local`, `.github`, `scripts`, `repos.json`) |
| ř. 1021 `generateClaudePrompt()` | přepsat na 8 fází (§5) |
| ř. 1606–2540 `generatePowerShell()` | **smazat** (W6) |
| ř. 1897 `08_DEV` folder-README text | `ExecutionLayer.lnk` → `repos.json` + `REPOS.md`, zmínku „knowledge layer (OneDrive)" opravit |

Zbývající dva výstupy — **Claude Code prompt** a **tree preview** — se musí držet v souladu. To je dva generátory místo tří.

## 4. Vstupy wizardu

K dnešním krokům přibývá krok **„Topologie & Git"**:

| Pole | Typ | Default | Poznámka |
|---|---|---|---|
| `segment` | `ZAKAZNICI` \| `INTERNI` | `ZAKAZNICI` | řídí obě cesty naráz i **tvar** cesty — viz §4.1 |
| `projectBase` | text | `C:\PROJECT` | kořen bez segmentu |
| `assetsRoot` | dropdown + volný text | — (povinné) | **explicitní**, viz níže |
| `githubOrg` | text | `ARICOMAAEA` | |
| `repoName` | text | `<CUSTOMER>_<PROJEKT>` | předvyplněno, editovatelné |
| `repoPrivate` | checkbox | ✔ | |
| `branchOwner` | text | — | jméno do vzoru rulesetu `<jmeno>/<co-dela>` |

### 4.1 Segment určuje tvar cesty, ne jen její začátek

Dnešní konvence na disku **nejsou symetrické** — `Zakaznici\` má úroveň zákazníka, `Interni\` ne:

```
C:\DEV\Claude\Zakaznici\KOFOLA\20260308_CasovaOkna     ← <SEGMENT>\<CUSTOMER>\<PROJEKT>
C:\DEV\Claude\Interni\20260713_Pivovar                 ← <SEGMENT>\<PROJEKT>
```

Wizard to musí respektovat, jinak založí interní projekt o úroveň hlouběji, než kam míří všechny ostatní:

| segment | project layer | execution layer | repo name |
|---|---|---|---|
| `ZAKAZNICI` | `<projectBase>\ZAKAZNICI\<CUSTOMER>\<PROJEKT>` | `C:\DEV\Claude\Zakaznici\<CUSTOMER>\<PROJEKT>` | `<CUSTOMER>_<PROJEKT>` |
| `INTERNI` | `<projectBase>\INTERNI\<PROJEKT>` | `C:\DEV\Claude\Interni\<PROJEKT>` | `<PROJEKT>` |

Při `segment = INTERNI` se pole **customer skryje** a nevstupuje do žádné cesty ani do názvu repa.

Pozn.: segment se v `C:\PROJECT` píše velkými písmeny (`ZAKAZNICI`), v `C:\DEV\Claude` s velkým počátečním (`Zakaznici`) — dnešní stav obou stromů. Wizard mapuje, nesjednocuje.

### 4.2 `assetsRoot` se nikdy nedopočítává

Na OneDrive existují **dva různé zákaznické rooty** a projekty jsou rozdělené mezi ně:

| Root | Obsahuje |
|---|---|
| `9999Claude\Zakaznici\` | Alika, ARICOMA, HEINEKEN, LINET, Promet, QUICK, Schwan Cosmetics CR |
| `9999Claude\SAP Service - Projekty\Zakaznici\` | KOFOLA a další SAP Service projekty |

Jakýkoli pokus dopočítat cestu z názvu zákazníka by u poloviny projektů selhal (spec V4 §3.1). Wizard proto nabídne dropdown se třemi volbami — oba známé rooty a „Teams kanál" (`C:\Users\licka\ARICOMA\<kanál> - General\<PROJEKT>`, model Pivovar pro sdílení s externisty) — plus volný text. Vybraná hodnota se **doplní o `\<CUSTOMER>\<PROJEKT>`** a zobrazí k odsouhlasení v náhledu cest.

## 5. Vygenerovaný prompt — 8 fází

```
0  Preflight        gh auth status; git --version; cílové cesty NEEXISTUJÍ → jinak STOP
1  Tři kořeny       project layer + execution layer + assetsRoot (prázdné)
2  Obsah            V3 znalostní struktura do C:\PROJECT (generující logika zůstává,
                    mění se jen cílová cesta a blok 08_DEV — viz §3)
                    08_DEV: repos.json (prázdné repos[]) + generovaný REPOS.md
3  V4 nadstavba     .gitignore, .gitattributes,
                    .github/{CODEOWNERS,CONTRIBUTING.md,PULL_REQUEST_TEMPLATE.md},
                    scripts/{bootstrap,check-drift,Generate-ReposMd,Test-Topology}.ps1,
                    _local/.gitkeep, CHANGELOG.md
4  git init         + první lokální commit
5  [POTVRZENÍ]      gh repo create --private  →  git push -u origin main
6  [POTVRZENÍ]      branch protection + ruleset personal-branch-naming
7  bootstrap.ps1    junctiony _dev, _assets, CONTEXT
8  Test-Topology    akceptační brána — při FAIL prompt hlásí selhání a nepokračuje
```

**Pořadí 4 → 5 → 6 je závazné.** Branch protection se zapíná až po prvním pushi — na prázdný `main` by push s protection neprošel (spec V4 §9, Fáze A krok 1).

Fáze 5 a 6 jsou jediné navenek působící kroky. Prompt před každou z nich **explicitně požádá o potvrzení** a vypíše, co přesně provede (celý `gh` příkaz včetně org a názvu repa).

### 5.1 Nastavení GitHubu ve fázi 6

Přebírá se beze změny z KOFOLA (spec V4 §6.1):

| Nastavení | Hodnota |
|---|---|
| Branch protection na `main` | PR povinný, **i pro adminy** |
| `required_approving_review_count` | `0` (self-merge OK) |
| `delete_branch_on_merge` | `true` |
| Ruleset `personal-branch-naming` | vzor `<branchOwner>/<co-dela>` |
| `.github/CODEOWNERS` | advisory (`require_code_owner_reviews: false`) |

## 6. Skripty dodávané do projektu

| Skript | Původ | Poznámka |
|---|---|---|
| `bootstrap.ps1` | **verbatim** z KOFOLA | ověřeno: plně manifest-driven, nula výskytů „KOFOLA" nebo absolutní cesty |
| `check-drift.ps1` | **verbatim** | totéž |
| `Generate-ReposMd.ps1` | **verbatim** | totéž; už obsahuje stabilní tiebreaker řazení |
| `Test-Topology.ps1` | **nový** | viz §7 |

`Test-Migration.ps1` z KOFOLA se **nekopíruje**. Je to jednorázová migrační brána s hardcoded očekáváními (`md=364`, `html=24`, konkrétní KOFOLA soubory, 361 `MD_V_MIRRORU`) — pro nový projekt nedává smysl.

## 7. `Test-Topology.ps1` — akceptační brána

Projekt-agnostický health-check dodávaný do každého projektu. Read-only. Exit 0 jen když projdou všechny kontroly. Je zároveň **akceptačním testem samotného nástroje** (§9).

| # | Kontrola | Kritérium |
|---|---|---|
| 1 | Manifest | `repos.json` parsuje, obsahuje `project`, `devRoot`, `assetsRoot`, `repos` |
| 2 | Kořeny | `devRoot` i `assetsRoot` existují na disku |
| 3 | `_dev` | junction existuje a míří na `devRoot` |
| 4 | `_assets` | junction existuje a míří na `assetsRoot` |
| 5 | `CONTEXT` | junction v `devRoot` míří na repo root |
| 6 | Binárky | žádný trackovaný soubor s příponou `mp4/xlsx/vsdx/pdf/png/jpg/jpeg/pptx/lnk` |
| 7 | `.gitignore` | pokrývá `_dev/`, `_assets/`, `_local/`, `.claude/worktrees/`, `.claude/settings.local.json` |
| 8 | Git | repo existuje, ≥1 commit, `origin` odpovídá `<githubOrg>/<repoName>` |
| 9 | Drift | `check-drift.ps1` exit 0 |

Přepínač `-NoGitHub` vynechá kontrolu 8 (projekt zatím bez remote) — jinak by lokální běh nikdy nemohl projít. Ostatních 8 kontrol platí vždy.

Struktura výstupu (tabulka `Kontrola` / `Vysledek` / `Detail` + souhrnná hláška, exit 0/1) kopíruje `Test-Migration.ps1` — formát se osvědčil.

Vědomé omezení: kontrola 8 porovnává remote proti hodnotám zadaným ve wizardu, ne proti manifestu — `repos.json` eviduje **dev** repa, ne projektové repo. Očekávaná hodnota se proto do skriptu vygeneruje jako konstanta.

## 8. Gotchas zapečené do generátoru

Sedm nálezů z KOFOLA migrace, které nový nástroj musí řešit správně od začátku:

| Gotcha | Kde se řeší |
|---|---|
| PS 5.1 čte UTF-8 bez BOM přes ANSI codepage → láme diakritiku | prompt explicitně předepisuje **UTF-8 s BOM** pro každý soubor čtený zpátky PowerShellem (`repos.json`, generované `.md`) |
| `$PSScriptRoot`, nikdy cwd — jinak se rozbije běh z worktree | ve všech čtyřech skriptech (u tří zděděno, v `Test-Topology.ps1` nově) |
| `.claude/worktrees/` musí být v `.gitignore` **od prvního commitu** | šablona `.gitignore` ve fázi 3, kontrola č. 7 v `Test-Topology.ps1` |
| `git worktree remove` na Windows padá „Permission denied" u junctionů | postup v `.github/CONTRIBUTING.md` |
| Bezpečné rušení junctionu: `[System.IO.Directory]::Delete($p, $false)`, nikdy `Remove-Item -Recurse` | `.github/CONTRIBUTING.md` |
| `Sort-Object` v PS 5.1 není stabilní pro shodné klíče | `Generate-ReposMd.ps1` (zděděný tiebreaker) |
| Manifest eviduje i „cizí"/nekonzistentní stavy, nesjednocuje je tiše | komentář schématu v `repos.json` + legenda v `REPOS.md` |

## 9. Akceptační test

Skutečný běh nad prázdným testovacím projektem:

```
segment       = INTERNI                                    (tedy bez úrovně zákazníka)
projekt       = 20260807_V4WizardTest
project layer = C:\PROJECT\INTERNI\20260807_V4WizardTest
execution     = C:\DEV\Claude\Interni\20260807_V4WizardTest
assetsRoot    = …\9999Claude\Interni\20260807_V4WizardTest
repo          = ARICOMAAEA/20260807_V4WizardTest (private)
```

Test musí zahrnovat **reálné repo a reálnou branch protection** — jinak se fáze 5–6 neověří. Kritérium: `Test-Topology.ps1` → 9/9 bez jediného ručního zásahu.

Segment `INTERNI` je zvolen záměrně — je to ta asymetrická větev (§4.1), kde se chyba v tvaru cesty projeví. Varianta `ZAKAZNICI` se ověří druhým, jen lokálním během (fáze 0–4 a 7–8, `Test-Topology.ps1 -NoGitHub` → 8/8), aby se nezakládalo druhé zbytečné repo.

Po testu se testovací repo a všechny tři složky smažou — **s explicitním potvrzením uživatele**.

## 10. Návazné úpravy mimo wizard

| Co | Změna |
|---|---|
| `~\.claude\skills\meta-framework-init\SKILL.md` | nahradit stubem hlásícím deprecation + odkaz na wizard. Stub, ne smazání — invokace pak dá čitelnou zprávu místo „skill not found". |
| Globální `~\.claude\CLAUDE.md`, pravidlo „EXECUTION LAYER FOR ALL DEV ARTIFACTS" | přeformulovat dle spec V4 §4.2 na *spustitelné/deployovatelné vs prohlížitelné*. Dnes zní „Knowledge layer (OneDrive)" — pro V4 projekty **aktivně nepravdivé**. V migraci KOFOLA to zůstalo nedodělané, ačkoli spec V4 §11 to měl v rozsahu. |
| `StrukturaProjektuV4\README.md` | V4 popis, nová generovaná struktura, zánik PowerShell výstupu |
| `StrukturaProjektuV4\CHANGELOG.md` | záznam verze podle Keep a Changelog (MAJOR bump — breaking: V3 topologie zaniká) |
| Přejmenování složky | rename `StrukturaProjektuV3` → `StrukturaProjektuV4`; git repo cestuje se složkou |
| Přejmenování GitHub repa | nástroj má remote `ARICOMAAEA/StrukturaProjektuV3` → přejmenovat na `StrukturaProjektuV4` + `git remote set-url`. GitHub drží redirect ze starého názvu, takže existující klony se nerozbijí. **Navenek působící krok — s potvrzením** (W4). |

## 11. Rizika

| Riziko | Dopad | Mitigace |
|---|---|---|
| Překlep v názvu projektu → zavěječná repo v ARICOMAAEA | úklid v cizí organizaci | W4 — potvrzení před `gh repo create`, prompt vypíše celý příkaz |
| Prompt a tree preview se rozejdou | wizard slibuje jinou strukturu, než vznikne | dva generátory místo tří (W6); akceptační test §9 porovnává realitu |
| `assetsRoot` zadán špatně | binárky skončí mimo mirror | povinné pole, náhled složené cesty před generováním, kontrola č. 2 a 4 v `Test-Topology.ps1` |
| Uživatel spustí deprecated `meta-framework-init` | projekt ve V3 topologii bez varování | stub místo funkčního skillu (§10) |
| Přejmenování složky rozbije záložky | drobná nepříjemnost | vědomě přijato (W7) |
| Zásah do 2940řádkového HTML rozbije existující generování | wizard přestane fungovat | git repo s historií; akceptační test §9 je end-to-end |

## 12. Rozsah

**V rozsahu:** rozšíření wizardu na V4 (nový krok, nové cesty, 8fázový prompt, tree preview), zrušení `generatePowerShell()`, `Test-Topology.ps1`, přejmenování složky, README + CHANGELOG nástroje, deprecation stub `meta-framework-init`, přeformulování pravidla v globální `CLAUDE.md`, akceptační test.

**Mimo rozsah (samostatné follow-upy):**

- **Brownfield režim** — migrace existujících projektů (WIKOV, DEL). Zůstává ruční prací podle KOFOLA receptu (spec + plán V4 existují).
- **Skill `zvl_repo-registry-g`** — přidávání dalších aplikací do `repos.json` po založení projektu. Spec V4 §7.2 ho měl v rozsahu, ale nevznikl. Greenfield init ho nepotřebuje (manifest začíná prázdný).
- **Přesun `00_TOOLS` do topologie V4** — nástroj sám dnes leží na OneDrive s vlastním gitem.
- **Back-port `bootstrap.ps1` junctionů do worktrees projektu AI Pivovar.**
