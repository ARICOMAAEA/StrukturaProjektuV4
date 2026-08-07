---
created: 2026-07-29 12:00
author: Vojta (p. Lička)
origin_type: manual
origin_source: "StrukturaProjektuV3, Task 9 — assets/github/CONTRIBUTING.md sablona pro generovane projekty"
purpose: Popisuje branch → PR → merge workflow projektového repa.
---

# Jak přispět

Repo patří organizaci `{{GITHUB_ORG}}`. Branch protection na `main` je **technicky vynucená** — PR je povinný i pro adminy.

## Model větví — `jmeno/co-dela`

Žádné stálé osobní větve. Každý úkol = nová větev:

- `jmeno` = křestní jméno malými písmeny, bez diakritiky: `{{BRANCH_OWNER}}`, `honza`; při kolizi `jmeno-prijmeni`.
- `co-dela` = krátký slug úkolu: `br-115-analyza`, `fix-topic-map`.
- Větev vzniká z `origin/main`, po mergi se **automaticky maže** (`delete_branch_on_merge`).
- **Vynuceno GitHub Rulesetem** `personal-branch-naming` — push větve mimo vzor `^[a-z0-9-]+/[a-z0-9-]+$` GitHub odmítne, bez výjimky pro adminy.

## Postup pro každou změnu

```bash
git fetch origin main
git worktree add .claude/worktrees/<jmeno>+<co-dela> -b <jmeno>/<co-dela> origin/main
cd .claude/worktrees/<jmeno>+<co-dela>
powershell -File scripts/bootstrap.ps1          # doplni junctiony _dev a _assets do worktree
# … prace …
git add . && git commit -m "<typ>: <co a proc>"
git push -u origin <jmeno>/<co-dela>
gh pr create --base main --fill
gh pr merge --merge                              # self-merge OK
```

> **Poznámka k `bootstrap.ps1` ve worktree**: skript může vypsat varování
> `CONTEXT — junction ma jiny cil (NESOUHLASI)`. To je **očekávané a
> bezpečné** — junction `CONTEXT` v execution vrstvě vždy míří na hlavní
> checkout (ne na worktree) a `bootstrap.ps1` je navržen tak, aby nikdy
> nepřepsal existující junction mířící jinam. První contributor by toto
> hlášení neměl vnímat jako selhání.

Úklid po mergi:

```bash
git worktree remove .claude/worktrees/<jmeno>+<co-dela>
git branch -D <jmeno>/<co-dela>
```

### Odstraneni worktree

`git worktree remove` na Windows padne "Permission denied", pokud worktree obsahuje
junctiony `_dev` / `_assets` (vytvořené `bootstrap.ps1`) — ty mohou blokovat gitovo
rekurzivní mazání. Nejdriv je zrus — jen link, nikdy ne cil, na ktery ukazuji:

```powershell
$wt = ".claude\worktrees\<jmeno>+<co-dela>"
[System.IO.Directory]::Delete("$wt\_dev", $false)
[System.IO.Directory]::Delete("$wt\_assets", $false)
Remove-Item -Recurse -Force $wt
git worktree prune
```

NIKDY nepouzivej `Remove-Item -Recurse` primo na junction — na nekterych kombinacich
PowerShellu a filesystemu projde skrz a smaze cilova data.

- **Nikdy přímý commit/push do `main`.**
- **Self-merge je OK** — `required_approving_review_count: 0`. Review se nevynucuje záměrně, aby nezdržovalo.
- Prefix commitu: `feat` / `fix` / `docs` / `chore` / `refactor`.

## Konvence obsahu

- Text jen v gitu; binárky do `_assets/` (junction → OneDrive), nikdy do gitu. `.gitignore` to navíc technicky blokuje.
- Nové `.md` mají YAML origin header. Výjimka: funkční soubory (`CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md`), generované soubory (`REPOS.md`), `CHANGELOG.md`.
- Příjmení s předponou `p.` (`p. Lička`).
- Změna `repos.json` → pregenerovat `REPOS.md` přes `scripts/Generate-ReposMd.ps1`. `REPOS.md` **nikdy needituj ručně.**

## Omezení paralelní práce

Dvě session mohou nezávisle psát dokumentaci ve vlastních worktree. **Nesmí ale zároveň spouštět dev/build cyklus nad stejnou aplikací**, pokud je dev vrstva sdílená (není izolovaná per session) a existuje jen jeden aktivní stav (např. sdílené vývojové prostředí, jeden nasazený balíček). Git worktree izoluje pouze pracovní kopii zdrojového kódu, nikoli sdílený stav mimo git — to je potřeba ošetřit zvlášť podle konkrétního nástroje/prostředí projektu.

## Řešení konfliktů

Větev je krátkodobá — konflikt s `main` řeš `git merge main` (ne rebase, kdyby na větvi pracoval někdo další), commitni, teprve pak PR. Binárky nejsou v gitu, takže konflikty jsou vždy jen textové.
