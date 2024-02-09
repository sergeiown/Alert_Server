:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

:: Перевірка наявності Node.js та встановлених залежностей
for /f "delims=" %%v in ('node -v 2^>nul') do set "node_version=%%v"

if not defined node_version (
    echo NodeJS is not detected and needs to be downloaded and installed.
    call start_node_js_installer.bat
    
) else (
    echo NodeJS version installed: %node_version%
)

if not exist "node_modules" (
    call start_dependencies_installer.bat
)

set "SessionFile=%temp%\alertserver_session.tmp"

:: Зчитування PID з файлу session.tmp
for /f %%i in ('type %SessionFile% 2^>nul') do set "NodePID=%%i"

:: Завершення процесу із вказаним PID
taskkill /f /pid %NodePID% >nul 2>nul

:: Запуск нового процесу
start /b "" powershell -WindowStyle Hidden -Command "node index.js"
echo Alert update server is successfully started.
echo Date,Time,Event
timeout /t 1 /nobreak >nul

:: Запис нового PID у файл session.tmp
for /f "tokens=2 delims=," %%i in ('tasklist /nh /fi "imagename eq node.exe" /fo csv ^| findstr /i "node.exe"') do (
    echo %%i > %SessionFile%
)