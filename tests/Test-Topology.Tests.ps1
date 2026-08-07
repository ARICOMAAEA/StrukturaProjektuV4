$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $here '..\assets\scripts\Test-Topology.ps1'

Describe 'Test-Topology.ps1' {

    # --- fixture: minimalni, ale platny V4 projekt v TEMP ---
    $root   = Join-Path $env:TEMP ("v4gate_" + [guid]::NewGuid().ToString('N').Substring(0,8))
    $devDir = Join-Path $root 'devsrc'
    $assDir = Join-Path $root 'assetsrc'
    $proj   = Join-Path $root 'project'

    New-Item -ItemType Directory -Force -Path $devDir, $assDir, (Join-Path $proj 'scripts'),
        (Join-Path $proj '00_PROJECT_CONTROL\08_DEV'), (Join-Path $devDir 'apps') | Out-Null

    Copy-Item $script (Join-Path $proj 'scripts\Test-Topology.ps1')
    Copy-Item (Join-Path $here '..\assets\scripts\check-drift.ps1') (Join-Path $proj 'scripts\check-drift.ps1')
    Copy-Item (Join-Path $here '..\assets\git\gitignore') (Join-Path $proj '.gitignore')

    $manifest = @{
        project    = 'TEST_projekt'
        devRoot    = $devDir
        assetsRoot = $assDir
        repos      = @()
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText(
        (Join-Path $proj '00_PROJECT_CONTROL\08_DEV\repos.json'), $manifest,
        (New-Object System.Text.UTF8Encoding $true))   # $true = s BOM

    Push-Location $proj
    & git init -b main --quiet 2>$null
    & git -c user.email=t@t -c user.name=t commit --allow-empty -m init --quiet 2>$null
    Pop-Location

    New-Item -ItemType Junction -Path (Join-Path $proj '_dev')    -Target $devDir | Out-Null
    New-Item -ItemType Junction -Path (Join-Path $proj '_assets') -Target $assDir | Out-Null
    New-Item -ItemType Junction -Path (Join-Path $devDir 'CONTEXT') -Target $proj | Out-Null

    $gate = Join-Path $proj 'scripts\Test-Topology.ps1'

    It 'projde na kompletnim projektu bez remote (-NoGitHub)' {
        & powershell -NoProfile -File $gate -NoGitHub | Out-Null
        $LASTEXITCODE | Should Be 0
    }

    It 'selze, kdyz chybi junction _assets' {
        [System.IO.Directory]::Delete((Join-Path $proj '_assets'), $false)
        & powershell -NoProfile -File $gate -NoGitHub | Out-Null
        $LASTEXITCODE | Should Be 1
        New-Item -ItemType Junction -Path (Join-Path $proj '_assets') -Target $assDir | Out-Null
    }

    It 'selze, kdyz .gitignore nepokryva povinny vzor' {
        $gi = Join-Path $proj '.gitignore'
        $orig = Get-Content -LiteralPath $gi -Raw
        Set-Content -LiteralPath $gi -Value ($orig -replace [regex]::Escape('.claude/worktrees/'), '') -Encoding UTF8
        & powershell -NoProfile -File $gate -NoGitHub | Out-Null
        $LASTEXITCODE | Should Be 1
        Set-Content -LiteralPath $gi -Value $orig -Encoding UTF8
    }

    It 'selze, kdyz je v gitu trackovana binarka' {
        Push-Location $proj
        Set-Content -LiteralPath (Join-Path $proj 'x.png') -Value 'x'
        & git add -f x.png 2>$null
        & git -c user.email=t@t -c user.name=t commit -m bin --quiet 2>$null
        Pop-Location
        & powershell -NoProfile -File $gate -NoGitHub | Out-Null
        $LASTEXITCODE | Should Be 1
    }

    # --- uklid: junctiony jen jako link, nikdy ne cil ---
    foreach ($j in @((Join-Path $proj '_dev'), (Join-Path $proj '_assets'), (Join-Path $devDir 'CONTEXT'))) {
        if (Test-Path -LiteralPath $j) { [System.IO.Directory]::Delete($j, $false) }
    }
    Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
}
