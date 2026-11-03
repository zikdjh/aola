# devtools_eval.ps1 - run JS inside the game page via CEF DevTools and
# print the result. Usage: .\devtools_eval.ps1 [-Expression '<js>']
param(
  [string]$Expression = ""
)
$ErrorActionPreference = "Stop"

if (-not $Expression) {
  $Expression = @'
JSON.stringify({
  url: location.href,
  cookieNames: document.cookie.split(';').map(function(c){return c.trim().split('=')[0]}).filter(Boolean),
  cookieLen: document.cookie.length,
  bodyLen: document.body ? document.body.innerHTML.length : -1,
  flashTags: (document.querySelectorAll('object,embed').length),
  btns: (function(){var o=[];document.querySelectorAll('a,button,input,[onclick]').forEach(function(e,i){if(i<25)o.push(e.tagName+'#'+(e.id||'')+'.'+(e.className||'')+'|onclick='+(e.getAttribute('onclick')||'')+'|'+((e.src||e.href||'')+'').slice(0,60))});return o})()
})
'@
}

$targets = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 4
$game = $targets | Where-Object { $_.url -like "*aola*" } | Select-Object -First 1
if (-not $game) { Write-Host "no aola target"; exit 1 }
Write-Host ("target url: {0}" -f $game.url)

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$game.webSocketDebuggerUrl, $ct).Wait()

$esc = $Expression.Replace('\', '\\').Replace('"', '\"').Replace("`n", ' ').Replace("`r", '')
$cmd = '{"id":7,"method":"Runtime.evaluate","params":{"expression":"' + $esc + '","returnByValue":true}}'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($cmd)
$ws.SendAsync([System.ArraySegment[byte]]::new($bytes),
  [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()

# read response frames
$buf = New-Object byte[] 65536
$sb = New-Object System.Text.StringBuilder
$deadline = (Get-Date).AddSeconds(6)
while ((Get-Date) -lt $deadline) {
  $task = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct)
  if (-not $task.Wait(2500)) { break }
  $res = $task.Result
  if ($res.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }
  [void]$sb.Append([System.Text.Encoding]::UTF8.GetString($buf, 0, $res.Count))
  if ($res.EndOfMessage) { break }
}
$ws.Dispose()

$raw = $sb.ToString()
Write-Host ("raw len: {0}" -f $raw.Length)
try {
  $json = $raw | ConvertFrom-Json
  if ($json.result.result.value) {
    Write-Host "=== page state ==="
    Write-Host $json.result.result.value
  } else {
    Write-Host ($raw.Substring(0, [Math]::Min(800, $raw.Length)))
  }
} catch {
  Write-Host ($raw.Substring(0, [Math]::Min(800, $raw.Length)))
}
