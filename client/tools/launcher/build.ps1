# build.ps1 —— 编译奥拉星一键启动器 exe，并部署进整合包
#
# 前置：Windows 自带 .NET Framework 4.x（csc.exe），无需安装 SDK。
# 用法：
#   pwsh -File client\tools\launcher\build.ps1
#   pwsh -File client\tools\launcher\build.ps1 -OutDir D:\somewhere
#
# 产物：启动奥拉星.exe（无控制台窗口；网关后台运行；网关生命周期与游戏浏览器一致）
param(
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $here "AolaLauncher.cs"
if (-not (Test-Path $src)) { throw "找不到源码: $src" }

$csc = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw "找不到 csc.exe（需要 .NET Framework 4.x）" }

if (-not $OutDir) {
    # 默认部署到整合包根目录
    $OutDir = Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $here))) "dist\aola-launcher-pack\AolaStarLauncher"
}
if (-not (Test-Path $OutDir)) { throw "输出目录不存在: $OutDir" }

$exe = Join-Path $OutDir "启动奥拉星.exe"

& $csc /nologo /target:winexe /codepage:65001 /optimize+ `
    /r:System.dll /r:System.Core.dll /r:System.Windows.Forms.dll /r:System.Management.dll `
    "/out:$exe" $src
if ($LASTEXITCODE -ne 0) { throw "编译失败（exit=$LASTEXITCODE）" }

$item = Get-Item $exe
Write-Host ("[ok] {0}  {1:N0} 字节  {2:yyyy-MM-dd HH:mm}" -f $item.FullName, $item.Length, $item.LastWriteTime)
Write-Host "[提示] 启动器运行时会读 app\lowfx.json 与 app\tools\serve.mjs，改动网关行为请重新同步这两个文件。"
