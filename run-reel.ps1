param(
	[string]$ScriptPath = '',
	[string]$Title = ''
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$pythonExe = Join-Path $PSScriptRoot '.reels-venv\Scripts\python.exe'
if (-not (Test-Path $pythonExe)) {
	Write-Host '[ERROR] Virtual environment not found at .reels-venv' -ForegroundColor Red
	Write-Host 'Run setup first:'
	Write-Host '  python -m venv .reels-venv'
	Write-Host '  .reels-venv\Scripts\python -m pip install -r requirements.txt'
	exit 1
}

if ([string]::IsNullOrWhiteSpace($ScriptPath)) {
	$ScriptPath = Read-Host 'Script file path (default: scripts\example-script.txt)'
}
if ([string]::IsNullOrWhiteSpace($ScriptPath)) {
	$ScriptPath = 'scripts\example-script.txt'
}

if (-not (Test-Path $ScriptPath)) {
	Write-Host "[ERROR] Script file not found: $ScriptPath" -ForegroundColor Red
	exit 1
}

if ([string]::IsNullOrWhiteSpace($Title)) {
	$Title = Read-Host 'Optional title (press Enter to skip)'
}

$argsList = @(
	'reels_generator.py'
	'--script', $ScriptPath
	'--bg-dir', 'assets\game-clips'
	'--size', '720x1280'
	'--fps', '24'
	'--render-preset', 'ultrafast'
	'--voice-engine', 'pyttsx3'
	'--voice-rate', '180'
)

if (-not [string]::IsNullOrWhiteSpace($Title)) {
	$argsList += @('--title', $Title)
}

Write-Host ''
Write-Host 'Running generator...'
& $pythonExe @argsList
if ($LASTEXITCODE -ne 0) {
	exit $LASTEXITCODE
}

Write-Host ''
Write-Host 'Done. Check the output folder for your reel.'
