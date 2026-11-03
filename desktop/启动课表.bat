@echo off
cd /d "%~dp0"
for %%f in ("*.exe") do (
  start "" "%%~ff"
  exit /b
)
echo launcher not found
pause
