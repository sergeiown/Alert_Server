:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

set "SessionFile=%temp%\alertserver_session.tmp"

for /f %%i in ('type %SessionFile% 2^>nul') do set "NodePID=%%i"

taskkill /f /pid %NodePID%  >nul 2>nul
echo Alert update server is stopped.
pause