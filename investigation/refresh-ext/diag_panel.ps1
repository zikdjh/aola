# diag_panel.ps1 - enumerate child controls of the launcher panel window
# to discover built-in resolution/window settings. ASCII-only output.
$ErrorActionPreference = "SilentlyContinue"

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class ChildW {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int L; public int T; public int R; public int B; }

  public static List<object[]> Collect(IntPtr parent) {
    var list = new List<object[]>();
    EnumChildWindows(parent, delegate(IntPtr h, IntPtr l) {
      var sb = new StringBuilder(128);
      GetWindowText(h, sb, 128);
      var cn = new StringBuilder(64);
      GetClassName(h, cn, 64);
      RECT r; GetWindowRect(h, out r);
      list.Add(new object[] { h, sb.ToString(), cn.ToString(), r.R-r.L, r.B-r.T });
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@

$main = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" -and -not [string]::IsNullOrEmpty($_.MainWindowTitle) } |
        Select-Object -First 1
if (-not $main) { Write-Host "launcher main not found"; exit }
Write-Host ("main PID {0} hwnd {1} title '{2}'" -f $main.Id, $main.MainWindowHandle, $main.MainWindowTitle)

# children of BOTH top-level windows (panel + game window)
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class TopW {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
"@
$targets = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" } | Select-Object -ExpandProperty Id
$seen = @{}
foreach ($tp in $targets) {
  [TopW]::EnumWindows({ param($h, $l)
    $pid = 0
    [void][TopW]::GetWindowThreadProcessId($h, [ref]$pid)
    if ($targets -contains [int]$pid -and [TopW]::IsWindowVisible($h) -and -not $seen.ContainsKey($h)) {
      $seen[$h] = $true
      $kids = [ChildW]::Collect($h)
      if ($kids.Count -gt 0) {
        Write-Host ("--- top-level hwnd {0} children: {1}" -f $h, $kids.Count)
        foreach ($k in $kids) {
          $txt = [string]$k[1]
          if ($txt.Length -gt 0) { Write-Host ("  [{0}] '{1}' {2}x{3}" -f $k[2], $txt, $k[3], $k[4]) }
        }
      }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
}
Write-Host "done"
