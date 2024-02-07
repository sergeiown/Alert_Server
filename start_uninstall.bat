:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

taskkill /f /im "node.exe" >nul 2>nul
timeout /t 1 /nobreak >nul

rmdir /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Alert server\"
cd ..
rmdir /s /q "%CD%"
