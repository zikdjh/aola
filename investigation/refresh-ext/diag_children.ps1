# diag_children.ps1 - measure game window + CEF child surface geometry,
# then pulse-resize to force re-layout, then measure again. ASCII-only.
$ErrorActionPreference = "SilentlyContinue"

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class Geo {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int L; public int T; public int R; public int B; }

  public static List<object[]> Tops(uint target) {
    var list = new List<object[]>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == target && IsWindowVisible(h)) {
        var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
        RECT r; GetWindowRect(h, out r);
        list.Add(new object[] { h, sb.ToString(), r.L, r.T, r.R, r.B, GetDpiForWindow(h) });
      }
      return true;
    }, IntPtr.Zero);
    return list;
  }
  public static List<object[]> Kids(IntPtr parent) {
    var list = new List<object[]>();
    EnumChildWindows(parent, delegate(IntPtr h, IntPtr l) {
      var t = new StringBuilder(128); GetWindowText(h, t, 128);
      var c = new StringBuilder(64);  GetClassName(h, c, 64);
      RECT r; GetWindowRect(h, out r);
      list.Add(new object[] { h, t.ToString(), c.ToString(), r.L, r.T, r.R, r.B });
      return true;
    }, IntPtr.Zero);
    return list;
  }
  public static bool Move(IntPtr h, int x, int y, int w, int ht) {
    return MoveWindow(h, x, y, w, ht, true);
  }
}
"@

function Show-Children($parentHwnd, $parentL, $parentT) {
  $kids = [Geo]::Kids($parentHwnd)
  Write-Host ("  children: {0}" -f $kids.Count)
  foreach ($k in $kids) {
    $relX = [int]$k[3] - $parentL; $relY = [int]$k[4] - $parentT
    $w = [int]$k[5] - [int]$k[3]; $ht = [int]$k[6] - [int]$k[4]
    Write-Host ("    class={0} text='{1}' rel=({2},{3}) size={4}x{5}" -f `
      $k[2], $k[1], $relX, $relY, $w, $ht)
  }
}

$targets = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" } |
           Select-Object -ExpandProperty Id
$game = $null
foreach ($tp in $targets) {
  foreach ($w in [Geo]::Tops([uint32]$tp)) {
    if (([string]$w[1]) -like "*5.0.0*") { $game = $w; break }
  }
  if ($game) { break }
}
if (-not $game) { Write-Host "game window not found"; exit 1 }

$hwnd = [IntPtr]$game[0]
$l = [int]$game[2]; $t = [int]$game[3]; $r = [int]$game[4]; $b = [int]$game[5]
Write-Host ("game window: hwnd={0} dpi={1} size={2}x{3} at ({4},{5})" -f `
  $hwnd, $game[6], ($r-$l), ($b-$t), $l, $t)
Write-Host "--- BEFORE pulse ---"
Show-Children $hwnd $l $t

# resize pulse: shrink 6px then restore -> forces CEF re-layout
[void][Geo]::Move($hwnd, $l, $t, ($r-$l-6), ($b-$t))
Start-Sleep -Milliseconds 400
[void][Geo]::Move($hwnd, $l, $t, ($r-$l), ($b-$t))
Start-Sleep -Milliseconds 600

Write-Host "--- AFTER pulse ---"
Show-Children $hwnd $l $t
Write-Host "done"
