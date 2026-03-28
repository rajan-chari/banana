# build.ps1 — Build standalone executables for pty-learner scripts
# Run from: banana/pty-learner/
# Output: bin/pty-browse.exe, bin/pty-train.exe, bin/pty-evaluate.exe, bin/pty-export.exe, bin/pty-agent-review.exe

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$VenvDir = Join-Path $Root "ml\.venv"
$Python = Join-Path $VenvDir "Scripts\python.exe"
$Pip = Join-Path $VenvDir "Scripts\pip.exe"
$PyInstaller = Join-Path $VenvDir "Scripts\pyinstaller.exe"
$BinDir = Join-Path $Root "bin"

# 1. Create venv if not present
if (-not (Test-Path $Python)) {
    Write-Host "Creating virtual environment..."
    python -m venv $VenvDir
}

# 2. Install dependencies
Write-Host "Installing dependencies..."
& $Pip install -r (Join-Path $Root "ml\requirements.txt") --quiet

# 3. Ensure bin/ exists
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

# 4. Build each script
$Scripts = @(
    @{ Name = "pty-browse";        Script = "ml\browse.py" },
    @{ Name = "pty-train";         Script = "ml\train.py" },
    @{ Name = "pty-evaluate";      Script = "ml\evaluate.py" },
    @{ Name = "pty-export";        Script = "ml\export_onnx.py" },
    @{ Name = "pty-agent-review";  Script = "ml\agent_review.py" }
)

foreach ($entry in $Scripts) {
    $name   = $entry.Name
    $script = Join-Path $Root $entry.Script

    Write-Host ""
    Write-Host "Building $name..."
    & $PyInstaller `
        --onedir `
        --name $name `
        --distpath (Join-Path $Root "dist") `
        --workpath (Join-Path $Root "build") `
        --specpath (Join-Path $Root "build") `
        --console `
        --noconfirm `
        $script

    $src = Join-Path $Root "dist\$name\$name.exe"
    $dst = Join-Path $BinDir "$name.exe"
    Copy-Item -Force $src $dst
    Write-Host "  → $dst"
}

Write-Host ""
Write-Host "Done. Executables in bin/:"
Get-ChildItem $BinDir -Filter "*.exe" | ForEach-Object { Write-Host "  $_" }
