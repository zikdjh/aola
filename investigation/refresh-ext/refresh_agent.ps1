# refresh_agent.ps1 - 奥拉星My登录器 免登录刷新 伴生代理（中文界面版）
param(
  [int]$ThresholdMB = 1800,
  [int]$CooldownSec = 300,
  [switch]$SelfTest                 # 启动 3 秒后自动下发一次刷新（安装验证用）
)
$ErrorActionPreference = "SilentlyContinue"

$dir = "D:\temp\ZCode\aola\refresh-ext"
$log = Join-Path $dir "agent_log.txt"

$state = [hashtable]::Synchronized(@{})
$state.reloadPending = $false
$state.autoReload = $false             # 默认关：超阈值只提醒（避免战斗中被误刷）
$state.extAlive = $false
$state.lastPing = $null
$state.lastReload = [datetime]::MinValue

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  $line | Out-File -FilePath $log -Append -Encoding utf8
  Write-Host $line
}

# ---------- 窗口救援（游戏窗口跑出屏幕时自动拉回，如 DPI 缩放还原错位） ----------
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
$script:screenW   = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
$script:screenH   = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height
$script:lastFixAt = [datetime]::MinValue

function Repair-GameWindow([switch]$Force) {
  $targets = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" } |
             Select-Object -ExpandProperty Id
  foreach ($tp in $targets) {
    foreach ($w in [Rescue]::Collect([uint32]$tp)) {
      $title = [string]$w[1]
      if ($title -notlike "*5.0.0*") { continue }   # 只处理游戏窗口（面板标题不同）
      $hwnd = [IntPtr]$w[0]
      $l = [int]$w[2]; $t = [int]$w[3]; $r = [int]$w[4]; $b = [int]$w[5]
      $wd = $r - $l; $ht = $b - $t
      $off = ($l -lt -50) -or ($t -lt -50) -or ($r -gt ($script:screenW + 50)) -or ($b -gt ($script:screenH + 50))
      if (-not $off -and -not $Force) { continue }
      if (-not $Force -and ((Get-Date) - $script:lastFixAt).TotalSeconds -lt 60) { continue }
      $nx = [Math]::Max(0, [int]((($script:screenW) - $wd) / 2))
      $ny = [Math]::Max(0, [int]((($script:screenH) - $ht) / 2))
      if ($nx -eq $l -and $ny -eq $t) { continue }
      if ([Rescue]::MoveWindow($hwnd, $nx, $ny, $wd, $ht, $true)) {
        $script:lastFixAt = Get-Date
        Log ("窗口救援: {0}x{1} 从 ({2},{3}) 移至 ({4},{5}){6}" -f `
          $wd, $ht, $l, $t, $nx, $ny, $(if ($Force) { "［手动］" } else { "" }))
      }
    }
  }
}

# ---------- DevTools 刷新通道（主通道，经 9222 端口，无需扩展） ----------
function Invoke-DevToolsReload {
  try {
    $targets = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 4
    $game = $targets | Where-Object { $_.url -like "*aola.100bt.com/play/play.html*" } | Select-Object -First 1
    if (-not $game) { return $false }
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([Uri]$game.webSocketDebuggerUrl, $ct).Wait()
    $cmd = '{"id":1,"method":"Page.reload"}'
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($cmd)
    $ws.SendAsync(
      [System.ArraySegment[byte]]::new($bytes),
      [System.Net.WebSockets.WebSocketMessageType]::Text,
      $true, $ct).Wait()
    Start-Sleep -Milliseconds 300
    $ws.Dispose()
    return $true
  } catch { return $false }
}

# ---------- HTTP 指令响应线程（原生 TcpListener，无需管理员/URLACL） ----------
$runspace = [runspacefactory]::CreateRunspace()
$runspace.Open()
$runspace.SessionStateProxy.SetVariable("state", $state)
$runspace.SessionStateProxy.SetVariable("port", 64321)
$runspace.SessionStateProxy.SetVariable("log", $log)
$ps = [powershell]::Create()
$ps.Runspace = $runspace
$null = $ps.AddScript({
  $ErrorActionPreference = "SilentlyContinue"
  $lst = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
  $lst.Start()
  "[{0}] 指令端口已就绪: 127.0.0.1:{1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $port |
    Out-File $log -Append -Encoding utf8
  while ($true) {
    $c = $lst.AcceptTcpClient()
    try {
      $s = $c.GetStream(); $s.ReadTimeout = 2000
      $buf = New-Object byte[] 2048
      $n = $s.Read($buf, 0, 2048)
      $req = [System.Text.Encoding]::ASCII.GetString($buf, 0, [Math]::Max($n, 0))
      $path = "/"
      if ($req -match "^GET\s+(\S+)") { $path = $matches[1] }
      $body = "ok"
      if ($path.StartsWith("/ping")) {
        $state.extAlive = $true
        $state.lastPing = Get-Date
        ("[{0}] EXT-ALIVE {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $path) |
          Out-File $log -Append -Encoding utf8
        $body = "pong"
      } elseif ($path.StartsWith("/cmd")) {
        if ($state.reloadPending) {
          $body = "reload"
          $state.reloadPending = $false
          $state.lastReload = Get-Date
          ("[{0}] 刷新指令已下发到页面" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss")) |
            Out-File $log -Append -Encoding utf8
        }
      }
      $resp = "HTTP/1.1 200 OK`r`n" +
              "Content-Type: text/plain`r`n" +
              "Access-Control-Allow-Origin: *`r`n" +
              "Content-Length: $($body.Length)`r`n" +
              "Connection: close`r`n`r`n" + $body
      $b = [System.Text.Encoding]::ASCII.GetBytes($resp)
      $s.Write($b, 0, $b.Length)
    } catch {}
    try { $c.Close() } catch {}
  }
})
$null = $ps.BeginInvoke()

try { $host.UI.RawUI.WindowTitle = "奥拉星刷新代理" } catch {}
Log ("刷新代理已启动 | 阈值={0}MB | 冷却={1}s | 自动刷新=关" -f $ThresholdMB, $CooldownSec)
Write-Host "按键: [R] 立即刷新   [A] 切换自动刷新   [P] 修复窗口位置   [S] 查看状态   [Q] 退出"

$lastScan    = Get-Date
$script:lastWs    = 0
$script:warnedAt  = [datetime]::MinValue
$script:selfTestDone = -not $SelfTest
$script:startAt    = Get-Date

while ($true) {
  Start-Sleep -Milliseconds 500

  if (-not $script:selfTestDone -and ((Get-Date) - $script:startAt).TotalSeconds -ge 3) {
    $script:selfTestDone = $true
    if (Invoke-DevToolsReload) {
      Log "自检：已通过 DevTools 下发刷新 —— 页面应正在重载"
    } else {
      $state.reloadPending = $true
      Log "自检：DevTools 不可用，已走扩展通道排队 —— 页面 2 秒内重载（若扩展已加载）"
    }
  }

  if ([Console]::KeyAvailable) {
    $k = [Console]::ReadKey($true).Key
    if ($k -eq "R") {
      if (Invoke-DevToolsReload) {
        $state.lastReload = Get-Date
        Log "已通过 DevTools 下发刷新（免登录，无需扩展）"
      } else {
        $state.reloadPending = $true
        Log "DevTools 不可用，已改走扩展通道排队刷新（页面 2 秒内执行）"
      }
    } elseif ($k -eq "A") {
      $state.autoReload = -not $state.autoReload
      Log ("自动刷新已切换 -> {0}" -f $(if ($state.autoReload) { "开" } else { "关" }))
    } elseif ($k -eq "P") {
      Repair-GameWindow -Force
    } elseif ($k -eq "S") {
      Write-Host ("状态: 扩展已连接={0} | 最近Ping={1} | 内存={2}MB | 上次刷新={3} | 待下发={4}" -f `
        $state.extAlive, $state.lastPing, $script:lastWs, $state.lastReload, $state.reloadPending)
    } elseif ($k -eq "Q") { break }
  }

  if (((Get-Date) - $lastScan).TotalSeconds -ge 5) {
    $lastScan = Get-Date
    $procs = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" }
    if ($procs) {
      $children = @($procs | Where-Object { [string]::IsNullOrEmpty($_.MainWindowTitle) })
      if ($children.Count -gt 0) {
        $max = ($children | Measure-Object WorkingSet64 -Maximum).Maximum
        $script:lastWs = [math]::Round($max / 1MB, 0)
      }
      Repair-GameWindow
      if ($script:lastWs -gt $ThresholdMB) {
        if ($state.autoReload -and ((Get-Date) - $state.lastReload).TotalSeconds -gt $CooldownSec) {
          if (Invoke-DevToolsReload) {
            $state.lastReload = Get-Date
            Log ("自动刷新已执行（DevTools）：内存={0}MB 超过 {1}MB" -f $script:lastWs, $ThresholdMB)
          } else {
            $state.reloadPending = $true
            Log ("自动刷新已排队（扩展通道）：内存={0}MB 超过 {1}MB" -f $script:lastWs, $ThresholdMB)
          }
        } elseif (-not $state.autoReload -and ((Get-Date) - $script:warnedAt).TotalSeconds -gt 60) {
          $script:warnedAt = Get-Date
          try { [console]::beep() } catch {}
          Log ("提醒：内存={0}MB 超过 {1}MB —— 按 R 刷新（或按 A 开启自动模式）" -f $script:lastWs, $ThresholdMB)
        }
      }
    }
  }
}
Log "代理已退出"
