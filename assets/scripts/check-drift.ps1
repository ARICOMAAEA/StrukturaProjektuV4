<#
.SYNOPSIS
    Hlida rozpad mezi manifestem repos.json a skutecnosti na disku.
.DESCRIPTION
    Read-only vuci repozitarum. Hlasi tri druhy driftu:
      1. repo na disku, ktere neni v manifestu
      2. zaznam v manifestu (status != scaffold), ktery na disku chybi
      3. .md soubory v assetsRoot (binarni mirror nema obsahovat text)
    Exit code: 0 = bez driftu, 1 = drift nalezen.
.PARAMETER ManifestPath
    Cesta k repos.json. Default: ..\00_PROJECT_CONTROL\08_DEV\repos.json relativne ke skriptu.
.PARAMETER UpdateStale
    Zapise vysledek jako sekci do STALE.md v korenu repa.
.EXAMPLE
    powershell -File scripts\check-drift.ps1
.EXAMPLE
    powershell -File scripts\check-drift.ps1 -UpdateStale
#>
[CmdletBinding()]
param(
    [string]$ManifestPath,
    [switch]$UpdateStale
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ManifestPath) { $ManifestPath = Join-Path $repoRoot '00_PROJECT_CONTROL\08_DEV\repos.json' }
if (-not (Test-Path -LiteralPath $ManifestPath)) { throw "Manifest neexistuje: $ManifestPath" }

$m = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$findings = @()

# --- 1) repa na disku, ktera nejsou v manifestu ---
$appsRoot = Join-Path $m.devRoot 'apps'
if (Test-Path -LiteralPath $appsRoot) {
    $inManifest = @($m.repos | ForEach-Object { $_.path })
    $onDisk = Get-ChildItem -LiteralPath $appsRoot -Recurse -Depth 3 -Directory -Filter '.git' -Force -ErrorAction SilentlyContinue |
        ForEach-Object { $_.Parent.FullName.Substring($m.devRoot.Length + 1).Replace('\', '/') }
    foreach ($d in $onDisk) {
        if ($inManifest -notcontains $d) {
            $findings += [pscustomobject]@{ Typ = 'NEEVIDOVANE_REPO'; Detail = $d; Akce = 'Pridat do repos.json nebo smazat z disku.' }
        }
    }
} else {
    $findings += [pscustomobject]@{ Typ = 'CHYBI_APPS'; Detail = $appsRoot; Akce = 'Zkontroluj devRoot v manifestu a junction _dev.' }
}

# --- 2) zaznamy v manifestu, ktere na disku chybi ---
foreach ($r in $m.repos) {
    if ($r.status -eq 'scaffold') { continue }
    $full = Join-Path $m.devRoot $r.path
    if (-not (Test-Path -LiteralPath $full)) {
        $findings += [pscustomobject]@{ Typ = 'CHYBI_NA_DISKU'; Detail = "$($r.app)/$($r.kind) -> $($r.path)"; Akce = 'Spustit bootstrap.ps1, nebo opravit path v manifestu.' }
    } elseif ($null -ne $r.repo -and -not (Test-Path -LiteralPath (Join-Path $full '.git'))) {
        $findings += [pscustomobject]@{ Typ = 'NENI_GIT_REPO'; Detail = "$($r.app)/$($r.kind) -> $($r.path)"; Akce = 'Slozka existuje, ale neni git repo. Overit rucne.' }
    }
}

# --- 3) .md v binarnim mirroru ---
if (Test-Path -LiteralPath $m.assetsRoot) {
    $strayMd = Get-ChildItem -LiteralPath $m.assetsRoot -Recurse -File -Filter '*.md' -Force -ErrorAction SilentlyContinue
    foreach ($f in $strayMd) {
        $rel = $f.FullName.Substring($m.assetsRoot.Length).TrimStart('\')
        $findings += [pscustomobject]@{ Typ = 'MD_V_MIRRORU'; Detail = $rel; Akce = 'Binarni mirror nema obsahovat .md — presunout do gitu.' }
    }
} else {
    $findings += [pscustomobject]@{ Typ = 'CHYBI_ASSETSROOT'; Detail = $m.assetsRoot; Akce = 'Zkontroluj assetsRoot v manifestu a OneDrive sync.' }
}

# --- vystup ---
Write-Host ''
Write-Host "check-drift — projekt $($m.project)" -ForegroundColor Cyan
if ($findings.Count -eq 0) {
    Write-Host 'OK: zadny drift. Manifest odpovida disku.' -ForegroundColor Green
} else {
    Write-Host "NALEZENO $($findings.Count) rozdilu:" -ForegroundColor Yellow
    $findings | Format-Table -AutoSize Typ, Detail, Akce
}

# --- zapis do STALE.md ---
if ($UpdateStale) {
    $stalePath = Join-Path $repoRoot 'STALE.md'
    $marker    = '<!-- REPO-DRIFT:START -->'
    $endMarker = '<!-- REPO-DRIFT:END -->'

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine($marker)
    [void]$sb.AppendLine()
    [void]$sb.AppendLine('## Repo drift (generovano `scripts/check-drift.ps1`)')
    [void]$sb.AppendLine()
    if ($findings.Count -eq 0) {
        [void]$sb.AppendLine('Zadny drift.')
    } else {
        [void]$sb.AppendLine('| Typ | Detail | Akce |')
        [void]$sb.AppendLine('|---|---|---|')
        foreach ($f in $findings) { [void]$sb.AppendLine("| ``$($f.Typ)`` | ``$($f.Detail)`` | $($f.Akce) |") }
    }
    [void]$sb.AppendLine()
    [void]$sb.AppendLine($endMarker)
    $section = $sb.ToString()

    if (Test-Path -LiteralPath $stalePath) {
        # POZOR (PS 5.1 gotcha): bez explicitniho -Encoding UTF8 Get-Content -Raw
        # na souboru BEZ BOM cte diakritiku jako systemovou codepage a pri zpetnem
        # zapisu ji nenavratne poskodi (mojibake). Viz i Generate-ReposMd.ps1.
        $existing = Get-Content -LiteralPath $stalePath -Raw -Encoding UTF8
        if ($existing -match [regex]::Escape($marker)) {
            $pattern = [regex]::Escape($marker) + '.*?' + [regex]::Escape($endMarker)
            $updated = [regex]::Replace($existing, $pattern, $section.TrimEnd(), [System.Text.RegularExpressions.RegexOptions]::Singleline)
        } else {
            $updated = $existing.TrimEnd() + "`r`n`r`n" + $section
        }
    } else {
        $updated = $section
    }
    # UTF-8 bez BOM, aby se zachoval puvodni format souboru (viz git-committed STALE.md).
    [System.IO.File]::WriteAllText($stalePath, $updated, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Zapsano do $stalePath"
}

if ($findings.Count -gt 0) { exit 1 }
exit 0
