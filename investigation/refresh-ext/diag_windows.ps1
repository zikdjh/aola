# diag_windows.ps1 - enumerate ALL top-level windows of launcher PIDs. ASCII-only.
$ErrorActionPreference = "SilentlyContinue"

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class EnumW {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int L; public int T; public int R; public int B; }

  public static List<object[]> Collect(uint target) {
    var list = new List<object[]>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == target && IsWindowVisible(h) && GetWindowTextLength(h) > 0) {
        var sb = new StringBuilder(256);
        GetWindowText(h, sb, 256);
        RECT r; GetWindowRect(h, out r);
        list.Add(new object[] { h, sb.ToString(), r.L, r.T, r.R, r.B, GetDpiForWindow(h) });
      }
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@

$targets = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" } | Select-Object -ExpandProperty Id
Write-Host ("launcher PIDs: " + ($targets -join ", "))
foreach ($tp in $targets) {
  $wins = [EnumW]::Collect([uint32]$tp)
  foreach ($w in $wins) {
    Write-Host ("PID {0} hwnd={1} dpi={2} size={3}x{4} at ({5},{6}) title='{7}'" -f `
      $tp, $w[0], $w[6], ($w[4]-$w[2]), ($w[5]-$w[3]), $w[2], $w[3], $w[1])
  }
}
