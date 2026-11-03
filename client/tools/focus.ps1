# focus.ps1 - bring a process's main window to the foreground
param([int]$TargetPid)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
}
"@
$p = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
if ($p -and $p.MainWindowHandle -ne 0) {
  if ([Win]::IsIconic($p.MainWindowHandle)) { [Win]::ShowWindow($p.MainWindowHandle, 9) | Out-Null }  # SW_RESTORE
  [Win]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Write-Host ("focused pid=" + $TargetPid + " title=" + $p.MainWindowTitle)
} else {
  Write-Host ("no window for pid=" + $TargetPid)
}
