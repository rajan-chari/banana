<#
.SYNOPSIS
    Deploy emcom binaries to production (~/.claude/skills/emcom/bin/).
.DESCRIPTION
    Builds AOT binaries, shows version diff, deploys with backup.
    Usage: ./deploy.ps1 [emcom|tracker|server|all]
#>
param(
    [ValidateSet("emcom", "tracker", "server", "all")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$BinDir = "$HOME\.claude\skills\emcom\bin"
$RepoDir = "$PSScriptRoot"

function Deploy-Binary {
    param([string]$Name, [string]$SourcePath, [string]$VersionCmd)

    $dest = Join-Path $BinDir "$Name"
    Write-Host "`n=== Deploying $Name ===" -ForegroundColor Cyan

    # Show current version
    if (Test-Path $dest) {
        Write-Host "Current:" -ForegroundColor Yellow
        & $dest $VersionCmd 2>$null | Write-Host
        $backup = "$dest.bak"
        Copy-Item $dest $backup -Force
        Write-Host "Backed up to $backup"
    } else {
        Write-Host "No existing binary at $dest"
    }

    # Show new version
    if (-not (Test-Path $SourcePath)) {
        Write-Host "ERROR: Source not found: $SourcePath" -ForegroundColor Red
        return $false
    }
    Write-Host "`nNew:" -ForegroundColor Yellow
    & $SourcePath $VersionCmd 2>$null | Write-Host

    # Deploy
    Copy-Item $SourcePath $dest -Force
    Write-Host "`nDeployed. Verifying:" -ForegroundColor Green
    & $dest $VersionCmd 2>$null | Write-Host
    return $true
}

# Build paths
$emcomPublish = "$RepoDir\emcomcs\bin\Release\net10.0\win-x64\publish\emcom.exe"
$trackerPublish = "$RepoDir\trackercs\bin\Release\net10.0\win-x64\publish\tracker.exe"
$serverDist = "$RepoDir\dist\emcom-server.exe"

switch ($Target) {
    "emcom" {
        Deploy-Binary "emcom.exe" $emcomPublish "version"
    }
    "tracker" {
        Deploy-Binary "tracker.exe" $trackerPublish "version"
    }
    "server" {
        # Check if server is running
        $procs = Get-Process -Name "emcom-server" -ErrorAction SilentlyContinue
        if ($procs) {
            Write-Host "WARNING: emcom-server is running (PID: $($procs.Id -join ', '))" -ForegroundColor Red
            $confirm = Read-Host "Kill and deploy? (y/n)"
            if ($confirm -ne "y") { Write-Host "Aborted."; return }
            $procs | Stop-Process -Force
            Start-Sleep -Seconds 1
        }
        Deploy-Binary "emcom-server.exe" $serverDist "version"
    }
    "all" {
        Deploy-Binary "emcom.exe" $emcomPublish "version"
        Deploy-Binary "tracker.exe" $trackerPublish "version"

        $procs = Get-Process -Name "emcom-server" -ErrorAction SilentlyContinue
        if ($procs) {
            Write-Host "`nWARNING: emcom-server is running (PID: $($procs.Id -join ', '))" -ForegroundColor Red
            $confirm = Read-Host "Kill and deploy server? (y/n)"
            if ($confirm -ne "y") { Write-Host "Skipping server."; return }
            $procs | Stop-Process -Force
            Start-Sleep -Seconds 1
        }
        Deploy-Binary "emcom-server.exe" $serverDist "version"
    }
}

Write-Host "`nDone." -ForegroundColor Green
