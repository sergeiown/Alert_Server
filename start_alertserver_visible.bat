:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

where node > nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo NodeJS is not detected and needs to be downloaded and installed.
    call start_node_js_installer.bat
    
) else (
    echo NodeJS detected: & node -v
)

if not exist "node_modules" (
    call start_dependencies_installer.bat
)

taskkill /f /im node.exe >nul 2>nul

start /b "" powershell -WindowStyle Hidden -Command "node index.js"

echo Alert update server is successfully started.
echo Date,Time,Event
timeout /t 1 /nobreak >nul