# diag_screen.ps1 - diagnose launcher window size / DPI state. ASCII-only.
$ErrorActionPreference = "SilentlyContinue"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class W {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int L; public int T; public int R; public int B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
}
"@

Write-Host "=== launcher windows ==="
$procs = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" }
if (-not $procs) { Write-Host "launcher NOT running" }
foreach ($p in $procs) {
  $info = "PID {0} role={1}" -f $p.Id, $(if ([string]::IsNullOrEmpty($p.MainWindowTitle)) {"child"} else {"MAIN"})
  if ($p.MainWindowHandle -ne 0) {
    $r = New-Object "W+RECT"
    [void][W]::GetWindowRect($p.MainWindowHandle, [ref]$r)
    $dpi = [W]::GetDpiForWindow($p.MainWindowHandle)
    $info += " title='{0}' rect=({1},{2})-({3},{4}) size={5}x{6} dpi={7}" -f `
      $p.MainWindowTitle, $r.L, $r.T, $r.R, $r.B, ($r.R - $r.L), ($r.B - $r.T), $dpi
  }
  Write-Host $info
}

Write-Host "=== screens ==="
Add-Type -AssemblyName System.Windows.Forms
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  Write-Host ("{0} bounds={1} primary={2}" -f $s.DeviceName, $s.Bounds, $s.Primary)
}

Add-Type -AssemblyName System.Drawing
$g = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
Write-Host ("system DPI: {0} (scale {1}%)" -f $g.DpiX, [math]::Round($g.DpiX / 96 * 100))
$g.Dispose()

Write-Host "=== extension status (from agent log) ==="
$alog = "D:\temp\ZCode\aola\refresh-ext\agent_log.txt"
if (Test-Path $alog) {
  Get-Content $alog | Select-String "EXT-ALIVE|RELOAD|SELFTEST" | Select-Object -Last 5
} else { Write-Host "no agent log" }
