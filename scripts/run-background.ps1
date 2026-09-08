param([string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
$scannerRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $scannerRoot
try {
    # Give Node its own hidden process, independent of the launcher's console.
    $scannerProcess = Start-Process -FilePath $NodePath -ArgumentList "`"$PSScriptRoot\background.mjs`"" -WorkingDirectory $scannerRoot -WindowStyle Hidden -PassThru
    $scannerProcess.WaitForExit()
    exit $scannerProcess.ExitCode
} finally { Pop-Location }
