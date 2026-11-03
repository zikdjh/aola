# fix_window_now.ps1 - one-shot rescue: move the off-screen game window
# back into view (centered). ASCII-only script.
$ErrorActionPreference = "SilentlyContinue"

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class Rescue {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int L; public int T; public int R; public int B; }

  public static List<object[]> Collect(uint target) {
    var list = new List<object[]>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == target && IsWindowVisible(h)) {
        var sb = new StringBuilder(256);
        GetWindowText(h, sb, 256);
        RECT r; GetWindowRect(h, out r);
        list.Add(new object[] { h, sb.ToString(), r.L, r.T, r.R, r.B });
      }
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@

Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Host ("screen (virtualized): {0}x{1}" -f $screen.Width, $screen.Height)

$targets = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" } |
           Select-Object -ExpandProperty Id
$fixed = 0
foreach ($tp in $targets) {
  foreach ($w in [Rescue]::Collect([uint32]$tp)) {
    $hwnd = $w[0]; $title = [string]$w[1]
    if ($title -notlike "*5.0.0*") { continue }   # game window only
    $l = [int]$w[2]; $t = [int]$w[3]; $r = [int]$w[4]; $b = [int]$w[5]
    $wd = $r - $l; $ht = $b - $t
    $off = ($l -lt -50) -or ($t -lt -50) -or ($r -gt ($screen.Width + 50)) -or ($b -gt ($screen.Height + 50))
    Write-Host ("game window: {0}x{1} at ({2},{3}) offscreen={4}" -f $wd, $ht, $l, $t, $off)
    if ($off) {
      $nx = [Math]::Max(0, [int]((($screen.Width) - $wd) / 2))
      $ny = [Math]::Max(0, [int]((($screen.Height) - $ht) / 2))
      if ([Rescue]::MoveWindow($hwnd, $nx, $ny, $wd, $ht, $true)) {
        Write-Host ("rescued -> ({0},{1})" -f $nx, $ny)
        $fixed++
      } else {
        Write-Host "MoveWindow failed"
      }
    }
  }
}
if ($fixed -eq 0) { Write-Host "nothing to fix (window already on-screen)" }
