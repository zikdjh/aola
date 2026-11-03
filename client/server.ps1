# server.ps1 - P0 prototype: local mirror + fetch-through proxy for the
# Aola boot chain. Pure .NET (no external deps), ASCII-only.
# Routes:
#   /mirror/<host>/<path>  -> cache\<host>\<path>, fetch from https://<host>/<path> on miss
#   /ruffle/*              -> web\ruffle\* (static)
#   /game                  -> web\game.html
#   /status                -> counters (JSON)
param(
  [int]$Port = 8642,
  [string]$BaseDir = $null
)
$ErrorActionPreference = "Stop"
if (-not $BaseDir) { $BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$WebDir  = Join-Path $BaseDir "web"
$CacheDir = Join-Path $BaseDir "cache"
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

$log = Join-Path $BaseDir "server_log.txt"
function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
  $line | Out-File -FilePath $log -Append -Encoding utf8
  Write-Host $line
}

$mime = @{
  ".html" = "text/html; charset=utf-8";  ".js"   = "text/javascript; charset=utf-8"
  ".wasm" = "application/wasm";          ".swf"  = "application/x-shockwave-flash"
  ".xml"  = "application/xml";           ".json" = "application/json"
  ".png"  = "image/png";                 ".jpg"  = "image/jpeg"; ".jpeg" = "image/jpeg"
  ".gif"  = "image/gif";                 ".mp3"  = "audio/mpeg";  ".wav"  = "audio/wav"
  ".ttf"  = "font/ttf";                  ".otf"  = "font/otf";    ".txt"  = "text/plain"
  ".css"  = "text/css; charset=utf-8";   ".zip"  = "application/zip"
  ".ico"  = "image/x-icon";              ".bin"  = "application/octet-stream"
}
function Get-Mime([string]$path) {
  $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  if ($mime.ContainsKey($ext)) { return $mime[$ext] } else { return "application/octet-stream" }
}

# strip the cache-busting "~<digits>" suffix: foo~261031.swf -> foo.swf
function Get-CacheKey([string]$path) {
  return [regex]::Replace($path, "~\d+(?=\.[a-zA-Z0-9]+$)", "")
}

# fetch-through: download from official CDN into cache, return local path
$script:http = $null
function Get-HttpClient {
  if (-not $script:http) {
    Add-Type -AssemblyName System.Net.Http
    $h = New-Object System.Net.Http.HttpClient
    $h.Timeout = [TimeSpan]::FromSeconds(60)
    $h.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    $h.DefaultRequestHeaders.Referrer = [Uri]"https://aola.100bt.com/play/play.html"
    $script:http = $h
  }
  return $script:http
}

function Get-MirrorFile([string]$hostName, [string]$urlPath) {
  # returns $null or local file path
  $key = Get-CacheKey $urlPath
  $safe = $key.TrimStart("/").Replace("/", "\")
  if ($safe -match "\.\." -or $safe -match ":") { return $null }
  $local = Join-Path (Join-Path $CacheDir $hostName) $safe
  if (Test-Path $local) { return $local }
  $dir = Split-Path -Parent $local
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $remote = "https://$hostName" + $key
  try {
    $bytes = (Get-HttpClient).GetByteArrayAsync($remote).GetAwaiter().GetResult()
    [IO.File]::WriteAllBytes($local, $bytes)
    Log ("FETCH  {0} {1}  ({2} bytes)" -f $hostName, $key, $bytes.Length)
    return $local
  } catch {
    Log ("MISS   {0}{1}  ({2})" -f $hostName, $key, $_.Exception.Message)
    return $null
  }
}

function Send-Bytes($stream, [int]$status, [string]$ct, [byte[]]$body) {
  $head = "HTTP/1.1 $status OK`r`n" +
          "Content-Type: $ct`r`n" +
          "Content-Length: $($body.Length)`r`n" +
          "Access-Control-Allow-Origin: *`r`n" +
          "Cross-Origin-Opener-Policy: same-origin`r`n" +
          "Cross-Origin-Embedder-Policy: require-corp`r`n" +
          "Cache-Control: no-store`r`n" +
          "Connection: close`r`n`r`n"
  $hb = [Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($hb, 0, $hb.Length)
  if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

$stats = @{ requests = 0; fetched = 0; errors = 0 }

$lst = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), $Port
$lst.Start()
Log ("P0 mirror server listening on http://127.0.0.1:{0}/  (game: /game)" -f $Port)

while ($true) {
  $client = $lst.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 10000
    $stream = $client.GetStream()
    $buf = New-Object byte[] 16384
    $n = $stream.Read($buf, 0, 16384)
    if ($n -le 0) { $client.Close(); continue }
    $req = [Text.Encoding]::ASCII.GetString($buf, 0, $n)
    $path = "/"
    if ($req -match "^GET\s+(\S+)") { $path = $matches[1] }
    $path = [Uri]::UnescapeDataString(($path -split "\?")[0])
    $stats.requests++

    if ($path -eq "/status") {
      $body = $stats | ConvertTo-Json -Compress
      Send-Bytes $stream 200 "application/json" ([Text.Encoding]::UTF8.GetBytes($body))
    }
    elseif ($path -eq "/game" -or $path -eq "/game.html") {
      $f = Join-Path $WebDir "game.html"
      Send-Bytes $stream 200 (Get-Mime $f) ([IO.File]::ReadAllBytes($f))
    }
    elseif ($path.StartsWith("/ruffle/")) {
      $rel = $path.Substring("/ruffle/".Length).Replace("/", "\")
      $f = Join-Path (Join-Path $WebDir "ruffle") $rel
      if ($f -match "\.\." -or -not (Test-Path $f)) {
        Send-Bytes $stream 404 "text/plain" ([Text.Encoding]::ASCII.GetBytes("not found: $path"))
      } else {
        Send-Bytes $stream 200 (Get-Mime $f) ([IO.File]::ReadAllBytes($f))
      }
    }
    elseif ($path.StartsWith("/mirror/")) {
      $rest = $path.Substring("/mirror/".Length)          # <host>/<path>
      $idx = $rest.IndexOf("/")
      if ($idx -gt 0) {
        $hostName = $rest.Substring(0, $idx).ToLowerInvariant()
        $urlPath  = $rest.Substring($idx)
        $local = Get-MirrorFile $hostName $urlPath
        if ($local) {
          $stats.fetched++
          Send-Bytes $stream 200 (Get-Mime $local) ([IO.File]::ReadAllBytes($local))
        } else {
          $stats.errors++
          Send-Bytes $stream 404 "text/plain" ([Text.Encoding]::ASCII.GetBytes("upstream miss: $path"))
        }
      } else {
        Send-Bytes $stream 400 "text/plain" ([Text.Encoding]::ASCII.GetBytes("bad mirror path"))
      }
    }
    else {
      Send-Bytes $stream 200 "text/html; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes(
        "<h3>Aola P0 mirror</h3><p><a href='/game'>open game</a></p><pre>/status</pre>"))
    }
    $stream.Close()
  } catch {
    $stats.errors++
    Log ("ERR    {0}" -f $_.Exception.Message)
  }
  try { $client.Close() } catch {}
}
