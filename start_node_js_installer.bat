:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

where node > nul 2>nul

if %ERRORLEVEL% neq 0 (
    powershell -Command "Start-Process 'winget' -ArgumentList 'install OpenJS.NodeJS --accept-source-agreements' -Verb RunAs -Wait"
   
    echo NodeJS is successfully installed.
    
    echo. & timeout /nobreak /t 2 >nul

) else (
    echo NodeJS is present in the system.

    call start_alertserver_hidden.bat
)
