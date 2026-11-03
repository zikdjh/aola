# reload_via_devtools.ps1 - one-shot: reload the game page via CEF DevTools
# protocol (no extension needed). ASCII-only output.
$ErrorActionPreference = "Stop"

$targets = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 4
$game = $targets | Where-Object { $_.url -like "*aola.100bt.com/play/play.html*" } | Select-Object -First 1
if (-not $game) { Write-Host "game page target not found"; exit 1 }
Write-Host ("target: {0} | {1}" -f $game.title, $game.url)

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$game.webSocketDebuggerUrl, $ct).Wait()

$cmd = '{"id":1,"method":"Page.reload","params":{"ignoreCache":false}}'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($cmd)
$ws.SendAsync(
  [System.ArraySegment[byte]]::new($bytes),
  [System.Net.WebSockets.WebSocketMessageType]::Text,
  $true, $ct).Wait()
Start-Sleep -Milliseconds 400
$ws.Dispose()
Write-Host "Page.reload sent -- page should be reloading now"
