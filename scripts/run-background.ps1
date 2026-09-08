param([string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
$scannerRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $scannerRoot
try {
    & $NodePath (Join-Path $PSScriptRoot 'background.mjs')
    exit $LASTEXITCODE
} finally { Pop-Location }
