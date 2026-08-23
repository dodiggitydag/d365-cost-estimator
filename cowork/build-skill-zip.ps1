# Builds the shareable Copilot Cowork skill zip.
# Output: cowork\dist\d365-cost-estimate.zip
# Upload it in Cowork: Customize > Skills > Add > Upload skill, then Share.

$ErrorActionPreference = 'Stop'

$coworkDir = $PSScriptRoot
$repoRoot  = Split-Path $coworkDir -Parent
$skillDir  = Join-Path $coworkDir 'skills\d365-cost-estimate'
$distDir   = Join-Path $coworkDir 'dist'
$zipPath   = Join-Path $distDir 'd365-cost-estimate.zip'

# Bundle the current estimator build as a companion file (must stay under 5 MB).
$estimator = Join-Path $repoRoot 'estimator.html'
if (-not (Test-Path $estimator)) { throw "estimator.html not found at $estimator" }
$sizeMB = (Get-Item $estimator).Length / 1MB
if ($sizeMB -gt 5) { throw ("estimator.html is {0:N1} MB - exceeds the 5 MB companion-file limit" -f $sizeMB) }
Copy-Item $estimator (Join-Path $skillDir 'estimator.html') -Force

New-Item -ItemType Directory -Force $distDir | Out-Null
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Zip the skill folder itself (so the zip root contains d365-cost-estimate\SKILL.md).
Compress-Archive -Path $skillDir -DestinationPath $zipPath

$zipMB = (Get-Item $zipPath).Length / 1MB
Write-Host ("Built {0} ({1:N1} MB)" -f $zipPath, $zipMB)
Write-Host 'Upload in Cowork: Customize > Skills > Add > Upload skill. Then Share > Specific users.'
