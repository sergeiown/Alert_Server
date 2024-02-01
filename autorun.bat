@echo off
setlocal enabledelayedexpansion

echo Enter the full path to the start_hidden.bat file:
set /p bat_path=

:: Check if the file exists
if not exist "!bat_path!" (
    echo File not found. Please check the path and try again.
    timeout /t 2 /nobreak > nul
    goto :eof
)

:: Add to startup via registry
reg add HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v "start_hidden" /t REG_SZ /d "!bat_path!" /f

echo start_hidden.bat successfully added to startup via the registry!
pause

:end

