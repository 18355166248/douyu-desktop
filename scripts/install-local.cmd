@echo off
rem Double-click to install the portable build into %LOCALAPPDATA%\Programs.
rem Pass extra switches through, e.g. "-SkipBuild", "-NoDesktopShortcut", "-Uninstall".
setlocal
set "SCRIPT=%~dp0install.ps1"
if not exist "%SCRIPT%" (
  echo install.ps1 not found next to this file.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
set "CODE=%ERRORLEVEL%"
echo.
if "%CODE%"=="0" (
  echo Done.
) else (
  echo Failed with exit code %CODE%.
)
echo.
pause
exit /b %CODE%
