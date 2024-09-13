:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

set shortcutName=Alert Server
set shortcutDescription=Run Alert Server in background
set targetPath=%CD%\start_alertserver_hidden.bat
set shortcutPath=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\%shortcutName%.lnk
set iconPath=%SystemRoot%\System32\SHELL32.dll,77
set workingDirectory=%CD%

if exist "%shortcutPath%" (
    del "%shortcutPath%"
) else (
    powershell -Command "$WScript=New-Object -ComObject WScript.Shell; $Shortcut=$WScript.CreateShortcut('%shortcutPath%'); $Shortcut.TargetPath='%targetPath%'; $Shortcut.IconLocation='%iconPath%'; $Shortcut.WorkingDirectory='%workingDirectory%'; $Shortcut.WindowStyle=7; $Shortcut.Description='%shortcutDescription%'; $Shortcut.Save()"
)


