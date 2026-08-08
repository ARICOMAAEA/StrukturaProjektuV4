<#
.SYNOPSIS
    Poskladá pracovní prostor projektu: junctiony _dev / _assets / CONTEXT + doklonuje chybejici dev repa.
.DESCRIPTION
    Idempotentni. Spustitelny opakovane i ve git worktree (junctiony jsou gitignored,
    takze v novem worktree chybi — tento skript je doplni).

    BEZPECNOSTNI ZARUKY:
      - nikdy nic nemaze
      - nikdy neprepisuje junction, ktery miri jinam (jen nahlasi)
      - nikdy nemeni git remote existujiciho repa (jen nahlasi nesoulad)
      - nikdy nepushuje
.PARAMETER ManifestPath
    Cesta k repos.json. Default: ..\00_PROJECT_CONTROL\08_DEV\repos.json relativne ke skriptu.
.PARAMETER SkipClone
    Vytvori jen junctiony, preskoci klonovani repozitaru.
.EXAMPLE
    powershell -File scripts\bootstrap.ps1 -WhatIf
.EXAMPLE
    powershell -File scripts\bootstrap.ps1
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$ManifestPath,
    [switch]$SkipClone
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ManifestPath) { $ManifestPath = Join-Path $repoRoot '00_PROJECT_CONTROL\08_DEV\repos.json' }
if (-not (Test-Path -LiteralPath $ManifestPath)) { throw "Manifest neexistuje: $ManifestPath" }

$m = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json

$script:warnings = 0

function Write-Warn {
    param([string]$Message)
    Write-Host "  VAROVANI: $Message" -ForegroundColor Yellow
    $script:warnings++
}

<#
    Zajisti junction na $LinkPath mirici na $TargetPath.
    Chovani:
      - neexistuje         -> vytvori
      - existuje, spravny  -> nedela nic
      - existuje, jiny cil -> NEPREPISUJE, jen nahlasi (NESOUHLASI)
      - existuje jako realna slozka/soubor -> NEPREPISUJE, jen nahlasi
#>
function Set-JunctionSafely {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory)][string]$LinkPath,
        [Parameter(Mandatory)][string]$TargetPath,
        [Parameter(Mandatory)][string]$Label
    )

    $target = $TargetPath.TrimEnd('\')

    if (-not (Test-Path -LiteralPath $target)) {
        Write-Warn "$Label — cil neexistuje, junction nevytvoren: $target"
        return
    }

    if (Test-Path -LiteralPath $LinkPath) {
        $item = Get-Item -LiteralPath $LinkPath -Force
        $isReparse = [bool]($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)

        if (-not $isReparse) {
            Write-Warn "$Label — na ceste je REALNA slozka/soubor, ne junction. Nechavam bez zmeny: $LinkPath"
            return
        }

        $current = $item.Target
        if ($current -is [array]) { $current = $current[0] }
        $current = "$current".TrimEnd('\')

        if ($current -eq $target) {
            Write-Host "  OK: $Label jiz miri spravne."
            return
        }

        Write-Warn "$Label — junction ma JINY cil (NESOUHLASI). Nechavam bez zmeny."
        Write-Host  "           soucasny:  $current"
        Write-Host  "           ocekavany: $target"
        return
    }

    if ($PSCmdlet.ShouldProcess($LinkPath, "Vytvorit junction -> $target")) {
        New-Item -ItemType Junction -Path $LinkPath -Target $target | Out-Null
        Write-Host "  VYTVORENO: $Label -> $target" -ForegroundColor Green
    } else {
        Write-Host "  WhatIf: vytvoril bych $Label -> $target"
    }
}

Write-Host ''
Write-Host "bootstrap — projekt $($m.project)" -ForegroundColor Cyan
Write-Host "  repo root: $repoRoot"
Write-Host ''

# --- 1) junctiony v projektovem repu (funguje i ve worktree) ---
Write-Host 'Junctiony v projektovem repu:'
Set-JunctionSafely -LinkPath (Join-Path $repoRoot '_dev')    -TargetPath $m.devRoot    -Label '_dev'
Set-JunctionSafely -LinkPath (Join-Path $repoRoot '_assets') -TargetPath $m.assetsRoot -Label '_assets'

# --- 2) reverzni CONTEXT junction v execution vrstve ---
Write-Host ''
Write-Host 'Reverzni junction v execution vrstve:'
Set-JunctionSafely -LinkPath (Join-Path $m.devRoot 'CONTEXT') -TargetPath $repoRoot -Label 'CONTEXT'

# --- 3) doklonovani chybejicich repozitaru ---
if ($SkipClone) {
    Write-Host ''
    Write-Host 'Klonovani preskoceno (-SkipClone).'
} else {
    Write-Host ''
    Write-Host 'Dev repozitare:'
    foreach ($r in $m.repos) {
        $label = "$($r.app)/$($r.kind)"

        if ($r.status -eq 'scaffold') {
            Write-Host "  PRESKOCENO: $label — status=scaffold (repo zamerne neexistuje)."
            continue
        }
        if ($null -eq $r.repo) {
            Write-Warn "$label — repo=null, ale status=$($r.status). Doplnit URL do manifestu."
            continue
        }

        $full = Join-Path $m.devRoot $r.path

        if (Test-Path -LiteralPath (Join-Path $full '.git')) {
            # existuje -> jen overit remote, NIKDY nemenit
            $actual = (& git -C $full remote get-url origin 2>$null)
            if (-not $actual) {
                Write-Warn "$label — repo bez remote 'origin': $($r.path)"
                continue
            }
            $normalize = {
                param($u)
                ($u -replace '^git@github\.com:', 'https://github.com/' -replace '\.git$', '').TrimEnd('/')
            }
            if ((& $normalize $actual.Trim()) -ne (& $normalize $r.repo)) {
                Write-Warn "$label — remote NESOUHLASI s manifestem. Nechavam bez zmeny."
                Write-Host  "           disk:     $($actual.Trim())"
                Write-Host  "           manifest: $($r.repo)"
            } else {
                Write-Host "  OK: $label jiz naklonovano, remote souhlasi."
            }
            continue
        }

        if (Test-Path -LiteralPath $full) {
            $hasContent = @(Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue).Count -gt 0
            if ($hasContent) {
                Write-Warn "$label — slozka existuje a NENI prazdna, ale neni to git repo. Neklonuji: $($r.path)"
                continue
            }
        }

        if ($r.PSObject.Properties['branch']) { $branch = $r.branch } else { $branch = 'main' }

        if ($PSCmdlet.ShouldProcess($full, "git clone $($r.repo) -b $branch")) {
            $parent = Split-Path -Parent $full
            if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
            Write-Host "  KLONUJI: $label -> $($r.path)" -ForegroundColor Green
            & git clone --branch $branch $r.repo $full
            if ($LASTEXITCODE -ne 0) { Write-Warn "$label — git clone selhal (exit $LASTEXITCODE)." }
        } else {
            Write-Host "  WhatIf: naklonoval bych $label -> $($r.path)"
        }
    }
}

Write-Host ''
if ($script:warnings -gt 0) {
    Write-Host "bootstrap dokoncen s $($script:warnings) varovanimi. Nic nebylo prepsano ani smazano." -ForegroundColor Yellow
} else {
    Write-Host 'bootstrap dokoncen bez varovani.' -ForegroundColor Green
}
