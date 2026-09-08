$ErrorActionPreference = 'Stop'
$scannerRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$scannerNode = (Get-Command node -ErrorAction Stop).Source
$scannerUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$scannerTaskName = 'BookSpreadScanner-Background'
$scannerAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-background.ps1`" -NodePath `"$scannerNode`"" -WorkingDirectory $scannerRoot
$scannerLogon = New-ScheduledTaskTrigger -AtLogOn -User $scannerUser
$scannerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$scannerSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$scannerPrincipal = New-ScheduledTaskPrincipal -UserId $scannerUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $scannerTaskName -Action $scannerAction -Trigger @($scannerLogon, $scannerRepeat) -Settings $scannerSettings -Principal $scannerPrincipal -Description 'Book scanner OCR: start at login, recover every minute; logs in project outputs. Requires this user to be logged in.' -Force | Select-Object TaskName,State
Start-ScheduledTask -TaskName $scannerTaskName
