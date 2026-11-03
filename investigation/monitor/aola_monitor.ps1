# aola_monitor.ps1 - passive observer for third-party launcher session
# ASCII-only on purpose (avoids PowerShell 5.1 codepage issues).
$ErrorActionPreference = "SilentlyContinue"
$dir    = "D:\temp\ZCode\aola\monitor"
$log    = Join-Path $dir "session_log.csv"
$detail = Join-Path $dir "detail_log.txt"

"timestamp,seq,pid,role,ws_mb,cpu_sec,threads,handles,modflag" |
  Out-File -FilePath $log -Encoding utf8
"=== monitor started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" |
  Out-File -FilePath $detail -Encoding utf8

$seq   = 0
$start = Get-Date

while (((Get-Date) - $start).TotalHours -lt 3) {
  $seq++
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

  # match: any process whose image path sits under ...\ao\ and is v5.0.0.13
  $procs = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" }

  if (-not $procs) {
    "[$ts] seq=$seq waiting for launcher processes..." |
      Out-File -FilePath $detail -Append -Encoding utf8
    Start-Sleep -Seconds 5
    continue
  }

  $fullTick = ($seq % 6 -eq 1)   # full snapshot (modules+net) every ~30s

  foreach ($p in $procs) {
    $role = "main"
    if ([string]::IsNullOrEmpty($p.MainWindowTitle)) { $role = "child" }
    $ws  = [math]::Round($p.WorkingSet64 / 1MB, 1)
    $cpu = [math]::Round($p.TotalProcessorTime.TotalSeconds, 1)
    $modflag = "-"

    if ($fullTick) {
      $mods = @($p.Modules)
      $hits = @($mods | Where-Object { $_.ModuleName -match "speedhack|pepflash|detour" } |
                ForEach-Object { $_.ModuleName })
      if ($hits.Count -gt 0) {
        $modflag = $hits -join ";"
        "[$ts] PID $($p.Id) role=$role LOADED: $($hits -join ', ') (modules total: $($mods.Count))" |
          Out-File -FilePath $detail -Append -Encoding utf8
      }
    }

    "$ts,$seq,$($p.Id),$role,$ws,$cpu,$($p.Threads.Count),$($p.HandleCount),$modflag" |
      Out-File -FilePath $log -Append -Encoding utf8
  }

  if ($fullTick) {
    $pids  = @($procs | ForEach-Object { $_.Id })
    $conns = Get-NetTCPConnection |
      Where-Object { ($pids -contains $_.OwningProcess) -and ($_.RemoteAddress -ne "0.0.0.0") }
    foreach ($c in $conns) {
      "[$ts] NET PID $($c.OwningProcess) -> $($c.RemoteAddress):$($c.RemotePort) [$($c.State)]" |
        Out-File -FilePath $detail -Append -Encoding utf8
    }
    "[$ts] seq=$seq snapshot: $($procs.Count) procs, $($conns.Count) connections" |
      Out-File -FilePath $detail -Append -Encoding utf8
  }

  Start-Sleep -Seconds 5
}
"=== monitor ended (3h cap) $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" |
  Out-File -FilePath $detail -Append -Encoding utf8
