@echo off

set "SessionFile=%temp%\session.tmp"

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