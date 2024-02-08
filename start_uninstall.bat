:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

:: Запит на підвищення привілеїв до адміністратора
taskkill /f /im "node.exe" >nul 2>nul

timeout /t 1 /nobreak >nul

del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Alert server.lnk"

rmdir /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Alert server\"

rmdir /s /q "%USERPROFILE%\Documents\Alert server"