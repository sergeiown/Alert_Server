@echo off
set shortcutName=start_alertserver_hidden
set targetPath=%CD%\start_alertserver_hidden.bat
set shortcutPath=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\%shortcutName%.lnk
set iconPath=%SystemRoot%\System32\SHELL32.dll,77

if exist "%shortcutPath%" (
    del "%shortcutPath%"
) else (
    powershell -Command "$WScript=New-Object -ComObject WScript.Shell; $Shortcut=$WScript.CreateShortcut('%shortcutPath%'); $Shortcut.TargetPath='%targetPath%'; $Shortcut.IconLocation='%iconPath%'; $Shortcut.Save()"
)
