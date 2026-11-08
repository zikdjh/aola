@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist gateway_port.txt (
  echo [!] 未找到 gateway_port.txt —— 请先启动网关（启动网关.cmd）。
  pause
  exit /b 1
)
set /p GWPORT=<gateway_port.txt
echo 正在向网关端口 %GWPORT% 重打登录票据（测试号 26394032）……
node round15_auto_login.mjs %GWPORT%
echo.
echo 完成 —— 回到游戏页面刷新（F5）即可。
pause
