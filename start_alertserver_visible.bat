:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off
title Alert Server

:start
for /f "delims=" %%i in ('where node') do set "nodePath=%%i"

if not defined nodePath (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "nodePath=%ProgramFiles%\nodejs\node.exe"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "nodePath=%ProgramFiles(x86)%\nodejs\node.exe"
    ) else (
        cls & echo NodeJS is not detected and needs to be downloaded and installed.
        echo. & timeout /nobreak /t 2 >nul
        
        powershell -Command "Start-Process 'cmd.exe' -ArgumentList '/c title Installing Node.js & winget install --id=OpenJS.NodeJS -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity --silent' -Verb RunAs -Wait"

        goto start
    )
)

cls & echo NodeJS detected: & "%nodePath%" -v

if not exist "node_modules" (
    call start_dependencies_installer.bat
)

taskkill /f /im node.exe >nul 2>nul

start /b "" powershell -WindowStyle Hidden -Command "& { $timestamp = Get-Date -Format 'dd.MM.yyyy HH:mm:ss'; Write-Output \"[$timestamp]\" | Out-File -FilePath 'error.log' -Append -Encoding utf8; & '%nodePath%' index.js 2>> error.log }"

echo Date,Time,Event

timeout /t 1 /nobreak >nul