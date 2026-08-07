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
        $missing = @(@('project', 'devRoot', 'assetsRoot', 'repos') |
            Where-Object { -not $manifest.PSObject.Properties[$_] })
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
    $originUrl = if ($isRepo) { try { (& git remote get-url origin 2>$null) } catch { $null } } else { $null }
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
