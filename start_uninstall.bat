:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

rmdir /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Alert server\"

cd ..
rmdir /s /q "%CD%"
