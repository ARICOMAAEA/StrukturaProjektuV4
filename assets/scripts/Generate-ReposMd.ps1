<#
.SYNOPSIS
    Generuje 08_DEV/REPOS.md z 08_DEV/repos.json.
.DESCRIPTION
    repos.json je jedina pravda o dev repozitarich. REPOS.md je jeho lidsky
    citelna projekce a NIKDY se needituje rucne — pri kazde zmene manifestu
    spust tento skript.
.PARAMETER ManifestPath
    Cesta k repos.json. Default: ..\00_PROJECT_CONTROL\08_DEV\repos.json relativne ke skriptu.
.PARAMETER OutputPath
    Cesta k vystupnimu REPOS.md. Default: vedle manifestu.
.EXAMPLE
    powershell -File scripts\Generate-ReposMd.ps1
.EXAMPLE
    powershell -File scripts\Generate-ReposMd.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ManifestPath,
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ManifestPath) { $ManifestPath = Join-Path $repoRoot '00_PROJECT_CONTROL\08_DEV\repos.json' }
if (-not $OutputPath)   { $OutputPath   = Join-Path $repoRoot '00_PROJECT_CONTROL\08_DEV\REPOS.md' }

if (-not (Test-Path -LiteralPath $ManifestPath)) { throw "Manifest neexistuje: $ManifestPath" }

$m = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json

# Serazeni: app vzestupne, ABAP pred UI5
# @() obalka je NUTNA: Sort-Object nad prazdnym polem vraci $null (ne prazdne
# pole), a $null.Count pod Set-StrictMode -Version Latest hodi vyjimku o par
# radku niz. Kazdy novy projekt zacina s repos: [], takze bez @() by tento
# skript selhal na KAZDEM cerstve zalozenem projektu.
$sorted = @($m.repos | Sort-Object @{ Expression = 'app' }, @{ Expression = { if ($_.kind -eq 'ABAP') { 0 } else { 1 } } }, @{ Expression = 'path' })

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('<!-- GENEROVANY SOUBOR — needituj rucne.')
[void]$sb.AppendLine('     Zdroj: 08_DEV/repos.json')
[void]$sb.AppendLine('     Regenerace: powershell -File scripts\Generate-ReposMd.ps1 -->')
[void]$sb.AppendLine()
[void]$sb.AppendLine("# Dev repozitare — $($m.project)")
[void]$sb.AppendLine()
[void]$sb.AppendLine('| App | Kind | Cesta pod `_dev/` | Repozitar | SAP paket | Autosync | Status |')
[void]$sb.AppendLine('|---|---|---|---|---|---|---|')

foreach ($r in $sorted) {
    if ($null -eq $r.repo) {
        $repoCell = '—'
    } else {
        $name = ($r.repo -replace '^https://github\.com/', '' -replace '^git@github\.com:', '' -replace '\.git$', '')
        $repoCell = "[``$name``]($($r.repo))"
    }

    if ($r.PSObject.Properties['sapPackage']) { $pkgCell = "``$($r.sapPackage)``" } else { $pkgCell = '—' }

    if ($r.PSObject.Properties['autosync']) {
        if ($r.autosync) { $syncCell = 'ano' } else { $syncCell = 'ne' }
    } else {
        $syncCell = '—'
    }

    [void]$sb.AppendLine("| $($r.app) | $($r.kind) | ``$($r.path)`` | $repoCell | $pkgCell | $syncCell | ``$($r.status)`` |")
}

[void]$sb.AppendLine()
[void]$sb.AppendLine('## Semantika `status`')
[void]$sb.AppendLine()
[void]$sb.AppendLine('| Status | Vyznam | Chovani `bootstrap.ps1` / `check-drift.ps1` |')
[void]$sb.AppendLine('|---|---|---|')
[void]$sb.AppendLine('| `active` | Probiha vyvoj | klonuje / hlida |')
[void]$sb.AppendLine('| `legacy` | Udrzuje se pro historii, nevyviji se | klonuje / hlida |')
[void]$sb.AppendLine('| `poc` | Proof of concept | klonuje / hlida |')
[void]$sb.AppendLine('| `benchmark` | Experiment nebo mereni | klonuje / hlida |')
[void]$sb.AppendLine('| `scaffold` | Slozka existuje, repo zamerne jeste ne (ceka na FS) | **preskoci** / **nehlasi** |')
[void]$sb.AppendLine('| `unversioned` | Kod existuje, repo chybi a **melo by** existovat | preskoci / **hlasi** |')
[void]$sb.AppendLine()
[void]$sb.AppendLine('## Poznamky k jednotlivym repozitarim')
[void]$sb.AppendLine()
$withNotes = $sorted | Where-Object { $_.PSObject.Properties['note'] }
if ($withNotes) {
    foreach ($r in $withNotes) {
        [void]$sb.AppendLine("- **$($r.app) / $($r.kind)** — $($r.note)")
    }
} else {
    [void]$sb.AppendLine('_Zadne poznamky._')
}
[void]$sb.AppendLine()
[void]$sb.AppendLine('## Jak s tim pracovat')
[void]$sb.AppendLine()
[void]$sb.AppendLine('- Poskladat pracovni prostor (junctiony + doklonovat chybejici repa): `powershell -File scripts\bootstrap.ps1`')
[void]$sb.AppendLine('- Zkontrolovat rozdily manifest vs disk: `powershell -File scripts\check-drift.ps1`')
[void]$sb.AppendLine('- Pridat/zmenit repo: edituj `repos.json`, pak `powershell -File scripts\Generate-ReposMd.ps1`')

$content = $sb.ToString()

if ($PSCmdlet.ShouldProcess($OutputPath, 'Zapsat REPOS.md')) {
    $content | Out-File -LiteralPath $OutputPath -Encoding utf8 -NoNewline
    Write-Host "OK: zapsano $OutputPath ($($sorted.Count) zaznamu)."
} else {
    Write-Host "WhatIf: zapsal bych $OutputPath ($($sorted.Count) zaznamu)."
}
