:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

set folderName=Alert Server
set folderPath=%APPDATA%\Microsoft\Windows\Start Menu\Programs\%folderName%
set shortcutName=Alert Server tray
set shortcutTargetDescription=Run Alert Server minimized to the tray
set targetPath=%CD%\start_alertserver_hidden.bat
set shortcutAltName=Alert Server tray and console
set shortcutAltTargetDescription=Run Alert Server minimized to the tray with access to the console
set targetAltPath=%CD%\start_alertserver_visible.bat
set shortcutUninstallName=Uninstall Alert Server
set shortcutUninstallDescription=Uninstall Alert Server from the system
set uninstallPath=%CD%\start_uninstall.bat
set iconPath=%SystemRoot%\System32\SHELL32.dll,77
set workingDirectory=%CD%

if exist "%folderPath%" (
    rmdir /s /q "%folderPath%"
    if errorlevel 1 (
        echo Failed to remove existing folder "%folderPath%"
        exit /b 1
    )
)

mkdir "%folderPath%"
if errorlevel 1 (
    echo Failed to create folder "%folderPath%"
    exit /b 1
)

powershell -Command "$WScript=New-Object -ComObject WScript.Shell; $Shortcut=$WScript.CreateShortcut('%folderPath%\%shortcutName%.lnk'); $Shortcut.TargetPath='%targetPath%'; $Shortcut.IconLocation='%iconPath%'; $Shortcut.WorkingDirectory='%workingDirectory%'; $Shortcut.Description='%shortcutTargetDescription%'; $Shortcut.WindowStyle=7; $Shortcut.Save()"
if errorlevel 1 (
    echo Failed to create shortcut "%folderPath%\%shortcutName%.lnk"
    exit /b 1
)

powershell -Command "$WScript=New-Object -ComObject WScript.Shell; $Shortcut=$WScript.CreateShortcut('%folderPath%\%shortcutAltName%.lnk'); $Shortcut.TargetPath='%targetAltPath%'; $Shortcut.IconLocation='%iconPath%'; $Shortcut.WorkingDirectory='%workingDirectory%'; $Shortcut.Description='%shortcutAltTargetDescription%'; $Shortcut.WindowStyle=1; $Shortcut.Save()"
if errorlevel 1 (
    echo Failed to create shortcut "%folderPath%\%shortcutAltName%.lnk"
    exit /b 1
)

powershell -Command "$WScript=New-Object -ComObject WScript.Shell; $Shortcut=$WScript.CreateShortcut('%folderPath%\%shortcutUninstallName%.lnk'); $Shortcut.TargetPath='%uninstallPath%'; $Shortcut.IconLocation='%iconPath%'; $Shortcut.WorkingDirectory='%workingDirectory%'; $Shortcut.Arguments='-Verb RunAs'; $Shortcut.Description='%shortcutUninstallDescription%'; $Shortcut.WindowStyle=7; $Shortcut.Save()"
if errorlevel 1 (
    echo Failed to create shortcut "%folderPath%\%shortcutUninstallName%.lnk"
    exit /b 1
)