@echo off

:: Перевірка наявності Node.js, завантаження та встановлення за необхідності
where node > nul 2>nul

IF %ERRORLEVEL% NEQ 0 (
    
    :: Завантаження HTML, видобування імені файлу та викачування
    powershell -Command "& { Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest/' -OutFile '%temp%\temp.html' }"

    setlocal enabledelayedexpansion

    set "filename="
    for /f "tokens=2 delims=<>" %%x in ('type %temp%\temp.html ^| find "x64.msi"') do set "filename=%%x"
       
    echo Downloading !filename!
    powershell -Command "& { Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest/!filename!' -OutFile '%temp%\x64.msi' }"
    
    endlocal
   
    :: Інсталяція
    echo Installing Node.js...
    start /wait msiexec /i %temp%\x64.msi /qn /qb! /norestart

    :: Прибирання зайвого
    del %temp%\temp.html /Q 2>nul
    del %temp%\x64.msi /Q 2>nul

    timeout /nobreak /t 1 >nul

) ELSE (
    echo Node.js is present in the system.

    call start_alertserver_hidden.bat
)
