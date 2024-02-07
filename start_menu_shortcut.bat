:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off
set shortcutName=Alert server
set targetPath=%CD%\start_alertserver_hidden.bat
set uninstallPath=%CD%\start_uninstall.bat
set folderPath=%APPDATA%\Microsoft\Windows\Start Menu\Programs\%shortcutName%
set iconPath=%SystemRoot%\System32\SHELL32.dll,77
set workingDirectory=%CD%

if exist "%folderPath%" (
    rmdir /s /q "%folderPath%"
)

mkdir "%folderPath%"

powershell -Command "$WScript=New-Object -ComObject WScript.Shell; $Shortcut=$WScript.CreateShortcut('%folderPath%\%shortcutName%.lnk'); $Shortcut.TargetPath='%targetPath%'; $Shortcut.IconLocation='%iconPath%'; $Shortcut.WorkingDirectory='%workingDirectory%'; $Shortcut.Save()"

powershell -Command "$WScript=New-Object -ComObject WScript.Shell; $Shortcut=$WScript.CreateShortcut('%folderPath%\Uninstall.lnk'); $Shortcut.TargetPath='%uninstallPath%'; $Shortcut.IconLocation='%iconPath%'; $Shortcut.WorkingDirectory='%workingDirectory%'; $Shortcut.Save(); $Shortcut = $WScript.CreateShortcut('%folderPath%\Uninstall.lnk'); $Shortcut.TargetPath='%uninstallPath%'; $Shortcut.WorkingDirectory='%workingDirectory%'; $Shortcut.Arguments = '-Verb RunAs'; $Shortcut.Save()"
