:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

taskkill /f /im "node.exe" >nul 2>nul

timeout /t 1 /nobreak >nul

rmdir /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Alert server\"

rmdir /s /q "%userprofile%\Documents\Alert server"

echo Alert server uninstallation was successful.

timeout /t 1 /nobreak >nul