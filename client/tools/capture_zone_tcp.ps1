# capture_zone_tcp.ps1 - 用 pktmon 抓真实客户端（MY）到区服服务器的 TCP 流
# 用法: 以管理员运行  powershell -File capture_zone_tcp.ps1 -Out zone_real.pcapng
# 前置: 先启动 MY 登录进游戏，然后立刻运行本脚本（抓 60 秒）
param([string]$Out = "D:\temp\ZCode\aola\ruffle-client\docs\spike\zone_real.pcapng",
      [int]$Seconds = 60)
$ErrorActionPreference = "Stop"
# 清理旧过滤器
pktmon stop 2>$null | Out-Null
pktmon filter remove 2>$null | Out-Null
# 只抓区服端口段（游戏服 8000-8009，全部远端）
pktmon filter add -p 8000-8009 | Out-Null
pktmon start --capture --pkt-size 0 -f "$Out.etl" | Out-Null
Write-Host "capturing $Seconds s ... （现在去 MY 里走动/进战斗）"
Start-Sleep -Seconds $Seconds
pktmon stop | Out-Null
pktmon etl2pcap "$Out.etl" -o "$Out" | Out-Null
Remove-Item "$Out.etl" -ErrorAction SilentlyContinue
Write-Host "saved: $Out"
