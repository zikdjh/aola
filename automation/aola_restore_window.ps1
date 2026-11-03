param([int]$TargetPid = 26060)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinRestore {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
}
"@

# Find the window by title
$hwnd = [WinRestore]::FindWindow($null, "aola-ruffle-battle")
if ($hwnd -eq [IntPtr]::Zero) {
  Write-Host "window not found by title"
  exit 1
}
Write-Host "found hwnd: $hwnd"
Write-Host "is minimized: $([WinRestore]::IsIconic($hwnd))"

# Restore (SW_RESTORE = 9)
[WinRestore]::ShowWindow($hwnd, 9) | Out-Null
Start-Sleep -Milliseconds 500
# Move to visible position and resize
[WinRestore]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, 1200, 800, 0x0040) | Out-Null
Start-Sleep -Milliseconds 500
[WinRestore]::SetForegroundWindow($hwnd) | Out-Null
Write-Host "restored and foregrounded"
