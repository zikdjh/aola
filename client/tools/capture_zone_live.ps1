# capture_zone_live.ps1 - 管理员运行：pktmon 抓区服(8000-8009) TCP 流，直到 stop 标志出现
# 启动（普通 shell）: powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','<本文件>'"
# 停止（外部触发）  : 创建 docs\spike\capture_stop.flag
# 状态              : docs\spike\capture_live_status.txt
param(
  [string]$Etl  = "D:\temp\ZCode\zone_live.etl",
  [string]$Pcap = "D:\temp\ZCode\aola\client\docs\spike\zone_live.pcapng",
  [int]$MaxSeconds = 1800
)
$ErrorActionPreference = "Continue"
$dir = "D:\temp\ZCode\aola\client\docs\spike"
$statusFile = "$dir\capture_live_status.txt"
$stopFile = "$dir\capture_stop.flag"
Remove-Item $stopFile -ErrorAction SilentlyContinue
"started $(Get-Date -Format 'HH:mm:ss')" | Out-File $statusFile -Encoding utf8

pktmon stop 2>$null | Out-Null
pktmon filter remove 2>$null | Out-Null
# 逐端口加过滤器（多 -p 参数只会保留最后一个）
foreach ($p in 8000,8001,8002,8003,8004,8005,8006,8007,8008,8009) {
  pktmon filter add "ZONE$p" -p $p 2>&1 | Out-Null
}
pktmon filter list 2>&1 | Out-File $statusFile -Append -Encoding utf8
pktmon start --capture --pkt-size 0 -f $Etl 2>&1 | Out-File $statusFile -Append -Encoding utf8
"capturing... (stop flag: $stopFile)" | Out-File $statusFile -Append -Encoding utf8

$sw = [Diagnostics.Stopwatch]::StartNew()
$lastBeat = -1
while ($sw.Elapsed.TotalSeconds -lt $MaxSeconds) {
  if (Test-Path $stopFile) {
    "stop flag seen at $([int]$sw.Elapsed.TotalSeconds)s" | Out-File $statusFile -Append -Encoding utf8
    break
  }
  $sec = [int]$sw.Elapsed.TotalSeconds
  if ($sec - $lastBeat -ge 30) {
    $lastBeat = $sec
    "alive ${sec}s" | Out-File $statusFile -Append -Encoding utf8
  }
  Start-Sleep -Seconds 2
}

pktmon stop 2>&1 | Out-File $statusFile -Append -Encoding utf8
pktmon etl2pcap $Etl -o $Pcap 2>&1 | Out-File $statusFile -Append -Encoding utf8
"done $(Get-Date -Format 'HH:mm:ss') -> $Pcap" | Out-File $statusFile -Append -Encoding utf8
