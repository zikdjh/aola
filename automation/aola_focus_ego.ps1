param()
Add-Type -AssemblyName Microsoft.VisualBasic
[Microsoft.VisualBasic.Interaction]::AppActivate(30128)
Start-Sleep -Milliseconds 500
Write-Host "focused ego window"
