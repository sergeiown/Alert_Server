:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off
title Alert Server Recovery

cls & echo Starting the recovery process...
echo. & timeout /t 2 /nobreak > nul

taskkill /f /im node.exe >nul 2>nul

set "installationDir=%USERPROFILE%\Documents\Alert_Server"
set "tempDir=%USERPROFILE%\Documents\Temp_Alert_Server"
cd /d "%installationDir%"

for /f "delims=" %%i in ('where git') do set "gitPath=%%i"

if not defined gitPath (
    echo Error: Git is not installed or not found in PATH.
    echo Attempting to use a fallback path...
    set "gitPath=%ProgramW6432%\Git\bin\git.exe"
)

set "githubUrl=https://github.com/sergeiown/Alert_Server"

if exist "%tempDir%" (
    echo Temporary directory exists. Cleaning it up...
    rmdir /s /q "%tempDir%"
)
mkdir "%tempDir%"

echo Cloning the project from GitHub...
"%gitPath%" clone "%githubUrl%" "%tempDir%"

if %errorlevel% neq 0 (
    echo Error: Failed to clone the project.
    pause & exit /b 1
)

echo Moving files from temporary directory to installation directory...
xcopy /e /y /q "%tempDir%\*" "%installationDir%\"

if %errorlevel% neq 0 (
    echo Error: Failed to move files.
    pause & exit /b 1
)

rmdir /s /q "%tempDir%"

echo. & timeout /t 2 /nobreak > nul

call "%installationDir%\start_dependencies_installer.bat"

echo. & timeout /t 2 /nobreak > nul

set sourceFile=%installationDir%\resources\images\tray.ico
set destFile=%installationDir%\node_modules\trayicon\rsrcs\default.ico

if exist "%destFile%" (
    del "%destFile%"
)
copy "%sourceFile%" "%destFile%"

echo. & echo Recovery is complete.
timeout /t 2 /nobreak > nul
echo. & echo The settings are set to the default values.
echo. & timeout /t 5 /nobreak > nul

start /min "" powershell -WindowStyle Hidden -Command "& { $timestamp = Get-Date -Format 'dd.MM.yyyy HH:mm:ss'; Write-Output \"[$timestamp]\" | Out-File -FilePath 'error.log' -Append -Encoding utf8; node index.js 2>> error.log }"

exit /b
