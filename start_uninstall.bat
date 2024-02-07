:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

taskkill /f /im "node.exe" >nul 2>nul

timeout /t 1 /nobreak >nul

del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Alert server.lnk"

rmdir /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Alert server\"

rmdir /s /q "%ProgramFiles%\Alert server"

cls & echo Alert server successfully uninstalled.

timeout /t 3 /nobreak > nul