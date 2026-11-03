param()
Add-Type -AssemblyName Microsoft.VisualBasic
$ego = Get-Process | Where-Object { $_.MainWindowTitle -match "Aola P0" -or ($_.MainWindowTitle -match "ego" -and $_.MainWindowLength -gt 0) } | Select-Object -First 1
if (-not $ego) {
  # Try finding by window title containing our page title
  Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinEnum {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
  public static IntPtr Found;
  public static bool Cb(IntPtr h, IntPtr lp) {
    if (!IsWindowVisible(h)) return true;
    var sb = new StringBuilder(256);
    GetWindowText(h, sb, 256);
    if (sb.ToString().Contains("Aola P0")) { Found = h; return false; }
    return true;
  }
}
"@
  [WinEnum]::EnumWindows([WinEnum+EnumWindowsProc]{ param($h,$lp) [WinEnum]::Cb($h,$lp) }, [IntPtr]::Zero) | Out-Null
  if ([WinEnum]::Found -ne [IntPtr]::Zero) {
    [Microsoft.VisualBasic.Interaction]::AppActivate([WinEnum]::Found)
    Write-Host "activated by window handle"
  } else {
    Write-Host "no Aola P0 window found"
  }
} else {
  [Microsoft.VisualBasic.Interaction]::AppActivate($ego.Id)
  Write-Host "activated PID $($ego.Id): $($ego.MainWindowTitle)"
}
