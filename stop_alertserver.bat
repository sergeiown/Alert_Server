@echo off

set "SessionFile=%temp%\alertserver_session.tmp"

:: Зчитування PID з файлу session.tmp
for /f %%i in ('type %SessionFile% 2^>nul') do set "NodePID=%%i"

:: Завершення процесу із вказаним PID
taskkill /f /pid %NodePID%  >nul 2>nul
echo Alert update server is stopped.
pause