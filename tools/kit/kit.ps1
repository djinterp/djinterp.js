################################################################################
# djinterp.js [tools]                                                    kit.ps1
#
#   The script of a kit of commits, as tools/make_kit.js fills it in for
# each kit: this banner is dropped, the comment after it becomes the
# kit's own head, and each @@NAME@@ is the kit's. The script makes the
# kit's commits again in the owner's repository, a step a commit, and
# checks every tree against the port's own commit's.
#   It keeps to what Windows PowerShell 5.1 has, as djinterp's window
# kits do; it has been run in PowerShell 7.4 on Linux, with git set up as
# on Windows and not.
#
#
# path:      /tools/kit/kit.ps1
# link(s):   TBA
# author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.20
#                                                            revised: 2026.11.20
################################################################################
# djinterp.js, @@NAME@@: the port's commits @@FIRST@@ to @@LAST@@, to main at
# @@HEAD@@, each made again from its own zip, deletions and message, in the
# order they were first made.
# Run it as a file (pwsh -File, or from its own folder): it finds the
# kit's other files beside itself, wherever the kit was unzipped.
#
# ./@@NAME@@.ps1 makes every step the repository lacks; with
#   -Through N    it stops after step N (run it again to go on)
#   -List         it says where the repository stands and what it would
#                 make, and changes nothing
#   -Repo PATH    it works in another repository than the one below
#
@@START@@
# Anything else, changes to tracked files, or a file in the folder that a
# step would write and the repository does not track, and it refuses
# before writing anything. If a check stops it, the commits before stand
# and are correct; git reset -q --hard puts the tracked files back, and
# git clean -n lists new files.
param(
    [string]$Repo = 'D:\sam\code\projects\repos\djinterp\djinterp.js',
    [int]$Through = @@LAST@@,
    [switch]$List
)

$ErrorActionPreference = 'Stop'
$Kit = (Get-Location).Path   # where it was pasted, not run as a file
if ($PSScriptRoot) { $Kit = $PSScriptRoot }
$OnWindows = ($PSVersionTable.PSEdition -ne 'Core') -or $IsWindows
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$First = @@FIRST@@             # the number of the kit's first step
$Before = '@@BEFORE@@'
$Steps = @(
@@STEPS@@
)
$Last = $First + $Steps.Count - 1

function K([string]$Name) { Join-Path (Join-Path $Kit 'steps') $Name }

function GitRun([string[]]$Arguments) {
    # git in the repository; its exit code decides, since Windows
    # PowerShell 5.1 would stop at its first line on stderr. (No function
    # here is named git: PowerShell would call it in place of git itself.)
    $ErrorActionPreference = 'Continue'
    $Out = & git -C $Repo @Arguments 2>&1 | ForEach-Object { "$_" }
    $Code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    [pscustomobject]@{ Code = $Code; Out = @($Out) }
}

function GitDo([string[]]$Arguments) {
    $Result = GitRun $Arguments
    if ($Result.Code -ne 0) {
        throw ("STOP: git $($Arguments -join ' ') failed:`n" +
               ($Result.Out -join "`n"))
    }
    $Result.Out
}

function GitPaths([string[]]$Command, [string[]]$Paths) {
    # a hundred paths at a time, well inside Windows' command line
    for ($At = 0; $At -lt $Paths.Count; $At += 100) {
        $To = [Math]::Min($At + 99, $Paths.Count - 1)
        GitDo ($Command + '--' + $Paths[$At..$To]) | Out-Null
    }
}

function Entries([string]$Zip) {
    $Archive = [System.IO.Compression.ZipFile]::OpenRead($Zip)
    try {
        $Names = @($Archive.Entries | Where-Object { $_.Name -ne '' } |
                   ForEach-Object { $_.FullName })
    } finally { $Archive.Dispose() }
    foreach ($Name in $Names) {
        if ($Name -match '(^|[/\\])\.\.([/\\]|$)' -or
            [System.IO.Path]::IsPathRooted($Name)) {
            throw "STOP: $Zip names $Name, outside the repository."
        }
    }
    $Names
}

function Extract([string]$Zip) {
    $Archive = [System.IO.Compression.ZipFile]::OpenRead($Zip)
    try {
        foreach ($Entry in $Archive.Entries) {
            if ($Entry.Name -eq '') { continue }
            $To = Join-Path $Repo $Entry.FullName
            $Folder = Split-Path -Parent $To
            if (-not (Test-Path -LiteralPath $Folder)) {
                New-Item -ItemType Directory -Path $Folder -Force | Out-Null
            }
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile(
                $Entry, $To, $true)
        }
    } finally { $Archive.Dispose() }
}

function CurrentTree { @(GitDo @('rev-parse', 'HEAD^{tree}'))[0].Trim() }

function Check([string]$Want, [string]$What) {
    $Have = CurrentTree
    if ($Have -ne $Want) {
        throw "STOP after ${What}: the tree is $Have, not $Want."
    }
    Write-Host "ok    $What (tree $($Want.Substring(0, 8)))"
}

# 0. the kit's files, and where the repository stands
if ($Through -lt $First -or $Through -gt $Last) {
    throw "STOP: -Through takes $First to $Last. Nothing was done."
}
foreach ($Step in $Steps) {
    $Want = @(($Step.Name + '.zip'), ('commit_' + $Step.Name + '.txt'))
    if ($Step.Deletions) { $Want += ($Step.Name + '_deletions.txt') }
    foreach ($Name in $Want) {
        if (-not (Test-Path -LiteralPath (K $Name))) {
            throw "STOP: no steps/$Name in $Kit. Nothing was done."
        }
    }
}

$Held = 0            # how many of the kit's steps the repository has
$Fresh = $false      # no repository yet: one is made
$Unborn = $false     # a repository with no commit yet
$NoStart = ("STOP: this kit's first step is $First; it continues a " +
            "repository at step $($First - 1). Nothing was done.")
if (-not (Test-Path -LiteralPath (Join-Path $Repo '.git'))) {
    if ((Test-Path -LiteralPath $Repo) -and
        (Get-ChildItem -Force -LiteralPath $Repo | Select-Object -First 1)) {
        throw "STOP: $Repo has files and no repository. Nothing was done."
    }
    if ($Before -ne '') { throw $NoStart }
    $Fresh = $true
    Write-Host "new   $Repo, a repository on main"
} else {
    if (GitDo @('status', '--porcelain', '--untracked-files=no')) {
        throw 'STOP: tracked files have changes; commit or stash them.'
    }
    $Branch = GitRun @('symbolic-ref', '--short', 'HEAD')
    if ($Branch.Code -ne 0) {
        throw 'STOP: HEAD is detached; check out a branch. Nothing was done.'
    }
    $Head = GitRun @('rev-parse', '-q', '--verify', 'HEAD')
    if ($Head.Code -eq 0) {
        $Have = CurrentTree
        $Held = -1
        if ($Before -ne '' -and $Have -eq $Before) { $Held = 0 }
        for ($Index = 0; $Index -lt $Steps.Count; ++$Index) {
            if ($Steps[$Index].Tree -eq $Have) { $Held = $Index + 1 }
        }
        if ($Held -lt 0) {
            throw ("STOP: HEAD's tree is $Have, the tree of none of steps " +
                   "$($First - 1) to $Last. Nothing was done.")
        }
        $At = $First + $Held - 1
        Write-Host ("ok    the start, $($Branch.Out[0]) at step $At " +
                    "(tree $($Have.Substring(0, 8)))")
    } else {
        if ($Before -ne '') { throw $NoStart }
        $Unborn = $true
        Write-Host "new   $Repo, a repository with no commit: on main"
    }
}
$Until = $Through - $First + 1   # how many of the kit's steps to have

# no file a step writes may be in the folder untracked: refuse before any
$Tracked = @{}
if (-not $Fresh) {
    foreach ($Path in (GitDo @('ls-files'))) { $Tracked[$Path] = $true }
}
$Clash = @()
for ($Index = $Held; $Index -lt $Until; ++$Index) {
    foreach ($Path in (Entries (K ($Steps[$Index].Name + '.zip')))) {
        if (-not $Tracked.ContainsKey($Path) -and
            (Test-Path -LiteralPath (Join-Path $Repo $Path))) {
            $Clash += $Path
        }
    }
}
if ($Clash.Count -gt 0) {
    $Clash = @($Clash | Sort-Object -Unique)
    throw ("STOP: the folder has $($Clash -join ', '), which the kit " +
           'writes and the repository does not track; move them away. ' +
           'Nothing was done.')
}

if ($Held -ge $Until) {
    Write-Host ("done: the repository has step $($First + $Held - 1); " +
                'nothing to make')
    return
}
if ($List) {
    for ($Index = $Held; $Index -lt $Until; ++$Index) {
        Write-Host ("would " + $Steps[$Index].Name)
    }
    Write-Host 'nothing was done (-List)'
    return
}
if ($Fresh) {
    New-Item -ItemType Directory -Path $Repo -Force | Out-Null
    GitDo @('init', '-q') | Out-Null
}
if ($Fresh -or $Unborn) {
    GitDo @('symbolic-ref', 'HEAD', 'refs/heads/main') | Out-Null
}

# 1. each step: its deletions, its files, its message, and its tree
for ($Index = $Held; $Index -lt $Until; ++$Index) {
    $Step = $Steps[$Index]
    $Zip = K ($Step.Name + '.zip')
    $Paths = @(Entries $Zip)
    if ($Step.Deletions) {
        $Doomed = K ($Step.Name + '_deletions.txt')
        $Gone = @(Get-Content -LiteralPath $Doomed |
                  Where-Object { $_ -ne '' })
        GitPaths @('rm', '-q') $Gone
    }
    Extract $Zip
    $Exec = @($Step.Exec)
    if ($Exec.Count -gt 0 -and -not $OnWindows) {
        & chmod +x -- ($Exec | ForEach-Object { Join-Path $Repo $_ })
    }
    GitPaths @('-c', 'core.safecrlf=false', 'add') $Paths
    if ($Exec.Count -gt 0) { GitPaths @('update-index', '--chmod=+x') $Exec }
    GitDo @('commit', '-q', '-F', (K ('commit_' + $Step.Name + '.txt'))) |
        Out-Null
    Check $Step.Tree "step $($First + $Index), $($Step.Name)"
}

if ($Through -lt $Last) {
    Write-Host "stopped after step $Through (-Through); run again to go on"
} else {
    Write-Host 'done; then git push'
}
