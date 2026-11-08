// focus_game.ps1 — 把奥拉星游戏窗口置前并保持（可复用）
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class GW {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
$chromePids = (Get-Process chrome -ErrorAction SilentlyContinue).Id
$script:games = @()
$cb = [GW+EnumProc]{ param($h, $p)
  $pid2 = 0; [GW]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
  if ($chromePids -contains $pid2) {
    $t = New-Object System.Text.StringBuilder 512; [GW]::GetWindowTextW($h, $t, 512) | Out-Null
    $c = New-Object System.Text.StringBuilder 256; [GW]::GetClassNameW($h, $c, 256) | Out-Null
    if ($t.ToString() -match 'Aola' -and $c.ToString() -match 'Chrome_WidgetWin_1') {
      $r = New-Object GW+RECT; [GW]::GetWindowRect($h, [ref]$r) | Out-Null
      $script:games += [pscustomobject]@{ H=$h; Pid=$pid2; Title=$t.ToString(); W=$r.R-$r.L; Hh=$r.B-$r.T }
    }
  }; return $true }
[GW]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if (-not $script:games.Count) { Write-Output "NO_GAME_WINDOW"; exit 1 }
$g = $script:games | Sort-Object -Property @{e={$_.W*$_.Hh}} -Descending | Select-Object -First 1
# SW_RESTORE(9) -> SW_SHOW(5) -> top -> foreground
[GW]::ShowWindow($g.H, 9) | Out-Null
[GW]::ShowWindow($g.H, 5) | Out-Null
[GW]::BringWindowToTop($g.H) | Out-Null
[GW]::SetForegroundWindow($g.H) | Out-Null
Start-Sleep -Milliseconds 400
[GW]::SetForegroundWindow($g.H) | Out-Null
$fg = [GW]::GetForegroundWindow()
$same = ($fg -eq $g.H)
Write-Output "GAME pid=$($g.Pid) hwnd=$($g.H) ${($g.W)}x$($g.Hh) foreground=$same"
if (-not $same) {
  $t2 = New-Object System.Text.StringBuilder 512; [GW]::GetWindowTextW($fg, $t2, 512) | Out-Null
  Write-Output "WARN foreground is: $($t2.ToString())"
}
