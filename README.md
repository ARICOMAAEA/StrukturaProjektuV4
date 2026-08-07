# Meta Framework V4 — Structure Wizard

Browser-based wizard that generates the input for a Claude Code prompt which
scaffolds a complete Meta Framework Model project in **topology V4**: a git
project layer, a matching execution layer, and a binary mirror on OneDrive,
wired together with NTFS junctions. The wizard itself never touches disk — it
only produces a tree preview and a prompt for Claude Code to execute.

## What's inside

| File / folder | Description |
|------|-------------|
| `struktura-wizard.html` | Single self-contained HTML wizard (no build step) — fill in 11 steps, get a tree preview and a Claude Code prompt |
| `diagrams/architecture-overview.html` | One-page visual overview of the whole tool — input, engine, output, layer structure, automation, lifecycle |
| `assets/` | Templates and scripts copied into every generated project (see below) |
| `tests/` | Node and Pester test suites for the wizard's pure functions and for `Test-Topology.ps1` |

## Architecture diagram

For a one-page visual explanation of how the wizard, generated structure,
automation (skills/agents/hooks), and lifecycle rules fit together, open:

```
diagrams/architecture-overview.html
```

It is a single self-contained HTML file (dark theme, inline SVG, no build
step). Open it directly in a browser via `file://`. Use it for onboarding new
users, presentations, or as a refresher before working with the framework.

## Requirements

- **Browser** (for the HTML wizard)
- **Claude Code** (to execute the generated prompt)
- **GitHub CLI (`gh`)**, logged in — the prompt creates the GitHub repo and
  branch protection for you
- **Node.js** and **Pester** (only if you want to run the test suites — see below)

## Usage

1. Open `struktura-wizard.html` in a browser (`file://`). Choose one of two ways to fill it in:
   - **Rychlý import:** click **"Stáhnout šablonu"** in the sidebar to download a blank
     `.md` template, fill it in any text editor, then load it back via **"Import .md"**
     or by dragging the file onto the page. The template round-trips all three roots
     (project/execution/assets) and the GitHub fields, and a filled template drops you
     straight onto the output step.
   - **Krok za krokem:** fill the 11-step form directly in the browser.
2. The 11 steps: Metadata, layers 01 Business – 07 Resource, Delivery,
   **Topologie & Git** (binary-mirror root, GitHub org/repo/private,
   branch-ruleset first name), and finally Výstup (Output).
3. On the output step, switch between the **Strom** (tree preview) tab and the
   **Claude Code Prompt** tab. Copy the prompt and paste it into Claude Code.
4. Claude Code executes the prompt as an 8-phase procedure: preflight checks,
   creating the three root folders, populating the project-layer content,
   copying the V4 scaffolding from `assets/`, `git init` + first commit,
   then two phases that **ask for your confirmation before touching
   GitHub** (`gh repo create` + push, then branch protection + ruleset),
   wiring the junctions via `bootstrap.ps1`, and finally an acceptance gate via
   `Test-Topology.ps1`.

## Where a generated project ends up

Every project lives in three physical places:

```
C:\PROJECT\{ZAKAZNICI\<CUSTOMER>|INTERNI}\<PROJECT_ID>      (git project layer)
C:\DEV\Claude\{Zakaznici\<CUSTOMER>|Interni}\<PROJECT_ID>   (execution layer)
<binary mirror root>\...                                    (OneDrive, reached via _assets junction)
```

Note the segment casing differs deliberately between the two trees
(`ZAKAZNICI`/`INTERNI` uppercase in the project layer vs.
`Zakaznici`/`Interni` capitalized in the execution layer), and that internal
projects (`INTERNI`/`Interni`) have no customer-name level — both mirror the
real directories already in use.

## Generated structure (project layer)

> Every structural folder also gets a **folder-description `README.md`** (Účel / Co sem patří / Co sem nepatří / Kdo smí měnit) following the KOFOLA pattern.

```
<PROJECT_ID>/                           (git project layer, C:\PROJECT\...)
├── 00_PROJECT_CONTROL/README.md
│   ├── 01_BUSINESS/BUSINESS.md + README.md
│   ├── 02_KNOWLEDGE/README.md
│   ├── 03_ARCHITECTURE/ADR/ + README.md
│   ├── 04_ENGINEERING/README.md
│   ├── 05_PLAN/PLAN.md + README.md
│   ├── 06_DATA/DATA.md + README.md
│   ├── 07_RESOURCE/prompty/
│   │               RESOURCE.md + README.md
│   └── 08_DEV/repos.json + REPOS.md + README.md
├── 10_DELIVERY/README.md               (Standard+)
│   ├── 11_MEETINGS/README.md
│   ├── 12_WORK_ITEMS/01_BR/ + 02_FS,03_TS/{_project,app01}/ + 04,05/ + 06_OUTPUTS/{DIAGRAMS,PRESENTATIONS} + README.md
│   ├── 13_MIGRATION/01-07/            (Full only)
│   ├── 14_INTEGRATION/01-04/          (Full only)
│   ├── 15_TESTING/01-06/              (Full only)
│   ├── 16_RELEASE_TRANSPORT/          (Full only)
│   └── 17_OPERATIONS/                 (Full only)
├── 20_SHARED_REFERENCE/README.md       (Standard+)
│   ├── 21_TEMPLATES/README.md
│   ├── 22_STANDARDS/TAGS.md + README.md
│   └── 23_NAMING_CONVENTIONS/README.md
├── 99_ARCHIVE/
├── scripts/{bootstrap,check-drift,Generate-ReposMd,Test-Topology}.ps1
├── .github/{CODEOWNERS,CONTRIBUTING.md,PULL_REQUEST_TEMPLATE.md}
├── .gitignore, .gitattributes
├── _local/.gitkeep
├── _dev      --> Execution Layer        (NTFS junction, created in Phase 7)
├── _assets   --> Binary mirror (OneDrive) (NTFS junction, created in Phase 7)
├── GLOSSARY.md                         (Standard+)
├── ID_REGISTRY.md                      (Standard+)
├── PROJECT_HISTORY.md
├── PROJECT_STATUS.md
├── README.md
├── STALE.md                            (Standard+)
├── TOPIC_MAP.md                        (Standard+)
├── Todo.md
├── CHANGELOG.md
└── souhrnGPT.md

<PROJECT_ID>/                           (Execution Layer, C:\DEV\Claude\...)
├── .claude/skills/
├── apps/
└── CONTEXT  --> Project Layer           (reverse NTFS junction)
```

## Delivery presets

| Preset | Sections |
|--------|----------|
| **Minimal** | Core layers (01-07) + 99_ARCHIVE only |
| **Standard** | + 11_MEETINGS, 12_WORK_ITEMS, 20_SHARED_REFERENCE, Discovery Layer |
| **Full** | + 13_MIGRATION, 14_INTEGRATION, 15_TESTING, 16_RELEASE_TRANSPORT, 17_OPERATIONS |

## Discovery layer (Standard+)

Generated automatically for non-Minimal presets. Provides metadata and indexes for faster project navigation:

| File | Purpose |
|------|---------|
| `ID_REGISTRY.md` | Lookup table for all project IDs (BR, SP, FS, TS, DEV, CR, TC) |
| `TOPIC_MAP.md` | Cross-cutting topics with canonical sources |
| `GLOSSARY.md` | Terms, abbreviations, custom objects, roles |
| `STALE.md` | Tracking dead links in indexes |
| `22_STANDARDS/TAGS.md` | Controlled vocabulary for frontmatter tags |
| `23_NAMING_CONVENTIONS/README.md` | File and folder naming patterns |

Also adds **Search protocol** and **Don't-read list** sections to CLAUDE.md.

## What's in `assets/`

Copied verbatim into every generated project during Phase 3 of the Claude Code prompt (the `.gitignore`/`.gitattributes` sources are kept dot-less on purpose — the prompt adds the leading dot when copying):

| Source | Copied to |
|---|---|
| `assets/scripts/bootstrap.ps1` | `scripts/bootstrap.ps1` — creates the `_dev`/`_assets` junctions |
| `assets/scripts/check-drift.ps1` | `scripts/check-drift.ps1` |
| `assets/scripts/Generate-ReposMd.ps1` | `scripts/Generate-ReposMd.ps1` — renders `REPOS.md` from `repos.json` |
| `assets/scripts/Test-Topology.ps1` | `scripts/Test-Topology.ps1` — project-agnostic acceptance gate (9 checks) |
| `assets/github/CODEOWNERS` | `.github/CODEOWNERS` |
| `assets/github/CONTRIBUTING.md` | `.github/CONTRIBUTING.md` |
| `assets/github/PULL_REQUEST_TEMPLATE.md` | `.github/PULL_REQUEST_TEMPLATE.md` |
| `assets/git/gitignore` | `.gitignore` |
| `assets/git/gitattributes` | `.gitattributes` |

## Tests

Two independent suites — one for the wizard's pure JS functions and generated
assets, one for the PowerShell topology gate:

```bash
npm test
```
Runs 33 Node tests (`tests/wizard.test.mjs`, `tests/assets.test.mjs`).

```powershell
powershell -NoProfile -Command "Invoke-Pester -Path tests\Test-Topology.Tests.ps1"
```
Runs 5 Pester tests against `assets/scripts/Test-Topology.ps1`.
