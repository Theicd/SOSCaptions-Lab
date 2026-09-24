@echo off
cd /d "%~dp0"
echo.
echo  SOS Captions Lab — Phase 1 (Mock)
echo  http://127.0.0.1:8899
echo.
npx --yes serve -l 8899 .
