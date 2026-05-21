@echo off
setlocal
set "ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%daemon\run-demo.ps1"
if errorlevel 1 (
  echo.
  echo RUN nie zdolal uruchomic demo.
  echo Szczegoly powinny byc w pliku .runtime\launcher.log
  pause
)
