# windows.ps1 - enumerate visible top-level windows with pid + state
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class WEnum {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(P cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  public static List<string> Run() {
    var outp = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (IsWindowVisible(h)) {
        var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
        if (sb.Length > 2) {
          uint pid; GetWindowThreadProcessId(h, out pid);
          RECT r; GetWindowRect(h, out r);
          outp.Add(pid + "|" + (IsIconic(h) ? "MIN" : "vis") + "|" + (r.R - r.L) + "x" + (r.B - r.T) + "|(" + r.L + "," + r.T + ")|" + sb);
        }
      }
      return true;
    }, IntPtr.Zero);
    return outp;
  }
}
"@
[WEnum]::Run() | ForEach-Object { Write-Host $_ }
