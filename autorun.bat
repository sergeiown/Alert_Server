@echo off
setlocal enabledelayedexpansion

echo Введіть повний шлях до файлу start_hidden.bat:
set /p bat_path=

:: Перевірка чи файл існує
if not exist "!bat_path!" (
    echo Файл не знайдено. Перевірте шлях та спробуйте ще раз.
    timeout /t 2 /nobreak > nul
    goto :eof
)

:: Додавання до автозапуску
set "startup_folder=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy "!bat_path!" "!startup_folder!"

echo start_hidden.bat успішно доданий до автозапуску!
timeout /t 2 /nobreak > nul

:end
