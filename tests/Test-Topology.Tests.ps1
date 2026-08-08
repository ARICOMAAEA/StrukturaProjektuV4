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

    It 'selze cistě (FAIL radek + GATE NEPROSEL, zadny stack trace), kdyz repoRoot neni git repo' {
        # --- samostatna fixtura: platny V4 projekt, ale ZAMERNE bez `git init` ---
        $ngRoot  = Join-Path $env:TEMP ("v4gate_nogit_" + [guid]::NewGuid().ToString('N').Substring(0,8))
        $ngDev   = Join-Path $ngRoot 'devsrc'
        $ngAss   = Join-Path $ngRoot 'assetsrc'
        $ngProj  = Join-Path $ngRoot 'project'

        New-Item -ItemType Directory -Force -Path $ngDev, $ngAss, (Join-Path $ngProj 'scripts'),
            (Join-Path $ngProj '00_PROJECT_CONTROL\08_DEV'), (Join-Path $ngDev 'apps') | Out-Null

        Copy-Item $script (Join-Path $ngProj 'scripts\Test-Topology.ps1')
        Copy-Item (Join-Path $here '..\assets\scripts\check-drift.ps1') (Join-Path $ngProj 'scripts\check-drift.ps1')
        Copy-Item (Join-Path $here '..\assets\git\gitignore') (Join-Path $ngProj '.gitignore')

        $ngManifest = @{
            project    = 'TEST_projekt_nogit'
            devRoot    = $ngDev
            assetsRoot = $ngAss
            repos      = @()
        } | ConvertTo-Json -Depth 5
        [System.IO.File]::WriteAllText(
            (Join-Path $ngProj '00_PROJECT_CONTROL\08_DEV\repos.json'), $ngManifest,
            (New-Object System.Text.UTF8Encoding $true))

        # ZAMERNE zadny `git init` — $ngProj neni git repozitar.

        New-Item -ItemType Junction -Path (Join-Path $ngProj '_dev')    -Target $ngDev  | Out-Null
        New-Item -ItemType Junction -Path (Join-Path $ngProj '_assets') -Target $ngAss  | Out-Null
        New-Item -ItemType Junction -Path (Join-Path $ngDev 'CONTEXT')  -Target $ngProj | Out-Null

        $ngGate = Join-Path $ngProj 'scripts\Test-Topology.ps1'
        # -ExpectedRemote (bez -NoGitHub), aby se kontrola 8 skutecne vyhodnotila
        # (bez zadaneho remote by se jinak preskocila jako SKIP a "neni git repo"
        # by se vubec neprojevilo na vysledku).
        $output = & powershell -NoProfile -File $ngGate -ExpectedRemote 'test-org/test-repo' 2>&1 | Out-String
        $exitCode = $LASTEXITCODE

        foreach ($j in @((Join-Path $ngProj '_dev'), (Join-Path $ngProj '_assets'), (Join-Path $ngDev 'CONTEXT'))) {
            if (Test-Path -LiteralPath $j) { [System.IO.Directory]::Delete($j, $false) }
        }
        Remove-Item -Recurse -Force $ngRoot -ErrorAction SilentlyContinue

        $exitCode | Should Be 1
        $output | Should Match 'HEALTH-CHECK'
        $output | Should Match 'GATE NEPROSEL'
    }

    # --- uklid: junctiony jen jako link, nikdy ne cil ---
    foreach ($j in @((Join-Path $proj '_dev'), (Join-Path $proj '_assets'), (Join-Path $devDir 'CONTEXT'))) {
        if (Test-Path -LiteralPath $j) { [System.IO.Directory]::Delete($j, $false) }
    }
    Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
}

Describe 'Generate-ReposMd.ps1' {

    # Kazdy cerstve vygenerovany V4 projekt zacina s prazdnym repos.json (repos: []).
    # Sort-Object nad prazdnym polem vraci $null (ne prazdne pole), a nasledne
    # $sorted.Count pod Set-StrictMode -Version Latest hodi vyjimku — skript
    # tedy bez @(...) obalky selze na UPLNE KAZDEM cerstve zalozenem projektu.
    $genScript = Join-Path $here '..\assets\scripts\Generate-ReposMd.ps1'
    $genRoot   = Join-Path $env:TEMP ("v4gen_" + [guid]::NewGuid().ToString('N').Substring(0,8))
    $genDevCtl = Join-Path $genRoot '00_PROJECT_CONTROL\08_DEV'
    New-Item -ItemType Directory -Force -Path $genDevCtl, (Join-Path $genRoot 'scripts') | Out-Null
    Copy-Item $genScript (Join-Path $genRoot 'scripts\Generate-ReposMd.ps1')

    $emptyManifest = @{
        project    = 'TEST_prazdny_manifest'
        devRoot    = $genRoot
        assetsRoot = $genRoot
        repos      = @()
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText(
        (Join-Path $genDevCtl 'repos.json'), $emptyManifest,
        (New-Object System.Text.UTF8Encoding $true))

    It 'bezi s exit 0 na manifestu s prazdnym repos: []' {
        $genGate = Join-Path $genRoot 'scripts\Generate-ReposMd.ps1'
        & powershell -NoProfile -File $genGate -ManifestPath (Join-Path $genDevCtl 'repos.json') -OutputPath (Join-Path $genDevCtl 'REPOS.md') 2>&1 | Out-Null
        $LASTEXITCODE | Should Be 0
        Test-Path -LiteralPath (Join-Path $genDevCtl 'REPOS.md') | Should Be $true
    }

    Remove-Item -Recurse -Force $genRoot -ErrorAction SilentlyContinue
}
