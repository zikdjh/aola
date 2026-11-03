# cdp_eval.ps1 - evaluate JS in the launcher's page via CDP 9222, print result.
param([string]$Js = "location.href")
$ErrorActionPreference = "Stop"
$targets = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 4
$game = $targets | Where-Object { $_.url -like "*aola*" -and $_.type -eq "page" } | Select-Object -First 1
if (-not $game) { Write-Host "no aola target"; exit 1 }
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$game.webSocketDebuggerUrl, $ct).Wait()
$expr = $Js.Replace('\', '\\').Replace('"', '\"')
$cmd = '{"id":7,"method":"Runtime.evaluate","params":{"expression":"' + $expr + '","returnByValue":true}}'
$b = [Text.Encoding]::UTF8.GetBytes($cmd)
$ws.SendAsync([ArraySegment[byte]]::new($b), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
$buf = New-Object byte[] (1024 * 1024)
$sb = New-Object System.Text.StringBuilder
$deadline = (Get-Date).AddSeconds(6)
while ((Get-Date) -lt $deadline) {
  $t = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct)
  if (-not $t.Wait(2500)) { break }
  $r = $t.Result
  if ($r.MessageType -eq "Close") { break }
  [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
  if ($r.EndOfMessage) { break }
}
$ws.Dispose()
Write-Host $sb.ToString()
