# StealthVault 실행 스크립트 (PowerShell)
$cargoPath = "$env:USERPROFILE\.cargo\bin"
$env:PATH = "$cargoPath;$env:PATH"
Set-Location $PSScriptRoot\..

Write-Host "Starting StealthVault..."
npx tauri dev
