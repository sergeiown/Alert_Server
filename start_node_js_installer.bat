@echo off

:: Перевірка наявності Node.js, завантаження та встановлення за необхідності
where node > nul 2>nul

IF %ERRORLEVEL% NEQ 0 (
    
    winget install OpenJS.NodeJS
    
    echo. & timeout /nobreak /t 2 >nul

) ELSE (
    echo Node.js is present in the system.

    call start_alertserver_hidden.bat
)
