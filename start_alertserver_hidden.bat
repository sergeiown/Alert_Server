:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

for /f "delims=" %%i in ('where node') do set "nodePath=%%i"

if not defined nodePath (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "nodePath=%ProgramFiles%\nodejs\node.exe"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "nodePath=%ProgramFiles(x86)%\nodejs\node.exe"
    ) else (
        echo NodeJS is not detected and needs to be downloaded and installed.
        call start_node_js_installer.bat
    )
)

echo NodeJS detected: & "%nodePath%" -v

if not exist "node_modules" (
    call start_dependencies_installer.bat
)

taskkill /f /im node.exe >nul 2>nul

start /min "" powershell -WindowStyle Hidden -Command "& { $timestamp = Get-Date -Format 'dd.MM.yyyy HH:mm:ss'; Write-Output \"[$timestamp]\" | Out-File -FilePath 'error.log' -Append -Encoding utf8; & '%nodePath%' index.js 2>> error.log }"