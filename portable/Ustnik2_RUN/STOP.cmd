@echo off
setlocal
set "ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%daemon\stop-demo.ps1"
if errorlevel 1 (
  echo.
  echo STOP nie zdolal zatrzymac demo.
  echo Szczegoly powinny byc w pliku .runtime\launcher.log
  pause
)
