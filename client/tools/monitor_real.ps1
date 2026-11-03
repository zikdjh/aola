# monitor_real.ps1 - capture the REAL client (My launcher) HTTP traffic via CDP 9222.
# Waits for the launcher, attaches Network domain on the game page, logs requests
# and responses to monitor_real_log.txt. ASCII-only.
param(
  [int]$TimeoutSec = 1800
)
$ErrorActionPreference = "SilentlyContinue"
$log = "D:\temp\ZCode\aola\client\docs\spike\monitor_real_log.txt"
$stamp = { Get-Date -Format "HH:mm:ss" }

function Log($msg) {
  $line = ("[{0}] {1}" -f (& $stamp), $msg)
  $line | Out-File -FilePath $log -Append -Encoding utf8
  Write-Host $line
}

Log "=== real-client monitor started (waiting for launcher CDP 9222) ==="

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$attached = $false
$ws = $null
$msgId = 100

function Send-Cmd($ws, $id, $method, $params) {
  $o = @{ id = $id; method = $method }
  if ($params) { $o.params = $params }
  $json = $o | ConvertTo-Json -Compress -Depth 6
  $b = [Text.Encoding]::UTF8.GetBytes($json)
  $ws.SendAsync([ArraySegment[byte]]::new($b), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
}

while ((Get-Date) -lt $deadline) {
  if (-not $attached) {
    # wait for the launcher + CDP
    $launcher = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" } | Select-Object -First 1
    if (-not $launcher) { Start-Sleep -Seconds 2; continue }
    $targets = $null
    try { $targets = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 3 } catch { Start-Sleep -Seconds 2; continue }
    $page = $targets | Where-Object { $_.url -like "*aola*" -and $_.type -eq "page" } | Select-Object -First 1
    if (-not $page) { Start-Sleep -Seconds 2; continue }
    Log ("launcher detected: pid=" + $launcher.Id + " target=" + $page.url)
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [Threading.CancellationToken]::None
    try { $ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $ct).Wait() } catch { Log ("ws connect failed: " + $_.Exception.Message); Start-Sleep 3; continue }
    Send-Cmd $ws 1 "Network.enable" $null
    Send-Cmd $ws 2 "Page.enable" $null
    Send-Cmd $ws 3 "Runtime.enable" $null
    Log "CDP attached, Network capture ON"
    $attached = $true
  }
  else {
    # read CDP events
    $buf = New-Object byte[] (2 * 1024 * 1024)
    $sb = New-Object System.Text.StringBuilder
    $ct = [Threading.CancellationToken]::None
    $task = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct)
    if (-not $task.Wait(1000)) {
      # no message in 1s: keep alive, check launcher still running
      if (-not (Get-Process -Id $launcher.Id -ErrorAction SilentlyContinue)) {
        Log "launcher exited, detaching"
        $attached = $false
        try { $ws.Dispose() } catch {}
      }
      continue
    }
    $res = $task.Result
    if ($res.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { Log "cdp closed, will re-attach"; $attached = $false; continue }
    [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $res.Count))
    while (-not $res.EndOfMessage) {
      try {
        $res = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct).Result
      } catch {
        Log ("recv error, re-attach: " + $_.Exception.Message)
        $attached = $false
        break
      }
      if ($res.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { Log "cdp closed mid-frame"; $attached = $false; break }
      [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $res.Count))
    }
    if (-not $attached) { try { $ws.Dispose() } catch {}; continue }
    $msg = $sb.ToString()
    try {
      $j = $msg | ConvertFrom-Json
      if ($j.method -eq "Network.requestWillBeSent") {
        $r = $j.params.request
        Log ("REQ  " + $r.method + " " + $r.url + "  post=" + ($r.postData + "").Substring(0, [Math]::Min(300, ($r.postData + "").Length)))
      }
      elseif ($j.method -eq "Network.responseReceived") {
        $r = $j.params.response
        Log ("RES  " + $r.status + " " + $r.url + "  len=" + ($r.encodedDataLength))
        # 抓关键接口的响应体（票据/角色/心跳/区服）
        if ($r.url -match "newLogin|query_role|CheckAlive|ZoneInfo|redirect|getserver|serverlist" -or $j.params.type -eq "XHR") {
          $msgId++
          Send-Cmd $ws $msgId "Network.getResponseBody" @{ requestId = $j.params.requestId }
          $bodyTag = "BODYREQ" + $msgId + " " + $r.url
          Log $bodyTag
        }
      }
      elseif ($j.method -eq "Network.loadingFailed") {
        Log ("FAIL " + $j.params.errorText + " " + $j.params.type)
      }
      elseif ($j.result -and $j.result.body) {
        Log ("BODY " + ($j.result.body -replace "\s+", " ").Substring(0, [Math]::Min(600, ($j.result.body).Length)))
      }
    } catch {}
  }
}
Log "monitor exit"
