# apply_dpi_fix.ps1 - force the launcher DPI-aware via AppCompatFlags
# (fixes browser-surface misalignment on >100% display scaling).
# Reversible: run with -Revert to remove. ASCII-only script.
param([switch]$Revert)
$ErrorActionPreference = "Stop"

$exe = Get-ChildItem "E:\BaiduNetdiskDownload\ao\*\*v5.0.0.13.exe" -File | Select-Object -First 1
if (-not $exe) { Write-Host "launcher exe not found"; exit 1 }

$key = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"
if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }

if ($Revert) {
  Remove-ItemProperty -Path $key -Name $exe.FullName -ErrorAction SilentlyContinue
  Write-Host ("REVERTED DPI flag for: " + $exe.FullName)
} else {
  New-ItemProperty -Path $key -Name $exe.FullName -PropertyType String -Value "~ HIGHDPIAWARE" -Force | Out-Null
  Write-Host ("APPLIED '~ HIGHDPIAWARE' to: " + $exe.FullName)
}

Write-Host "--- current Layers entries ---"
$props = Get-ItemProperty -Path $key
$props.PSObject.Properties | Where-Object { $_.Name -notlike "PS*" } |
  ForEach-Object { Write-Host ("{0} = {1}" -f $_.Name, $_.Value) }
