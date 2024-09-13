:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

taskkill /f /im "node.exe" >nul 2>nul

timeout /t 1 /nobreak >nul

del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Alert Server.lnk"

del /q "%temp%\alertserver*.*"

rmdir /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Alert Server\"

rmdir /s /q "%USERPROFILE%\Documents\Alert_Server"
