@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [!] 未找到 node —— 网关版需要系统已安装 Node.js（https://nodejs.org 下载 LTS 版安装）。
  pause
  exit /b 1
)
title 奥拉星网关
node start_gateway.mjs
pause
