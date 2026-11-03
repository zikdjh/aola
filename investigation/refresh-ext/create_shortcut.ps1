# create_shortcut.ps1 - create a desktop shortcut for the launcher
# with the AolaSmartRefresh extension preloaded. ASCII-only script.
$ErrorActionPreference = "Stop"

# resolve the launcher exe without typing its Chinese folder name
$exe = Get-ChildItem "E:\BaiduNetdiskDownload\ao\*\*v5.0.0.13.exe" -File | Select-Object -First 1
if (-not $exe) {
  Write-Host "ERROR: launcher exe not found under E:\BaiduNetdiskDownload\ao\"
  exit 1
}

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "AolaMyLauncher-SmartRefresh.lnk"
$extDir  = "D:\temp\ZCode\aola\refresh-ext\ext"

if (-not (Test-Path (Join-Path $extDir "manifest.json"))) {
  Write-Host "ERROR: extension files missing at $extDir"
  exit 1
}

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnkPath)
$sc.TargetPath       = $exe.FullName
$sc.Arguments        = "--load-extension=" + $extDir + " --remote-debugging-port=9222"
$sc.WorkingDirectory = $exe.DirectoryName
$sc.IconLocation     = $exe.FullName + ",0"
$sc.Description      = "Aola launcher + AolaSmartRefresh extension"
$sc.Save()

Write-Host ("created : " + $lnkPath)
Write-Host ("target  : " + $exe.FullName)
Write-Host ("args    : " + $sc.Arguments)
