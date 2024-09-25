:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off
title NodeJS installation

where node > nul 2>nul

if %ERRORLEVEL% neq 0 (
    powershell -Command "Start-Process 'winget' -ArgumentList 'install --id=OpenJS.NodeJS -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity --silent' -Verb RunAs -Wait"
   
    echo NodeJS is successfully installed.
    
    echo. & timeout /nobreak /t 2 >nul

) else (
    echo NodeJS is present in the system.

    call start_alertserver_hidden.bat
)
