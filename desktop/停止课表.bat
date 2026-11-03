@echo off
set found=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5178" ^| findstr "LISTENING"') do (
  taskkill /f /pid %%a >nul 2>nul
  set found=1
)
if "%found%"=="1" (echo SuperTable service stopped) else (echo SuperTable service is not running)
timeout /t 2 >nul
