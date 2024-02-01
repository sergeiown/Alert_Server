@echo off
setlocal enabledelayedexpansion

echo Enter the full path to the start_hidden.bat file:
set /p bat_path=

:: Перевірка чи файл існує
if not exist "!bat_path!" (
    echo File not found. Please check the path and try again.
    timeout /t 2 /nobreak > nul
    goto :eof
)

:: Додавання до автозапуску
set "startup_folder=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy "!bat_path!" "!startup_folder!"

echo start_hidden.bat successfully added to startup!
pause

:end
