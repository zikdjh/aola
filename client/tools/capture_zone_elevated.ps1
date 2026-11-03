# capture_zone_elevated.ps1 - 管理员权限运行：pktmon 抓区服 TCP 流 300 秒
$ErrorActionPreference = "Continue"
$statusFile = "D:\temp\ZCode\aola\ruffle-client\docs\spike\capture_status.txt"
$pcap = "D:\temp\ZCode\aola\ruffle-client\docs\spike\zone_real.pcapng"
"started $(Get-Date -Format 'HH:mm:ss')" | Out-File $statusFile -Encoding utf8

pktmon stop 2>$null | Out-Null
pktmon filter remove 2>$null | Out-Null
# 逐端口加过滤器（多 -p 参数只会保留最后一个）
foreach ($p in 8000,8001,8002,8003,8004,8005,8006,8007,8008,8009) {
  pktmon filter add "ZONE$p" -p $p 2>&1 | Out-Null
}
pktmon filter list 2>&1 | Out-File $statusFile -Append -Encoding utf8
pktmon start --capture --pkt-size 0 -f "D:\temp\z\zone_real.etl" 2>&1 | Out-File $statusFile -Append -Encoding utf8
"capturing..." | Out-File $statusFile -Append -Encoding utf8

Start-Sleep -Seconds 300

pktmon stop 2>&1 | Out-File $statusFile -Append -Encoding utf8
pktmon etl2pcap "D:\temp\z\zone_real.etl" -o $pcap 2>&1 | Out-File $statusFile -Append -Encoding utf8
"done $(Get-Date -Format 'HH:mm:ss')" | Out-File $statusFile -Append -Encoding utf8
