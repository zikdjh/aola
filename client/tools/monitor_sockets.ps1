# monitor_sockets.ps1 - sample the launcher's raw TCP connections (game socket
# endpoints) every 3s, log new endpoints. ASCII-only.
$ErrorActionPreference = "SilentlyContinue"
$log = "D:\temp\ZCode\aola\ruffle-client\docs\spike\monitor_sockets_log.txt"
$seen = @{}
$deadline = (Get-Date).AddSeconds(1800)
"=== socket monitor started ===" | Out-File $log -Append -Encoding utf8
while ((Get-Date) -lt $deadline) {
  $launcher = Get-Process | Where-Object { $_.Path -like "*\ao\*v5.0.0.13*" } | Select-Object -ExpandProperty Id
  if ($launcher) {
    $out = & /c/WINDOWS/System32/NETSTAT.EXE -ano 2>$null | Select-String "ESTABLISHED"
    foreach ($line in $out) {
      $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
      if ($parts.Count -ge 5) {
        $local = $parts[1]; $remote = $parts[2]; $pid = [int]$parts[4]
        if ($launcher -contains $pid) {
          # skip pure-HTTP ports to keep the log focused, record everything once
          $key = $remote
          if (-not $seen[$key]) {
            $seen[$key] = 1
            $line2 = "[{0}] pid={1} -> {2}" -f (Get-Date -Format "HH:mm:ss"), $pid, $remote
            $line2 | Out-File $log -Append -Encoding utf8
            Write-Host $line2
          }
        }
      }
    }
  }
  Start-Sleep -Seconds 3
}
"=== socket monitor exit ===" | Out-File $log -Append -Encoding utf8
