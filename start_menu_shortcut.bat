@echo off
set shortcutName=Alert server
set targetPath=%CD%\start_alertserver_hidden.bat
set shortcutPath=%APPDATA%\Microsoft\Windows\Start Menu\Programs\%shortcutName%.lnk
set iconPath=%SystemRoot%\System32\SHELL32.dll,77
set workingDirectory=%CD%

if exist "%shortcutPath%" (
    exit /b 0
) else (
    powershell -Command "$WScript=New-Object -ComObject WScript.Shell; $Shortcut=$WScript.CreateShortcut('%shortcutPath%'); $Shortcut.TargetPath='%targetPath%'; $Shortcut.IconLocation='%iconPath%'; $Shortcut.WorkingDirectory='%workingDirectory%'; $Shortcut.Save()"
)