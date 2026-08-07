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
